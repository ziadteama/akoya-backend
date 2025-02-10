import pool from '../db.js';

export const getAllTickets = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM tickets');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
};

export const sellTickets = async (req, res) => {
    try {
        const { tickets } = req.body; // Expecting an array of { ticket_type_id, quantity }

        if (!tickets || tickets.length === 0) {
            return res.status(400).json({ message: 'No tickets selected' });
        }

        const soldTickets = [];

        for (const ticket of tickets) {
            const { ticket_type_id, quantity } = ticket;

            if (!ticket_type_id || !quantity || quantity < 1) {
                return res.status(400).json({ message: 'Invalid ticket type or quantity' });
            }

            // 🔹 Get the current price of the ticket type
            const priceQuery = 'SELECT price FROM ticket_types WHERE id = $1';
            const priceResult = await pool.query(priceQuery, [ticket_type_id]);

            if (priceResult.rows.length === 0) {
                return res.status(404).json({ message: `Ticket type ${ticket_type_id} not found` });
            }

            const ticketPrice = priceResult.rows[0].price; // Get the current price

            // 🔹 Insert the ticket with the current price at sale time
            const insertQuery = `
                INSERT INTO tickets (ticket_type_id, status, valid, sold_at, sold_price)
                VALUES ($1, 'sold', true, NOW(), $2)
                RETURNING *;
            `;

            for (let i = 0; i < quantity; i++) {
                const result = await pool.query(insertQuery, [ticket_type_id, ticketPrice]);
                soldTickets.push(result.rows[0]);
            }
        }

        res.json({ message: 'Tickets sold successfully', soldTickets });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};


export const sellTicket = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            'UPDATE tickets SET status = $1 WHERE id = $2 RETURNING *',
            ['sold', id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
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
        res.status(500).send('Server error');
    }
};

export const addTicketTypes = async (req, res) => {
    try {
        const { ticketTypes } = req.body; // Expecting an array of ticket objects

        if (!Array.isArray(ticketTypes) || ticketTypes.length === 0) {
            return res.status(400).json({ message: "Invalid input: Provide an array of ticket types" });
        }

        const insertedTickets = [];

        for (const ticket of ticketTypes) {
            const { category, subcategory, price, description } = ticket;

           
            // Validate price
            if (!price || isNaN(price) || price <= 0) {
                return res.status(400).json({ message: `Invalid price for category ${category} - ${subcategory}` });
            }

            // Insert into ticket_types 
            const result = await pool.query(
                `INSERT INTO ticket_types (category, subcategory, price, description) 
                 VALUES ($1, $2, $3, $4) RETURNING *`,
                [category, subcategory, price, description]
            );

            insertedTickets.push(result.rows[0]);
        }

        res.status(201).json({ message: "Ticket types added successfully", ticketTypes: insertedTickets });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
};


