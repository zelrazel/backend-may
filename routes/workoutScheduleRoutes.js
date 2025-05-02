const express = require('express');
const router = express.Router();
const WorkoutSchedule = require('../models/WorkoutSchedule'); 
const User = require('../models/User'); 
const authMiddleware = require('../middleware/auth');

//  GET User Workouts
router.get('/', authMiddleware, async (req, res) => {
    try {
        const workouts = await WorkoutSchedule.find({ userId: req.user.userId });
        res.json(workouts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add workout
router.post('/add', authMiddleware, async (req, res) => {
    try {
        const { date, category, target, exerciseName, time } = req.body;

        //  Check if user exists before storing email
        const user = await User.findById(req.user.userId);
        if (!user) {
            console.error("❌ User not found with ID:", req.user.userId);
            return res.status(404).json({ error: 'User not found' });
        }

        console.log("✅ Adding workout for:", user.email);

        const newWorkout = new WorkoutSchedule({
            userId: req.user.userId,
            userEmail: user.email, //  Store user email
            date,
            category,
            target,
            exerciseName,
            time
        });

        await newWorkout.save();
        res.json({ message: "Workout added successfully", workout: newWorkout });

    } catch (error) {
        console.error("❌ Error adding workout:", error);
        res.status(500).json({ error: error.message });
    }
});

//  Delete workout
router.delete('/delete/:id', authMiddleware, async (req, res) => {
    try {
        const workout = await WorkoutSchedule.findOneAndDelete({ 
            _id: req.params.id,
            userId: req.user.userId 
        });

        if (!workout) {
            return res.status(404).json({ error: 'Workout not found' });
        }

        res.json({ message: 'Workout deleted successfully' });
    } catch (error) {
        console.error('Error deleting workout:', error);
        res.status(500).json({ error: 'Error deleting workout' });
    }
});

//  Edit workout
router.put('/edit/:id', authMiddleware, async (req, res) => {
    try {
        const { category, target, exerciseName, time } = req.body;
        const updatedWorkout = await WorkoutSchedule.findByIdAndUpdate(req.params.id, 
            { category, target, exerciseName, time }, { new: true });
        res.json({ message: "Workout updated successfully", workout: updatedWorkout });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
