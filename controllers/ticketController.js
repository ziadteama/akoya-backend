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

export const sellTickets = async (req, res) => {
  try {
    const { tickets } = req.body; // Expecting an array of { ticket_type_id, quantity }

    if (!tickets || tickets.length === 0) {
      return res.status(400).json({ message: "No tickets selected" });
    }

    const soldTickets = [];

    for (const ticket of tickets) {
      const { ticket_type_id, quantity } = ticket;

      if (!ticket_type_id || !quantity || quantity < 1) {
        return res
          .status(400)
          .json({ message: "Invalid ticket type or quantity" });
      }

      // 🔹 Get the current price of the ticket type
      const priceQuery = "SELECT price FROM ticket_types WHERE id = $1";
      const priceResult = await pool.query(priceQuery, [ticket_type_id]);

      if (priceResult.rows.length === 0) {
        return res
          .status(404)
          .json({ message: `Ticket type ${ticket_type_id} not found` });
      }

      const ticketPrice = priceResult.rows[0].price; // Get the current price

      // 🔹 Insert the ticket with the current price at sale time
      const insertQuery = `
                INSERT INTO tickets (ticket_type_id, status, valid, sold_at, sold_price)
                VALUES ($1, 'sold', true, NOW(), $2)
                RETURNING *;
            `;

      for (let i = 0; i < quantity; i++) {
        const result = await pool.query(insertQuery, [
          ticket_type_id,
          ticketPrice,
        ]);
        soldTickets.push(result.rows[0]);
      }
    }

    res.json({ message: "Tickets sold successfully", soldTickets });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

export const sellTicket = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "UPDATE tickets SET status = $1 WHERE id = $2 RETURNING *",
      ["sold", id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
};

// Get ticket sales report
export const getSalesReport = async (req, res) => {
  const { startDate, endDate } = req.query;
  try {
    const result = await pool.query(
      `SELECT SUM(tt.price) AS total_revenue
             FROM tickets t
             JOIN ticket_types tt ON t.ticket_type_id = tt.id
             WHERE t.status = 'sold'
             AND t.sold_at BETWEEN $1 AND $2`,
      [startDate, endDate]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
};

export const addTicketTypes = async (req, res) => {
  try {
    const { ticketTypes } = req.body; // Expecting an array of ticket objects

    if (!Array.isArray(ticketTypes) || ticketTypes.length === 0) {
      return res
        .status(400)
        .json({ message: "Invalid input: Provide an array of ticket types" });
    }

    const insertedTickets = [];

    for (const ticket of ticketTypes) {
      const { category, subcategory, price, description } = ticket;

      // Validate price
      if (!price || isNaN(price) || price <= 0) {
        return res.status(400).json({
          message: `Invalid price for category ${category} - ${subcategory}`,
        });
      }

      // Insert into ticket_types
      const result = await pool.query(
        `INSERT INTO ticket_types (category, subcategory, price, description) 
                 VALUES ($1, $2, $3, $4) RETURNING *`,
        [category, subcategory, price, description]
      );

      insertedTickets.push(result.rows[0]);
    }

    res.status(201).json({
      message: "Ticket types added successfully",
      ticketTypes: insertedTickets,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

export const updateTicketPrices = async (req, res) => {
  try {
    const { tickets } = req.body; // Expecting an array of { id, price }

    if (!tickets || !Array.isArray(tickets) || tickets.length === 0) {
      return res.status(400).json({ message: "Invalid request format" });
    }

    const queries = [];
    for (const ticket of tickets) {
      const { id, price } = ticket;

      if (!id || !price || price <= 0) {
        return res
          .status(400)
          .json({ message: `Invalid data for ticket ID ${id}` });
      }

      queries.push(
        pool.query(
          `UPDATE ticket_types SET price = $1 WHERE id = $2 RETURNING *`,
          [price, id]
        )
      );
    }

    const results = await Promise.all(queries);
    const updatedTickets = results.map((result) => result.rows[0]);

    res.json({ message: "Prices updated successfully", updatedTickets });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

export const generateTickets = async (req, res) => {
  try {
    const { tickets } = req.body; // Expecting an array of { ticket_type_id, quantity }

    if (!tickets || !Array.isArray(tickets) || tickets.length === 0) {
      return res.status(400).json({ message: "Invalid request format" });
    }

    const generatedTicketIds = [];

    for (const ticket of tickets) {
      const { ticket_type_id, quantity } = ticket;

      if (!ticket_type_id || !quantity || quantity < 1) {
        return res
          .status(400)
          .json({
            message: `Invalid data for ticket type ID ${ticket_type_id}`,
          });
      }

      const insertQuery = `
                INSERT INTO tickets (ticket_type_id, status, valid, sold_at)
                VALUES ($1, 'available', true, NULL)
                RETURNING id;
            `;

      for (let i = 0; i < quantity; i++) {
        const result = await pool.query(insertQuery, [ticket_type_id]);
        generatedTicketIds.push(result.rows[0].id);
      }
    }

    res.json({ message: "Tickets generated successfully", generatedTicketIds });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

export const markTicketAsSold = async (req, res) => {
  const { id } = req.params;

  try {
    // Check ticket status
    const checkQuery = `SELECT status, valid FROM tickets WHERE id = $1`;
    const checkResult = await pool.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    const { status, valid } = checkResult.rows[0];

    if (status === "sold") {
      return res.status(400).json({ message: "Ticket is already sold" });
    }

    if (!valid) {
      return res.status(400).json({ message: "Ticket is not valid" });
    }

    // Mark the ticket as sold
    const updateQuery = `
            UPDATE tickets 
            SET status = 'sold' 
            WHERE id = $1 
            RETURNING *;
        `;
    const updateResult = await pool.query(updateQuery, [id]);

    res.json({
      message: "Ticket marked as sold",
      ticket: updateResult.rows[0],
    });
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
            return res.status(400).json({ message: "Invalid request. Provide an array of ticket IDs." });
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
            return res.status(404).json({ message: "No valid tickets were refunded. Ensure tickets are sold." });
        }

        res.json({ message: "Refund successful", refundedTickets: result.rows });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
};
