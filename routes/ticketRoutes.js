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
  getTicketById,
  refundTickets,
  loginUser,
} from "../controllers/ticketController.js";

const router = express.Router();

router.post("/login", loginUser);

/**
 * @route GET /
 * @desc Get all tickets
 * @access Public
 */
router.get("/", getAllTickets);

/**
 * @route GET /report
 * @desc Get sales report for tickets
 * @access Public
 */
router.get("/report", getSalesReport);

/**
 * @route GET /:id
 * @desc Get a specific ticket by ID
 * @access Public
 */
router.get("/:id", getTicketById);

/**
 * @route POST /sell
 * @desc Sell a ticket or multiple tickets
 * @access Public
 */
router.post("/sell", sellTickets);

/**
 * @route POST /add-type
 * @desc Add new ticket types
 * @access Public
 */
router.post("/add-type", addTicketTypes);

/**
 * @route POST /generate
 * @desc Generate tickets
 * @access Public
 */
router.post("/generate", generateTickets);

/**
 * @route PATCH /update-prices
 * @desc Update ticket prices
 * @access Public
 */
router.patch("/update-prices", updateTicketPrices);

/**
 * @route PUT /sell/:id
 * @desc Mark a ticket as sold
 * @access Public
 */
router.put("/sell/:id", markTicketAsSold);

/**
 * @route PUT /validate
 * @desc Update ticket validation status
 * @access Public
 */
router.put("/validate", updateTicketValidation);

/**
 * @route PUT /refund
 * @desc Process ticket refunds
 * @access Public
 */
router.put("/refund", refundTickets);

export default router;
