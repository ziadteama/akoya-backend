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

export const updateOrder = async (req, res) => {
  try {
    const { 
      order_id, 
      addedTickets, 
      removedTickets, 
      addedMeals, 
      removedMeals, 
      payments 
    } = req.body;

    if (!order_id) {
      return res.status(400).json({ message: "Order ID is required" });
    }

    // Begin transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check if order exists
      const orderCheck = await client.query(
        'SELECT * FROM orders WHERE id = $1',
        [order_id]
      );

      if (orderCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: "Order not found" });
      }

      let updatedTotal = parseFloat(orderCheck.rows[0].total_amount);
      
      // 1. Handle added tickets
      if (addedTickets && addedTickets.length > 0) {
        // Fetch ticket prices
        const ticketTypeIds = addedTickets.map(t => t.ticket_type_id);
        const ticketPrices = await client.query(
          'SELECT id, price FROM ticket_types WHERE id = ANY($1)',
          [ticketTypeIds]
        );
        
        const priceMap = new Map();
        ticketPrices.rows.forEach(row => {
          priceMap.set(row.id, parseFloat(row.price));
        });

        // Insert new tickets
        for (const ticket of addedTickets) {
          const price = priceMap.get(ticket.ticket_type_id);
          if (!price) continue;

          // Add tickets to the order
          for (let i = 0; i < ticket.quantity; i++) {
            await client.query(
              `INSERT INTO tickets 
               (ticket_type_id, status, valid, sold_at, sold_price, order_id) 
               VALUES ($1, 'sold', true, NOW(), $2, $3)`,
              [ticket.ticket_type_id, price, order_id]
            );
            
            // Update total amount
            updatedTotal += price;
          }
        }
      }

      // 2. Handle removed tickets
      if (removedTickets && removedTickets.length > 0) {
        for (const ticket of removedTickets) {
          // Find tickets of this type in the order
          const ticketsToRemove = await client.query(
            `SELECT id, sold_price FROM tickets 
             WHERE order_id = $1 AND ticket_type_id = $2 AND status = 'sold'
             LIMIT $3`,
            [order_id, ticket.ticket_type_id, ticket.quantity]
          );

          // Remove each ticket
          for (const ticketRow of ticketsToRemove.rows) {
            await client.query(
              'DELETE FROM tickets WHERE id = $1',
              [ticketRow.id]
            );
            
            // Update total amount
            updatedTotal -= parseFloat(ticketRow.sold_price);
          }
        }
      }

      // 3. Handle added meals
      if (addedMeals && addedMeals.length > 0) {
        for (const meal of addedMeals) {
          // Check if this meal already exists in the order
          const existingMeal = await client.query(
            'SELECT * FROM order_meals WHERE order_id = $1 AND meal_id = $2',
            [order_id, meal.meal_id]
          );

          if (existingMeal.rows.length > 0) {
            // Update existing meal quantity
            await client.query(
              'UPDATE order_meals SET quantity = quantity + $1 WHERE order_id = $2 AND meal_id = $3',
              [meal.quantity, order_id, meal.meal_id]
            );
          } else {
            // Add new meal to order
            await client.query(
              'INSERT INTO order_meals (order_id, meal_id, quantity, price_at_order) VALUES ($1, $2, $3, $4)',
              [order_id, meal.meal_id, meal.quantity, meal.price]
            );
          }
          
          // Update total amount
          updatedTotal += (meal.quantity * parseFloat(meal.price));
        }
      }

      // 4. Handle removed meals
      if (removedMeals && removedMeals.length > 0) {
        for (const meal of removedMeals) {
          // Get current meal info
          const currentMeal = await client.query(
            'SELECT quantity, price_at_order FROM order_meals WHERE order_id = $1 AND meal_id = $2',
            [order_id, meal.meal_id]
          );
          
          if (currentMeal.rows.length > 0) {
            const currentQuantity = currentMeal.rows[0].quantity;
            const newQuantity = currentQuantity - meal.quantity;
            
            if (newQuantity <= 0) {
              // Remove meal entirely
              await client.query(
                'DELETE FROM order_meals WHERE order_id = $1 AND meal_id = $2',
                [order_id, meal.meal_id]
              );
            } else {
              // Reduce quantity
              await client.query(
                'UPDATE order_meals SET quantity = $1 WHERE order_id = $2 AND meal_id = $3',
                [newQuantity, order_id, meal.meal_id]
              );
            }
            
            // Update total amount
            updatedTotal -= (meal.quantity * parseFloat(currentMeal.rows[0].price_at_order));
          }
        }
      }

      // 5. Update order total
      await client.query(
        'UPDATE orders SET total_amount = $1 WHERE id = $2',
        [updatedTotal, order_id]
      );

      // 6. Update payments
      if (payments && payments.length > 0) {
        // First delete all existing payments
        await client.query('DELETE FROM payments WHERE order_id = $1', [order_id]);
        
        // Then insert new payments
        for (const payment of payments) {
          await client.query(
            'INSERT INTO payments (order_id, method, amount) VALUES ($1, $2, $3)',
            [order_id, payment.method, payment.amount]
          );
        }
      }

      // Commit transaction
      await client.query('COMMIT');

      res.json({
        message: "Order updated successfully",
        order_id,
        total_amount: updatedTotal
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error updating order:", error);
    res.status(500).json({ message: "Server error" });
  }
};

