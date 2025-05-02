const mongoose = require('mongoose');

const CompletedWorkoutSchema = new mongoose.Schema({
    userEmail: { type: String, required: true },
    workoutId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workout', required: true },
    name: { type: String, required: true },
    description: { type: String },
    category: {
        type: String,
        required: true,
        enum: ['Bodyweight', 'Dumbbell', 'Machine', 'Barbell']
    },
    target: { type: String, required: true },
    exerciseName: { type: String, required: true },
    weightLifted: { type: Number, required: true },
    setsCompleted: { type: Number, required: true },
    repsCompleted: { type: Number, required: true },
    completedDate: { type: Date, default: Date.now },
    isCompleted: { type: Boolean, default: true }
}, {
    timestamps: true
});

module.exports = mongoose.model('CompletedWorkout', CompletedWorkoutSchema);