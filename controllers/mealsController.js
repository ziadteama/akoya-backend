import pool from "../db.js";

// Add new meals
export const addMeals = async (req, res) => {
  try {
    const { meals } = req.body;

    if (!Array.isArray(meals) || meals.length === 0) {
      return res.status(400).json({ message: "Provide an array of meals" });
    }

    const names = [];
    const descriptions = [];
    const prices = [];
    const ageGroups = [];

    for (const meal of meals) {
      const { name, description, price, age_group } = meal;

      if (!name || !price || !age_group || isNaN(price) || price <= 0) {
        return res
          .status(400)
          .json({ message: `Invalid meal entry: ${JSON.stringify(meal)}` });
      }

      names.push(name);
      descriptions.push(description || "");
      prices.push(price);
      ageGroups.push(age_group);
    }

    const insertQuery = `
      INSERT INTO meals (name, description, price, age_group)
      SELECT * FROM UNNEST($1::text[], $2::text[], $3::numeric[], $4::age_group[])
      RETURNING *;
    `;

    const { rows } = await pool.query(insertQuery, [
      names,
      descriptions,
      prices,
      ageGroups,
    ]);

    res.status(201).json({ message: "Meals added successfully", meals: rows });
  } catch (error) {
    console.error("Error adding meals:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Edit meals
export const updateMeals = async (req, res) => {
  try {
    const { meals } = req.body;

    if (!Array.isArray(meals) || meals.length === 0) {
      return res.status(400).json({ message: "No meals provided" });
    }

    const ids = [];
    const names = [];
    const descriptions = [];
    const prices = [];
    const ageGroups = [];

    for (const meal of meals) {
      const { id, name, description, price, age_group } = meal;

      if (!id || !name || !price || !age_group || isNaN(price) || price <= 0) {
        return res
          .status(400)
          .json({ message: `Invalid meal update entry: ${JSON.stringify(meal)}` });
      }

      ids.push(id);
      names.push(name);
      descriptions.push(description || "");
      prices.push(price);
      ageGroups.push(age_group);
    }

    const updateQuery = `
      UPDATE meals AS m SET
        name = d.name,
        description = d.description,
        price = d.price,
        age_group = d.age_group
      FROM (
        SELECT UNNEST($1::int[]) AS id,
               UNNEST($2::text[]) AS name,
               UNNEST($3::text[]) AS description,
               UNNEST($4::numeric[]) AS price,
               UNNEST($5::age_group[]) AS age_group
      ) AS d
      WHERE m.id = d.id
      RETURNING *;
    `;

    const { rows } = await pool.query(updateQuery, [ids, names, descriptions, prices, ageGroups]);

    res.json({ message: "Meals updated successfully", updatedMeals: rows });
  } catch (error) {
    console.error("Error updating meals:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Optional: get all meals
export const getAllMeals = async (req, res) => {
  try {
    const { archived } = req.query;

    let query = `SELECT * FROM meals`;
    const values = [];

    if (archived === "true") {
      query += ` WHERE archived = TRUE`;
    } else if (archived === "false") {
      query += ` WHERE archived = FALSE`;
    }

    query += ` ORDER BY id`;

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching meals:", error);
    res.status(500).json({ message: "Server error" });
  }
};

