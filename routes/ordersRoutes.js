import express from 'express';
import {
  getOrdersByDate,
  getOrdersBetweenDates,
  updateOrder
} from "../controllers/ordersController.js";

const router = express.Router();


router.get("/day-report", getOrdersByDate);
router.get("/range-report", getOrdersBetweenDates);
router.put("/update", updateOrder);

export default router;