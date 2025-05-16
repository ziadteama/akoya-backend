import pool from "../db.js";
import bcrypt from "bcrypt";

export const loginUser = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Check if both fields are provided
    if (!username || !password) {
      return res
        .status(400)
        .json({ message: "Username and password are required" });
    }

    // Fetch user details from the database
    const query = `SELECT id, name, username, password_hash, role FROM users WHERE username = $1`;
    const result = await pool.query(query, [username]);

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const user = result.rows[0];

    // Compare the provided password with the stored hash
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    // If credentials are valid, return the user role
    res.json({
      message: "Login successful",
      role: user.role,
      name: user.name,
      user_id: user.user_id,
      id: user.id,
    });
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

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
    const { tickets, user_id, description, payments } = req.body;

    if (!user_id || !Array.isArray(tickets) || tickets.length === 0) {
      return res.status(400).json({ message: "Missing user ID or ticket list" });
    }

    if (!Array.isArray(payments) || payments.length === 0) {
      return res.status(400).json({ message: "Missing payments" });
    }

    const ticketTypeIds = tickets.map((t) => t.ticket_type_id);
    const priceQuery = `SELECT id, price FROM ticket_types WHERE id = ANY($1)`;
    const { rows: priceRows } = await pool.query(priceQuery, [ticketTypeIds]);

    if (priceRows.length === 0) {
      return res.status(404).json({ message: "No valid ticket types found" });
    }

    const priceMap = new Map(priceRows.map((row) => [row.id, row.price]));

    const validTickets = tickets
      .filter(({ ticket_type_id, quantity }) => priceMap.has(ticket_type_id) && quantity > 0)
      .flatMap(({ ticket_type_id, quantity }) =>
        Array(quantity).fill([
          ticket_type_id,
          "sold",
          true,
          new Date(),
          priceMap.get(ticket_type_id),
        ])
      );

    if (validTickets.length === 0) {
      return res.status(400).json({ message: "No valid tickets to sell" });
    }

    // Utility: round to 2 decimals
    const round = (num) => Math.round(num * 100) / 100;

    // Calculate total amount from ticket prices
    const totalAmount = round(validTickets.reduce((sum, row) => sum + Number(row[4]), 0));

    // Validate payments
    const totalPaid = round(payments.reduce((sum, p) => sum + Number(p.amount), 0));
    const hasPostponed = payments.some((p) => p.method === "postponed");

    if (hasPostponed && payments.length > 1) {
      return res.status(400).json({ message: "'Postponed' must be the only payment method" });
    }

    if (totalPaid !== totalAmount) {
      return res.status(400).json({
        message: `Total payments (${totalPaid}) must equal ticket total (${totalAmount})`
      });
    }

    // Create order with total_amount
    const orderInsertQuery = `
      INSERT INTO orders (user_id, description, total_amount)
      VALUES ($1, $2, $3)
      RETURNING id;
    `;
    const { rows: orderRows } = await pool.query(orderInsertQuery, [
      user_id,
      description || null,
      totalAmount,
    ]);
    const order_id = orderRows[0].id;

    // Add order_id to tickets
    const ticketValues = validTickets.map((row) => [...row, order_id]);

    // Insert tickets
    const insertQuery = `
      INSERT INTO tickets (ticket_type_id, status, valid, sold_at, sold_price, order_id)
      SELECT * FROM UNNEST(
        $1::int[], $2::text[], $3::boolean[], $4::timestamptz[], $5::numeric[], $6::int[]
      )
      RETURNING *;
    `;
    const result = await pool.query(insertQuery, [
      ticketValues.map((row) => row[0]),
      ticketValues.map((row) => row[1]),
      ticketValues.map((row) => row[2]),
      ticketValues.map((row) => row[3]),
      ticketValues.map((row) => row[4]),
      ticketValues.map((row) => row[5]),
    ]);

    // Insert payments
    const paymentInsertQuery = `
      INSERT INTO payments (order_id, method, amount)
      SELECT * FROM UNNEST($1::int[], $2::payment_method[], $3::numeric[])
      RETURNING *;
    `;
    await pool.query(paymentInsertQuery, [
      payments.map(() => order_id),
      payments.map((p) => p.method),
      payments.map((p) => p.amount),
    ]);

    res.json({
      message: "Tickets sold and payments recorded",
      order_id,
      soldTickets: result.rows,
    });
  } catch (error) {
    console.error("Error selling tickets:", error);
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
      AND t.sold_at BETWEEN $1 AND $2
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

export const markTicketAsSold = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res
        .status(400)
        .json({ message: "Please provide an array of ticket IDs." });
    }

    // Check current ticket statuses
    const checkQuery = `
      SELECT id, status, valid FROM tickets WHERE id = ANY($1)
    `;
    const checkResult = await pool.query(checkQuery, [ids]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: "No matching tickets found." });
    }

    const validIdsToSell = checkResult.rows
      .filter((ticket) => ticket.status !== "sold" && ticket.valid)
      .map((ticket) => ticket.id);

    if (validIdsToSell.length === 0) {
      return res.status(400).json({
        message:
          "No valid tickets available for selling (all tickets already sold or invalid).",
      });
    }

    // Mark valid tickets as sold
    const updateQuery = `
      UPDATE tickets
      SET status = 'sold', sold_at = NOW()
      WHERE id = ANY($1)
      RETURNING *;
    `;

    const updateResult = await pool.query(updateQuery, [validIdsToSell]);

    res.json({
      message: `${updateResult.rowCount} ticket(s) marked as sold.`,
      soldTickets: updateResult.rows,
      skippedTickets: ids.filter((id) => !validIdsToSell.includes(id)),
    });
  } catch (error) {
    console.error("Error marking tickets as sold:", error);
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
      `SELECT t.id, t.status, t.valid, t.sold_at, t.sold_price, t.created_at,
                    tt.id AS ticket_type_id, tt.category, tt.subcategory, tt.description
             FROM tickets t
             JOIN ticket_types tt ON t.ticket_type_id = tt.id
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
