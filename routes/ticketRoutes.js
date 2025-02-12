import express from "express";
import {
  getAllTickets,
  sellTickets,
  getSalesReport,
  addTicketTypes,
  updateTicketPrices,
  generateTickets,
  markTicketAsSold,
  updateTicketValidation,
  checkTicketStatus,
} from "../controllers/ticketController.js";

const router = express.Router();

router.get("/", getAllTickets);

router.get("/report", getSalesReport);

router.get("/:id/status", checkTicketStatus);

router.post("/sell", sellTickets);

router.post("/add-type", addTicketTypes);

router.post("/generate", generateTickets);

router.patch("/update-prices", updateTicketPrices);

router.put("/sell/:id", markTicketAsSold);

router.put("/validate", updateTicketValidation);

export default router;
