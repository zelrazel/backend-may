const mongoose = require('mongoose');

const workoutSchema = new mongoose.Schema({
    userEmail: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    category: {
        type: String,
        required: true,
        enum: ['Bodyweight', 'Dumbbell', 'Machine', 'Barbell']
    },
    target: { type: String, required: true },
    exerciseName: { type: String, required: true },
    sets: {
        type: Number,
        required: true,
        validate: {
            validator: function(v) {
                const category = this.category || this._update?.$set?.category || this._update?.category;
                if (category === 'Dumbbell') {
                    return v >= 1 && v <= 8;
                }
                return v >= 1 && v <= 12;
            },
            message: function(props) {
                const category = this.category || this._update?.$set?.category || this._update?.category;
                const maxSets = category === 'Dumbbell' ? 8 : 12;
                return `Sets must be between 1 and ${maxSets} for ${category} exercises`;
            }
        }
    },
    reps: {
        type: Number,
        required: true,
        validate: {
            validator: function(v) {
                const category = this.category || this._update?.$set?.category || this._update?.category;
                if (category === 'Bodyweight') {
                    return v >= 1 && v <= 100;
                }
                return v >= 1 && v <= 50;
            },
            message: function(props) {
                const category = this.category || this._update?.$set?.category || this._update?.category;
                const maxReps = category === 'Bodyweight' ? 100 : 50;
                return `Reps must be between 1 and ${maxReps} for ${category} exercises`;
            }
        }
    },
    weight: {
        type: Number,
        validate: {
            validator: function(v) {
                const category = this.category || this._update?.$set?.category || this._update?.category;
                const maxWeights = {
                    'Dumbbell': 120,
                    'Barbell': 600,
                    'Machine': 400,
                    'Bodyweight': 0
                };
                
                if (category === 'Bodyweight') {
                    return v === 0;
                }
                
                return v >= 0 && v <= maxWeights[category];
            },
            message: function(props) {
                const category = this.category || this._update?.$set?.category || this._update?.category;
                const maxWeights = {
                    'Dumbbell': 120,
                    'Barbell': 600,
                    'Machine': 400,
                    'Bodyweight': 0
                };
                
                if (category === 'Bodyweight') {
                    return 'Bodyweight exercises must have 0 weight';
                }
                
                return `Weight must be between 0 and ${maxWeights[category]} for ${category} exercises`;
            }
        }
    }
}, {
    timestamps: true
});

// Pre-save/update middleware
workoutSchema.pre(['save', 'findOneAndUpdate'], function(next) {
    const category = this.category || this._update?.$set?.category || this._update?.category;
    if (category === 'Bodyweight') {
        if (this._update) {
            if (this._update.$set) {
                this._update.$set.weight = 0;
            } else {
                this._update.weight = 0;
            }
        } else {
            this.weight = 0;
        }
    }
    next();
});

module.exports = mongoose.model('Workout', workoutSchema);