const mongoose = require('mongoose');

const WorkoutScheduleSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userEmail: { type: String, required: true },
    date: { type: String, required: true }, // Stores YYYY-MM-DD format
    category: { 
        type: String, 
        enum: ['Bodyweight', 'Dumbbell', 'Machine', 'Barbell'], 
        required: true 
    },
    target: { type: String, required: true },
    exerciseName: { type: String, required: true },
    time: { type: String, required: true }, // Stores time in HH:MM format
}, {
    timestamps: true
});

const WorkoutSchedule = mongoose.model('WorkoutSchedule', WorkoutScheduleSchema);
module.exports = WorkoutSchedule;
