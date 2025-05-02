const mongoose = require('mongoose');

const StreakSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    streakCount: { type: Number, default: 0 },
    lastLogin: { type: Date, default: null },
    addedWorkouts: [{ type: String }] // Store workout names only
});

StreakSchema.statics.updateStreak = async function(email) {
    const today = new Date().setHours(0, 0, 0, 0);
    let userStreak = await this.findOne({ email });

    if (!userStreak) {
        userStreak = new this({ email, streakCount: 1, lastLogin: today });
    } else {
        const lastLogin = new Date(userStreak.lastLogin).setHours(0, 0, 0, 0);
        if (today - lastLogin === 86400000) {
            userStreak.streakCount += 1;
        } else if (today - lastLogin > 86400000) {
            userStreak.streakCount = 1;
        }
        userStreak.lastLogin = today;
    }
    await userStreak.save();
};

module.exports = mongoose.model('Streak', StreakSchema);
