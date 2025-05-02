const express = require('express');
const Streak = require('../models/Streak');

const router = express.Router();

router.get('/streaks', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        const userStreak = await Streak.findOne({ email });

        if (!userStreak) {
            return res.status(404).json({ message: "No streak found for this user" });
        }

        res.status(200).json({
            streakCount: userStreak.streakCount,
            addedWorkouts: userStreak.addedWorkouts,
        });
    } catch (error) {
        console.error("❌ Error fetching streaks:", error);
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;
