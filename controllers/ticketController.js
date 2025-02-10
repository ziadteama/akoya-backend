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
  
        const insertQuery = `
          INSERT INTO tickets (ticket_type_id, status, valid, sold_at)
          VALUES ($1, 'sold', true, NOW())
          RETURNING *;
        `;
  
        for (let i = 0; i < quantity; i++) {
          const result = await pool.query(insertQuery, [ticket_type_id]);
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

