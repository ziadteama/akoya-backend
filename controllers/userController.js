import pool from "../db.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

// Set a JWT secret
const JWT_SECRET = process.env.JWT_SECRET ;

// User login
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
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // If credentials are valid, return the user role and token
    res.json({
      message: "Login successful",
      role: user.role,
      name: user.name,
      user_id: user.user_id,
      id: user.id,
      token: token
    });
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Register a new user
export const registerUser = async (req, res) => {
  try {
    const { name, username, password, role } = req.body;
    
    // Validate required fields
    if (!name || !username || !password || !role) {
      return res.status(400).json({ 
        message: "Name, username, password, and role are required" 
      });
    }
    
    // Validate role is one of the allowed values
    if (!['admin', 'accountant', 'cashier'].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    // Check if username already exists
    const checkUser = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );

    if (checkUser.rows.length > 0) {
      return res.status(409).json({ message: "Username already exists" });
    }

    // Hash the password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Insert the new user
    const insertQuery = `
      INSERT INTO users (name, username, password_hash, role)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, username, role
    `;
    
    const newUser = await pool.query(insertQuery, [
      name,
      username,
      passwordHash,
      role
    ]);

    // Return success response with user data (excluding password)
    res.status(201).json({
      message: "User registered successfully",
      user: newUser.rows[0]
    });
  } catch (error) {
    console.error("Error registering user:", error);
    
    // Provide more specific error message for constraint violations
    if (error.code === '23505') { // Unique violation PostgreSQL error code
      return res.status(409).json({ message: "Username already exists" });
    }
    
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all users
export const getAllUsers = async (req, res) => {
  try {
    const query = 'SELECT id, name, username, role FROM users ORDER BY id ASC';
    const result = await pool.query(query);
    
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get user by ID
export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = 'SELECT id, name, username, role FROM users WHERE id = $1';
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update user
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, password } = req.body;
    
    // Check if user exists
    const checkUser = await pool.query(
      'SELECT id FROM users WHERE id = $1',
      [id]
    );
    
    if (checkUser.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // If password is provided, hash it
    if (password) {
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);
      
      await pool.query(
        'UPDATE users SET name = $1, role = $2, password_hash = $3 WHERE id = $4',
        [name, role, passwordHash, id]
      );
    } else {
      // Update without changing password
      await pool.query(
        'UPDATE users SET name = $1, role = $2 WHERE id = $3',
        [name, role, id]
      );
    }
    
    res.json({ message: "User updated successfully" });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete user
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if user exists
    const checkUser = await pool.query(
      'SELECT id FROM users WHERE id = $1',
      [id]
    );
    
    if (checkUser.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Change password
export const changePassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        message: "Current password and new password are required" 
      });
    }
    
    // Get current user's password hash
    const userResult = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [id]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Verify current password
    const isMatch = await bcrypt.compare(
      currentPassword, 
      userResult.rows[0].password_hash
    );
    
    if (!isMatch) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }
    
    // Hash and update new password
    const saltRounds = 10;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);
    
    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [newPasswordHash, id]
    );
    
    res.json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};