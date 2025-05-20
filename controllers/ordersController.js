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
        json_agg(
          DISTINCT jsonb_build_object(
            'ticket_type_id', tt.id,
            'category', tt.category,
            'subcategory', tt.subcategory,
            'sold_price', t.sold_price
          )
        ) FILTER (WHERE t.id IS NOT NULL) AS tickets,
        json_agg(
          DISTINCT jsonb_build_object(
            'meal_id', m.id,
            'name', m.name,
            'quantity', om.quantity,
            'price_at_order', om.price_at_order
          )
        ) FILTER (WHERE om.id IS NOT NULL) AS meals
      FROM orders o
      JOIN users u ON o.user_id = u.id
      LEFT JOIN tickets t ON o.id = t.order_id
      LEFT JOIN ticket_types tt ON t.ticket_type_id = tt.id
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
        json_agg(
          DISTINCT jsonb_build_object(
            'ticket_type_id', tt.id,
            'category', tt.category,
            'subcategory', tt.subcategory,
            'sold_price', t.sold_price
          )
        ) FILTER (WHERE t.id IS NOT NULL) AS tickets,
        json_agg(
          DISTINCT jsonb_build_object(
            'meal_id', m.id,
            'name', m.name,
            'quantity', om.quantity,
            'price_at_order', om.price_at_order
          )
        ) FILTER (WHERE om.id IS NOT NULL) AS meals
      FROM orders o
      JOIN users u ON o.user_id = u.id
      LEFT JOIN tickets t ON o.id = t.order_id
      LEFT JOIN ticket_types tt ON t.ticket_type_id = tt.id
      LEFT JOIN order_meals om ON o.id = om.order_id
      LEFT JOIN meals m ON om.meal_id = m.id
      WHERE o.created_at BETWEEN $1 AND $2
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

