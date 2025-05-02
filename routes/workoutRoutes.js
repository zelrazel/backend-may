const express = require('express');
const workoutController = require('../controllers/workoutController');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, workoutController.getWorkouts);
router.post('/', authMiddleware, workoutController.createWorkout);
router.put('/:id', authMiddleware, workoutController.updateWorkout);
router.delete('/:id', authMiddleware, workoutController.deleteWorkout);
router.post('/:id/complete', authMiddleware, workoutController.completeWorkout);
router.get('/completed', authMiddleware, workoutController.getCompletedWorkouts);

module.exports = router;
