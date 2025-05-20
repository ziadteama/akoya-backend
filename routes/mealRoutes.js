import express from 'express';
import {
  addMeals,
  updateMeals,
  updateMealArchiveStatus,
  getAllMeals
} from '../controllers/mealsController.js';

const router = express.Router();

// POST /api/meals/add
router.post('/add', addMeals);

// PUT /api/meals/edit
router.put('/edit', updateMeals);


router.patch("/archive", updateMealArchiveStatus);


// GET /api/meals
router.get('/', getAllMeals);

export default router;
