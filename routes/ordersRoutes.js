import express from 'express';
import {
  getOrdersByDate,
  getOrdersBetweenDates,
} from "../controllers/ordersController.js";

const router = express.Router();


router.get("/day-report", getOrdersByDate);
router.get("/range-report", getOrdersBetweenDates);

export default router;