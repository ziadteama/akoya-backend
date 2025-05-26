import express from "express";
import {
  getAllTickets,
  sellTickets,
  addTicketTypes,
  updateTicketPrices,
  generateTickets,
  checkoutExistingTickets,
  updateTicketValidation,
  getTicketById,
  refundTickets,
  getAllTicketTypes,
  getTicketsBetweenDates,
  getTicketsByDate,
  updateTicketTypeArchiveStatus,
  assignTicketTypesById
} from "../controllers/ticketController.js";

const router = express.Router();


/**
 * @route GET /
 * @desc Get all tickets
 * @access Public
 */
router.get("/", getAllTickets);

router.get("/ticket-types", getAllTicketTypes);

/**
 * @route GET /:id
 * @desc Get a specific ticket by ID
 * @access Public
 */
router.get("/ticket/:id", getTicketById);

router.get("/day-report", getTicketsByDate);

router.get("/between-dates-report", getTicketsBetweenDates );

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
router.patch("/update-price", updateTicketPrices);

/**
 * @route PUT /sell/:id
 * @desc Mark a ticket as sold
 * @access Public
 */
router.put("/checkout-existing", checkoutExistingTickets);

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

router.patch("/archive-category", updateTicketTypeArchiveStatus);

router.patch("/tickets/assign-types", assignTicketTypesById);


export default router;
