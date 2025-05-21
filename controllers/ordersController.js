import pool from "../db.js";

export const getOrdersByDate = async (req, res) => {
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ error: "Please provide a date (YYYY-MM-DD)" });
  }

  try {
    const query = `
      SELECT 
        o.id AS order_id,
        o.user_id,
        u.name AS user_name,
        o.created_at,
        o.total_amount,
        o.description,

        (
          SELECT json_agg(ticket_summary)
          FROM (
            SELECT 
              tt.id AS ticket_type_id,
              tt.category,
              tt.subcategory,
              t.sold_price,
              COUNT(*) AS quantity
            FROM tickets t
            JOIN ticket_types tt ON t.ticket_type_id = tt.id
            WHERE t.order_id = o.id
            GROUP BY tt.id, tt.category, tt.subcategory, t.sold_price
          ) AS ticket_summary
        ) AS tickets,

        json_agg(
          DISTINCT jsonb_build_object(
            'meal_id', m.id,
            'name', m.name,
            'quantity', om.quantity,
            'price_at_order', om.price_at_order
          )
        ) FILTER (WHERE om.id IS NOT NULL) AS meals,

        (
          SELECT json_agg(jsonb_build_object('method', p.method, 'amount', p.amount))
          FROM payments p
          WHERE p.order_id = o.id
        ) AS payments

      FROM orders o
      JOIN users u ON o.user_id = u.id
      LEFT JOIN order_meals om ON o.id = om.order_id
      LEFT JOIN meals m ON om.meal_id = m.id
      WHERE DATE(o.created_at) = $1
      GROUP BY o.id, u.name
      ORDER BY o.created_at DESC;
    `;

    const { rows } = await pool.query(query, [date]);
    res.json(rows);
  } catch (error) {
    console.error("Error fetching orders by date:", error);
    res.status(500).json({ error: "Server error" });
  }
};


export const getOrdersBetweenDates = async (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: "Provide both startDate and endDate" });
  }

  try {
    const query = `
      SELECT 
        o.id AS order_id,
        o.user_id,
        u.name AS user_name,
        o.created_at,
        o.total_amount,
        o.description,

        (
          SELECT json_agg(ticket_summary)
          FROM (
            SELECT 
              tt.id AS ticket_type_id,
              tt.category,
              tt.subcategory,
              t.sold_price,
              COUNT(*) AS quantity
            FROM tickets t
            JOIN ticket_types tt ON t.ticket_type_id = tt.id
            WHERE t.order_id = o.id
            GROUP BY tt.id, tt.category, tt.subcategory, t.sold_price
          ) AS ticket_summary
        ) AS tickets,

        json_agg(
          DISTINCT jsonb_build_object(
            'meal_id', m.id,
            'name', m.name,
            'quantity', om.quantity,
            'price_at_order', om.price_at_order
          )
        ) FILTER (WHERE om.id IS NOT NULL) AS meals,

        (
          SELECT json_agg(jsonb_build_object('method', p.method, 'amount', p.amount))
          FROM payments p
          WHERE p.order_id = o.id
        ) AS payments

      FROM orders o
      JOIN users u ON o.user_id = u.id
      LEFT JOIN order_meals om ON o.id = om.order_id
      LEFT JOIN meals m ON om.meal_id = m.id
      WHERE DATE(o.created_at) BETWEEN $1::date AND $2::date
      GROUP BY o.id, u.name
      ORDER BY o.created_at DESC;
    `;

    const { rows } = await pool.query(query, [startDate, endDate]);
    res.json(rows);
  } catch (error) {
    console.error("Error fetching orders by range:", error);
    res.status(500).json({ error: "Server error" });
  }
};

