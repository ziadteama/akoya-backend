import express from 'express';
import * as userController from '../controllers/userController.js';
import { authenticateToken, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public routes
router.post('/login', userController.loginUser);

// Protected routes
router.post('/register', authenticateToken, authorizeRoles(['admin', 'accountant']), userController.registerUser);
router.get('/all', authenticateToken, authorizeRoles(['admin', 'accountant']), userController.getAllUsers);
router.get('/:id', authenticateToken, userController.getUserById);
router.put('/:id', authenticateToken, authorizeRoles(['admin']), userController.updateUser);
router.delete('/:id', authenticateToken, authorizeRoles(['admin']), userController.deleteUser);
router.post('/:id/change-password', authenticateToken, userController.changePassword);

export default router;