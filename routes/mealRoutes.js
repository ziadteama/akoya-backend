import express from 'express';
import {
  addMeals,
  updateMeals,
  getAllMeals
} from '../controllers/mealsController.js';

const router = express.Router();

// POST /api/meals/add
router.post('/add', addMeals);

// PUT /api/meals/edit
router.put('/edit', updateMeals);

// GET /api/meals
router.get('/', getAllMeals);

export default router;
