import express from "express";
import {
  getAllTickets,
  sellTickets,
  getSalesReport,
} from "../controllers/ticketController.js";

const router = express.Router();

// 🟢 GET /api/tickets - Get all tickets
router.get("/", getAllTickets);

// 🟢 POST /api/tickets/sell - Generate and sell tickets
router.post("/sell", sellTickets);

// 🟢 GET /api/tickets/report - Get ticket sales report
router.get("/report", getSalesReport);

export default router;
