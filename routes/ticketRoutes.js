import express from "express";
import {
  getAllTickets,
  sellTickets,
  getSalesReport,
  addTicketTypes, // Updated function name
} from "../controllers/ticketController.js";

const router = express.Router();

// 🟢 GET /api/tickets - Get all tickets
router.get("/", getAllTickets);

// 🟢 POST /api/tickets/sell - Generate and sell tickets
router.post("/sell", sellTickets);

// 🟢 GET /api/tickets/report - Get ticket sales report
router.get("/report", getSalesReport);

// 🟢 POST /api/tickets/type - Add multiple ticket types
router.post("/type", addTicketTypes);

export default router;
