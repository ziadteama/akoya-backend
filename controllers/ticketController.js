import pool from "../db.js";


export const getAllTickets = async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM tickets");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
};

export const getAllTicketTypes = async (req, res) => {
  try {
    const { archived } = req.query;

    let query = "SELECT * FROM ticket_types";
    let values = [];

    if (archived !== undefined) {
      query += " WHERE archived = $1";
      values.push(archived === "true");
    }

    query += " ORDER BY id";

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
};


export const sellTickets = async (req, res) => {
  try {
    const { tickets = [], user_id, description, payments, meals = [] } = req.body;

    if (!user_id) {
      return res.status(400).json({ message: "Missing user ID" });
    }

    if (!Array.isArray(payments) || payments.length === 0) {
      return res.status(400).json({ message: "Missing payments" });
    }

    const round = (num) => Math.round(num * 100) / 100;

    // 🎟 Tickets
    let validTickets = [];
    let ticketTotal = 0;
    if (Array.isArray(tickets) && tickets.length > 0) {
      const ticketTypeIds = tickets.map((t) => t.ticket_type_id);
      const ticketQuery = `SELECT id, price FROM ticket_types WHERE id = ANY($1)`;
      const { rows: ticketRows } = await pool.query(ticketQuery, [ticketTypeIds]);
      const ticketPriceMap = new Map(ticketRows.map((row) => [row.id, parseFloat(row.price)]));

      validTickets = tickets
        .filter(({ ticket_type_id, quantity }) => ticketPriceMap.has(ticket_type_id) && quantity > 0)
        .flatMap(({ ticket_type_id, quantity }) =>
          Array(quantity).fill([
            ticket_type_id,
            "sold",
            true,
            new Date(),
            ticketPriceMap.get(ticket_type_id),
          ])
        );

      ticketTotal = round(validTickets.reduce((sum, row) => sum + Number(row[4]), 0));
    }

    // 🍽️ Meals
    let validMeals = [];
    let mealTotal = 0;
    if (Array.isArray(meals) && meals.length > 0) {
      const mealIds = meals.map((m) => m.meal_id);
      const mealQuery = `SELECT id, price FROM meals WHERE id = ANY($1)`;
      const { rows: mealRows } = await pool.query(mealQuery, [mealIds]);
      const mealPriceMap = new Map(mealRows.map((row) => [row.id, parseFloat(row.price)]));

      validMeals = meals
        .filter(({ meal_id, quantity }) => mealPriceMap.has(meal_id) && quantity > 0)
        .map(({ meal_id, quantity }) => ({
          meal_id,
          quantity,
          price: mealPriceMap.get(meal_id),
        }));

      mealTotal = round(validMeals.reduce((sum, m) => sum + m.quantity * m.price, 0));
    }

    if (validTickets.length === 0 && validMeals.length === 0) {
      return res.status(400).json({ message: "No valid tickets or meals to sell" });
    }

    // First calculation of discount amount - keep this one
    const grossTotal = round(ticketTotal + mealTotal);
    const discountAmount = round(
      payments.find((p) => p.method === "discount")?.amount || 0
    );
    const finalTotal = round(grossTotal - discountAmount);

    // 💳 Validate payments (excluding discount)
    const paidAmount = round(
      payments
        .filter((p) => p.method !== "discount")
        .reduce((sum, p) => sum + Number(p.amount), 0)
    );

    if (paidAmount !== finalTotal) {
      return res.status(400).json({
        message: `Paid amount (${paidAmount}) must match final total (${finalTotal})`,
      });
    }

    // 🧾 Insert order with default total (will be updated by trigger)
    const orderInsertQuery = `
      INSERT INTO orders (user_id, description)
      VALUES ($1, $2)
      RETURNING id;
    `;
    const { rows: orderRows } = await pool.query(orderInsertQuery, [
      user_id,
      description || null,
    ]);
    const order_id = orderRows[0].id;

    // 🎟 Insert tickets
    if (validTickets.length > 0) {
      const ticketValues = validTickets.map((row) => [...row, order_id]);
      const ticketInsertQuery = `
        INSERT INTO tickets (ticket_type_id, status, valid, sold_at, sold_price, order_id)
        SELECT * FROM UNNEST(
          $1::int[], $2::text[], $3::boolean[], $4::timestamptz[], $5::numeric[], $6::int[]
        )
      `;
      await pool.query(ticketInsertQuery, [
        ticketValues.map((r) => r[0]),
        ticketValues.map((r) => r[1]),
        ticketValues.map((r) => r[2]),
        ticketValues.map((r) => r[3]),
        ticketValues.map((r) => r[4]),
        ticketValues.map((r) => r[5]),
      ]);
    }

    // 🍽️ Insert meals
    if (validMeals.length > 0) {
      const mealInsertQuery = `
        INSERT INTO order_meals (order_id, meal_id, quantity, price_at_order)
        SELECT * FROM UNNEST($1::int[], $2::int[], $3::int[], $4::numeric[])
      `;
      await pool.query(mealInsertQuery, [
        validMeals.map(() => order_id),
        validMeals.map((m) => m.meal_id),
        validMeals.map((m) => m.quantity),
        validMeals.map((m) => m.price),
      ]);
    }

    // 💵 Insert payments (including discount)
    const paymentInsertQuery = `
      INSERT INTO payments (order_id, method, amount)
      SELECT * FROM UNNEST($1::int[], $2::payment_method[], $3::numeric[])
    `;
    await pool.query(paymentInsertQuery, [
      payments.map(() => order_id),
      payments.map((p) => p.method),
      payments.map((p) => p.amount),
    ]);

    // Get the updated order with correctly calculated totals
    const orderQuery = `
      SELECT id, total_amount, gross_total
      FROM orders
      WHERE id = $1;
    `;
    const { rows: updatedOrder } = await pool.query(orderQuery, [order_id]);
    
    // CHANGE THIS LINE - Use a different variable name
    // Instead of:
    // const discountAmount = payments...
    
    // Use this:
    const reportedDiscountAmount = payments
      .filter(p => p.method === "discount")
      .reduce((sum, p) => sum + Number(p.amount), 0);

    res.json({
      message: "Checkout completed with discount support",
      order_id,
      grossTotal: updatedOrder[0].gross_total,
      discountAmount: reportedDiscountAmount, // Use the new variable name
      finalTotal: updatedOrder[0].total_amount,
    });
  } catch (err) {
    console.error("❌ sellTickets error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

  export const getTicketsByDate = async (req, res) => {
  try {
    const { date } = req.query;

    // Ensure date is provided
    if (!date) {
      return res
        .status(400)
        .json({ error: "Please provide a valid date (YYYY-MM-DD)." });
    }

    const query = `
      SELECT 
          tt.category, 
          tt.subcategory, 
          COUNT(t.id) AS total_tickets, 
          SUM(t.sold_price) AS total_revenue
      FROM tickets t
      JOIN ticket_types tt ON t.ticket_type_id = tt.id
      WHERE t.valid = TRUE 
      AND t.status = 'sold' 
      AND DATE(t.sold_at) = $1
      GROUP BY tt.category, tt.subcategory;
    `;

    const { rows } = await pool.query(query, [date]);

    return res.status(200).json(rows);
  } catch (error) {
    console.error("Error fetching tickets by date:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const getTicketsBetweenDates = async (req, res) => {
  try {
    let { startDate, endDate } = req.query;

    // Ensure both dates are provided
    if (!startDate || !endDate) {
      return res
        .status(400)
        .json({ error: "Please provide both startDate and endDate" });
    }

    // Validate date format
    if (isNaN(new Date(startDate)) || isNaN(new Date(endDate))) {
      return res
        .status(400)
        .json({ error: "Invalid date format. Use YYYY-MM-DD." });
    }

    const query = `
      SELECT 
          tt.category, 
          tt.subcategory, 
          COUNT(t.id) AS total_tickets, 
          SUM(t.sold_price) AS total_revenue
      FROM tickets t
      JOIN ticket_types tt ON t.ticket_type_id = tt.id
      WHERE t.valid = TRUE 
      AND t.status = 'sold' 
      AND DATE(t.sold_at) BETWEEN $1::date AND $2::date
      GROUP BY tt.category, tt.subcategory;
    `;

    const { rows } = await pool.query(query, [startDate, endDate]);

    return res.status(200).json(rows);
  } catch (error) {
    console.error("Error fetching tickets:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};


export const addTicketTypes = async (req, res) => {
  try {
    const { ticketTypes } = req.body;

    if (!Array.isArray(ticketTypes) || ticketTypes.length === 0) {
      return res
        .status(400)
        .json({ message: "Provide an array of ticket types" });
    }

    const categories = [];
    const subcategories = [];
    const prices = [];
    const descriptions = [];

    for (const ticket of ticketTypes) {
      const { category, subcategory, price, description } = ticket;

      if (!price || isNaN(price) || price <= 0) {
        return res
          .status(400)
          .json({ message: `Invalid price for ${category} - ${subcategory}` });
      }

      categories.push(category);
      subcategories.push(subcategory);
      prices.push(price);
      descriptions.push(description);
    }

    const query = `
      INSERT INTO ticket_types (category, subcategory, price, description)
      SELECT * FROM UNNEST($1::text[], $2::text[], $3::numeric[], $4::text[])
      ON CONFLICT (category, subcategory) DO NOTHING
      RETURNING *;
    `;

    const result = await pool.query(query, [
      categories,
      subcategories,
      prices,
      descriptions,
    ]);

    res.status(201).json({
      message: "Ticket types added successfully",
      ticketTypes: result.rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

export const updateTicketPrices = async (req, res) => {
  try {
    const { tickets } = req.body;

    if (!Array.isArray(tickets) || tickets.length === 0) {
      return res.status(400).json({ message: "Invalid request format" });
    }

    const validTickets = tickets.filter(({ id, price }) => id && price > 0);
    if (validTickets.length === 0) {
      return res.status(400).json({ message: "No valid tickets to update" });
    }

    const ids = validTickets.map((ticket) => ticket.id);
    const prices = validTickets.map((ticket) => ticket.price);

    const query = `
      UPDATE ticket_types AS tt
      SET price = new_data.price
      FROM (SELECT UNNEST($1::int[]) AS id, UNNEST($2::numeric[]) AS price) AS new_data
      WHERE tt.id = new_data.id
      RETURNING tt.*;
    `;

    const result = await pool.query(query, [ids, prices]);

    res.json({
      message: "Prices updated successfully",
      updatedTickets: result.rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

export const generateTickets = async (req, res) => {
  try {
    const { tickets } = req.body;

    if (!Array.isArray(tickets) || tickets.length === 0) {
      return res.status(400).json({ message: "Invalid request format" });
    }

    const validTickets = tickets
      .filter(({ ticket_type_id, quantity }) => ticket_type_id && quantity > 0)
      .flatMap(({ ticket_type_id, quantity }) =>
        Array(quantity).fill([ticket_type_id, "available", true, null])
      );

    if (validTickets.length === 0) {
      return res.status(400).json({ message: "No valid tickets to generate" });
    }

    const query = `
      WITH new_tickets AS (
        SELECT 
          UNNEST($1::int[]) AS ticket_type_id,
          UNNEST($2::text[]) AS status,
          UNNEST($3::boolean[]) AS valid,
          UNNEST($4::timestamptz[]) AS sold_at
      )
      INSERT INTO tickets (ticket_type_id, status, valid, sold_at)
      SELECT ticket_type_id, status, valid, sold_at
      FROM new_tickets
      RETURNING id;
    `;

    const result = await pool.query(query, [
      validTickets.map((row) => row[0]),
      validTickets.map((row) => row[1]),
      validTickets.map((row) => row[2]),
      validTickets.map((row) => row[3]),
    ]);

    res.json({
      message: "Tickets generated successfully",
      generatedTicketIds: result.rows.map((row) => row.id),
    });
  } catch (error) {
    console.error("Error generating tickets:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Checkout existing tickets by ID
 * @route POST /api/tickets/checkout-existing
 * @access Private
 */
export const checkoutExistingTickets = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { ticket_ids, user_id, description, payments, meals } = req.body;
    
    if (!ticket_ids || !Array.isArray(ticket_ids) || ticket_ids.length === 0) {
      return res.status(400).json({ message: "No ticket IDs provided" });
    }
    
    if (!payments || !Array.isArray(payments) || payments.length === 0) {
      return res.status(400).json({ message: "Payment information required" });
    }
    
    // Verify all tickets exist and are available
    const ticketsResult = await client.query(
      `SELECT id, ticket_type_id, status FROM tickets WHERE id = ANY($1)`,
      [ticket_ids]
    );
    
    if (ticketsResult.rows.length !== ticket_ids.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: "One or more tickets not found" });
    }
    
    const unavailableTickets = ticketsResult.rows.filter(t => t.status !== 'available');
    if (unavailableTickets.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        message: `Tickets not available: ${unavailableTickets.map(t => t.id).join(', ')}` 
      });
    }
    
    // Get ticket prices
    const ticketTypesResult = await client.query(
      `SELECT tt.id, tt.price, t.id as ticket_id 
       FROM ticket_types tt
       JOIN tickets t ON t.ticket_type_id = tt.id
       WHERE t.id = ANY($1)`,
      [ticket_ids]
    );
    
    // Calculate total
    const total = ticketTypesResult.rows.reduce((sum, row) => sum + parseFloat(row.price || 0), 0);
    
    // Create order
    const orderResult = await client.query(
      `INSERT INTO orders (total_amount, gross_total, user_id, description) 
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [total, total, user_id || null, description || '']
    );
    
    const orderId = orderResult.rows[0].id;
    
    // Mark tickets as sold
    await client.query(
      `UPDATE tickets 
       SET status = 'sold', 
           order_id = $1, 
           sold_at = CURRENT_TIMESTAMP, 
           sold_price = (
             SELECT price FROM ticket_types 
             WHERE id = tickets.ticket_type_id
           )
       WHERE id = ANY($2)`,
      [orderId, ticket_ids]
    );
    
    // Add payments
    for (const payment of payments) {
      await client.query(
        `INSERT INTO payments (order_id, method, amount) VALUES ($1, $2, $3)`,
        [orderId, payment.method, payment.amount]
      );
    }
    
    // Add meals if any
    if (meals && Array.isArray(meals) && meals.length > 0) {
      for (const meal of meals) {
        await client.query(
          `INSERT INTO order_meals (order_id, meal_id, quantity, price_at_order) 
           VALUES ($1, $2, $3, $4)`,
          [orderId, meal.meal_id, meal.quantity, meal.price_at_order]
        );
      }
    }
    
    await client.query('COMMIT');
    res.status(200).json({ 
      success: true, 
      message: "Tickets sold successfully", 
      order_id: orderId 
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error selling tickets:", error);
    res.status(500).json({ message: "Server error: " + error.message });
  } finally {
    client.release();
  }
};

export const getTicketsByUser = async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await pool.query(
      `SELECT 
          t.id, t.status, t.valid, t.sold_at, t.sold_price, t.created_at,
          tt.id AS ticket_type_id, tt.category, tt.subcategory, tt.description
       FROM tickets t
       LEFT JOIN ticket_types tt ON t.ticket_type_id = tt.id
       WHERE t.user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No tickets found for this user" });
    }

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

export const updateTicketValidation = async (req, res) => {
  const { tickets, valid } = req.body; // Expecting an array of ticket IDs and the new validity status

  if (!Array.isArray(tickets) || tickets.length === 0) {
    return res.status(400).json({ message: "No tickets provided" });
  }

  try {
    // Get current validation statuses of the provided ticket IDs
    const checkQuery = `
            SELECT id, valid 
            FROM tickets 
            WHERE id = ANY($1);
        `;
    const checkResult = await pool.query(checkQuery, [tickets]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: "No matching tickets found" });
    }

    let alreadyInState = [];
    let toUpdate = [];

    // Filter tickets based on their current state
    checkResult.rows.forEach((ticket) => {
      if (ticket.valid === valid) {
        alreadyInState.push(ticket.id);
      } else {
        toUpdate.push(ticket.id);
      }
    });

    if (toUpdate.length > 0) {
      // Update only the tickets that need to change
      const updateQuery = `
                UPDATE tickets 
                SET valid = $1 
                WHERE id = ANY($2) 
                RETURNING *;
            `;
      const updateResult = await pool.query(updateQuery, [valid, toUpdate]);

      res.json({
        message: `Successfully updated ${updateResult.rowCount} tickets`,
        updatedTickets: updateResult.rows,
        alreadyInState: alreadyInState.length > 0 ? alreadyInState : null,
      });
    } else {
      // No tickets needed updating
      res.json({
        message:
          "No tickets were updated as they were already in the requested state",
        alreadyInState,
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};
export const getTicketById = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT 
          t.id, t.status, t.valid, t.sold_at, t.sold_price, t.created_at,
          tt.id AS ticket_type_id, tt.category, tt.subcategory, tt.description
       FROM tickets t
       LEFT JOIN ticket_types tt ON t.ticket_type_id = tt.id
       WHERE t.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

export const refundTickets = async (req, res) => {
  try {
    const { ticketIds } = req.body; // Expecting an array of ticket IDs

    if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
      return res
        .status(400)
        .json({ message: "Invalid request. Provide an array of ticket IDs." });
    }

    // Execute the bulk update query
    const result = await pool.query(
      `UPDATE tickets 
             SET status = 'available', sold_at = NULL, sold_price = NULL 
             WHERE id = ANY($1) AND status = 'sold'
             RETURNING id;`,
      [ticketIds]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "No valid tickets were refunded. Ensure tickets are sold.",
      });
    }

    res.json({ message: "Refund successful", refundedTickets: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

export const updateTicketTypeArchiveStatus = async (req, res) => {
  try {
    const { category, archived } = req.body;

    if (!category || typeof archived !== "boolean") {
      return res.status(400).json({
        message: "Both 'category' and boolean 'archived' status are required.",
      });
    }

    const query = `
      UPDATE ticket_types
      SET archived = $1
      WHERE category = $2
      RETURNING *;
    `;

    const { rows } = await pool.query(query, [archived, category]);

    if (rows.length === 0) {
      return res.status(404).json({ message: "Category not found." });
    }

    res.json({
      message: `Category '${category}' archive status updated successfully.`,
      updatedTicketTypes: rows,
    });
  } catch (error) {
    console.error("Error updating archive status:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const assignTicketTypesById = async (req, res) => {
  const { assignments } = req.body;

  // Validate input
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return res.status(400).json({ message: "Provide a list of ticket assignments" });
  }

  // Validate each assignment
  for (const entry of assignments) {
    if (
      !entry.id ||
      !entry.ticket_type_id ||
      typeof entry.id !== "number" ||
      typeof entry.ticket_type_id !== "number"
    ) {
      return res.status(400).json({
        message: `Invalid assignment entry: ${JSON.stringify(entry)}`
      });
    }
  }

  try {
    const ids = assignments.map(a => a.id);
    const typeIds = assignments.map(a => a.ticket_type_id);

    const query = `
      UPDATE tickets AS t
      SET ticket_type_id = a.ticket_type_id
      FROM (
        SELECT UNNEST($1::int[]) AS id,
               UNNEST($2::int[]) AS ticket_type_id
      ) AS a
      WHERE t.id = a.id
      RETURNING *;
    `;

    const { rows } = await pool.query(query, [ids, typeIds]);

    if (rows.length === 0) {
      return res.status(404).json({ message: "No tickets updated" });
    }

    res.json({
      message: "Ticket types assigned successfully",
      updated: rows
    });
  } catch (error) {
    console.error("Error assigning ticket types:", error);
    res.status(500).json({ message: "Server error" });
  }
};

