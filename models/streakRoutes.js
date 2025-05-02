const express = require('express');
const Streak = require('../models/Streak');

const router = express.Router();

router.get('/streaks', async (req, res) => {
    try {
        console.log("🔍 Received request for streaks with query:", req.query);

        const { email } = req.query;
        if (!email) {
            console.log("❌ Missing email in request");
            return res.status(400).json({ message: "Email is required" });
        }

        console.log(`🔍 Looking for streak with email: ${email}`);
        let userStreak = await Streak.findOne({ email });

        if (!userStreak) {
            console.log(`⚠️ No streak found for ${email}, returning default response.`);
            return res.status(200).json({ streakCount: 0, addedWorkouts: [] });
        }

        console.log(`✅ Streak found:`, userStreak);
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
