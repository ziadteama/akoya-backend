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

    const ticketTypeIds = tickets.map(ticket => ticket.ticket_type_id);
    const priceQuery = `SELECT id, price FROM ticket_types WHERE id = ANY($1)`;
    const priceResult = await pool.query(priceQuery, [ticketTypeIds]);

    if (priceResult.rows.length === 0) {
      return res.status(404).json({ message: "No valid ticket types found" });
    }

    const priceMap = new Map(priceResult.rows.map(row => [row.id, row.price]));

    const values = [];
    const params = [];
    let paramIndex = 1;

    tickets.forEach(({ ticket_type_id, quantity }) => {
      const ticketPrice = priceMap.get(ticket_type_id);
      if (!ticketPrice) {
        return res.status(404).json({ message: `Ticket type ${ticket_type_id} not found` });
      }

      for (let i = 0; i < quantity; i++) {
        values.push(`($${paramIndex}, 'sold', true, NOW(), $${paramIndex + 1})`);
        params.push(ticket_type_id, ticketPrice);
        paramIndex += 2;
      }
    });

    if (values.length === 0) {
      return res.status(400).json({ message: "No valid tickets to sell" });
    }

    const query = `
      INSERT INTO tickets (ticket_type_id, status, valid, sold_at, sold_price)
      VALUES ${values.join(", ")}
      RETURNING *;
    `;

    const result = await pool.query(query, params);

    res.json({ message: "Tickets sold successfully", soldTickets: result.rows });
  } catch (error) {
    console.error("Error selling tickets:", error);
    res.status(500).json({ message: "Server error" });
  }
};




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

    const values = [];
    const params = [];
    let paramIndex = 1; // Start parameter index for PostgreSQL ($1, $2...)

    tickets.forEach(({ ticket_type_id, quantity }) => {
      if (!ticket_type_id || !quantity || quantity < 1) {
        return res
          .status(400)
          .json({ message: `Invalid data for ticket type ID ${ticket_type_id}` });
      }
      for (let i = 0; i < quantity; i++) {
        values.push(`($${paramIndex}, 'available', true, NULL)`);
        params.push(ticket_type_id);
        paramIndex++;
      }
    });

    if (values.length === 0) {
      return res.status(400).json({ message: "No valid tickets to insert" });
    }

    const query = `
      INSERT INTO tickets (ticket_type_id, status, valid, sold_at)
      VALUES ${values.join(", ")}
      RETURNING id;
    `;

    const result = await pool.query(query, params);
    const generatedTicketIds = result.rows.map(row => row.id);

    res.json({ message: "Tickets generated successfully", generatedTicketIds });
  } catch (error) {
    console.error("Error generating tickets:", error);
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
