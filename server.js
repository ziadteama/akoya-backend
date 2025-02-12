import express from 'express';
import ticketRoutes from './routes/ticketRoutes.js';
import dotenv from 'dotenv';
import cors from 'cors';



dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: "http://localhost:5173", 
    credentials: true, 
  }));
app.use(express.json());

// Routes
app.use('/api/tickets', ticketRoutes);

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});