import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import ticketRoutes from './routes/ticketRoutes.js';
import mealRoutes from './routes/mealRoutes.js';
import orderRoutes from "./routes/ordersRoutes.js";
import userRoutes from './routes/userRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Simplified CORS for localhost only
app.use(cors({
  origin: 'http://localhost:5173', // Only allow this specific origin
  methods: ['GET', 'POST', 'PUT','PATCH' ,'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 204
}));

// Handle OPTIONS requests explicitly
app.options('*', cors({
  origin: 'http://localhost:5173',
  credentials: true
}));

// Parse JSON: MUST be before routes
app.use(express.json());

// Debug incoming requests
app.use((req, res, next) => {
  console.log(`${req.method} request from ${req.headers.origin || 'unknown'} to ${req.url}`);
  next();
});

// Routes
app.use('/api/tickets', ticketRoutes);
app.use('/api/meals', mealRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/users', userRoutes);

// Start server - Listen only on localhost
app.listen(PORT, 'localhost', () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('CORS configured to only accept requests from http://localhost:5173');
});
