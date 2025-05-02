const express = require('express');
const router = express.Router();
const weightController = require('../controllers/weightController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.post('/log', weightController.logWeight);
router.get('/history', weightController.getWeightHistory);
router.delete('/:id', weightController.deleteWeight);
router.post('/log-workout', weightController.logWorkoutWeight);
router.get('/total-lifted', weightController.getTotalWeightLifted);

module.exports = router;