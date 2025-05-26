import jwt from 'jsonwebtoken';
import pool from '../db.js';

// You should set a JWT secret in your .env file (same as in userController.js)
const JWT_SECRET = process.env.JWT_SECRET || 'akoya-water-park-secret-key';

// Verify JWT token
export const authenticateToken = async (req, res, next) => {
  // FOR DEVELOPMENT ONLY: Bypass authentication
  // Remove this in production or when testing auth functionality
  if (process.env.NODE_ENV === 'development' && process.env.BYPASS_AUTH === 'true') {
    req.user = { id: 1, role: 'admin' }; // Mock admin user
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'Authentication token required' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Verify that the user still exists in the database
    // You can comment this out for quick testing if needed
    /*
    const userQuery = await pool.query('SELECT id, role FROM users WHERE id = $1', [decoded.userId]);
    
    if (userQuery.rows.length === 0) {
      return res.status(401).json({ message: 'User no longer exists' });
    }
    */
    
    req.user = {
      id: decoded.userId,
      role: decoded.role
    };
    
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

// Role-based authorization
export const authorizeRoles = (allowedRoles) => {
  return (req, res, next) => {
    // FOR DEVELOPMENT ONLY: Bypass authorization
    // Remove this in production or when testing auth functionality
    if (process.env.NODE_ENV === 'development' && process.env.BYPASS_AUTH === 'true') {
      return next();
    }

    if (!req.user || !req.user.role) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    if (allowedRoles.includes(req.user.role)) {
      next();
    } else {
      res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }
  };
};