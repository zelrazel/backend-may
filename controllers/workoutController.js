const Workout = require('../models/Workout'); 
const User = require('../models/User');
const { JWT_SECRET } = require('../config/jwt.config');
const CompletedWorkout = require('../models/CompletedWorkout');
const axios = require('axios');

exports.getWorkouts = async (req, res) => {
    try {
        const user = req.user; 
        if (!user) {
            return res.status(401).json({ error: "Authentication required" });
        }

        // Get all workouts for the user
        const workouts = await Workout.find({ userEmail: user.email });
        
        // Get completed workout IDs for this user
        const completedWorkouts = await CompletedWorkout.find({ 
            userEmail: user.email 
        }).select('workoutId');
        
        // Create a Set of completed workout IDs for quick lookup
        const completedWorkoutIds = new Set(
            completedWorkouts.map(cw => cw.workoutId.toString())
        );
        
        // Mark workouts as completed if they exist in the completed set
        const workoutsWithCompletionStatus = workouts.map(workout => {
            const workoutObj = workout.toObject();
            // Check if this workout is completed either in its own completed flag
            // or in the CompletedWorkout collection
            workoutObj.completed = workout.completed || completedWorkoutIds.has(workout._id.toString());
            return workoutObj;
        });
        
        res.status(200).json(workoutsWithCompletionStatus);
    } catch (error) {
        console.error("Error fetching workouts:", error);
        res.status(500).json({ error: "Server error" });
    }
};

exports.createWorkout = async (req, res) => {
    try {
        // User data now comes from auth middleware
        const userId = req.user.userId;
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const workoutData = {
            ...req.body,
            userEmail: user.email
        };

        const workout = new Workout(workoutData);
        await workout.save();
        
        res.status(201).json({ 
            message: "Workout created successfully", 
            workout 
        });
    } catch (error) {
        console.error("Error creating workout:", error);
        res.status(500).json({ error: "Error creating workout" });
    }
};

exports.updateWorkout = async (req, res) => {
    try {
        // User data now comes from auth middleware
        const userId = req.user.userId;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        // Prepare workout data
        const workoutData = {
            ...req.body,
            userEmail: user.email,
            sets: Number(req.body.sets),
            reps: Number(req.body.reps),
            weight: req.body.category === 'Bodyweight' ? 0 : Number(req.body.weight)
        };

        // Debug logging
        console.log('Updating workout:', workoutData);

        const updatedWorkout = await Workout.findOneAndUpdate(
            { _id: req.params.id, userEmail: user.email },
            workoutData,
            { 
                new: true,
                runValidators: true,
                context: 'query'
            }
        );

        if (!updatedWorkout) {
            return res.status(404).json({ error: "Workout not found or unauthorized" });
        }

        res.json(updatedWorkout);

    } catch (error) {
        console.error("Error updating workout:", error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ 
                error: Object.values(error.errors)
                    .map(err => err.message)
                    .join('. ')
            });
        }
        res.status(500).json({ error: "Error updating workout" });
    }
};

exports.deleteWorkout = async (req, res) => {
    try {
        // User data now comes from auth middleware
        const userId = req.user.userId;
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const workout = await Workout.findOne({ 
            _id: req.params.id, 
            userEmail: user.email 
        });

        if (!workout) {
            return res.status(404).json({ error: "Workout not found or unauthorized" });
        }

        await Workout.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Workout deleted successfully" });

    } catch (error) {
        console.error("Error deleting workout:", error);
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: "Invalid token" });
        }
        if (error.name === 'CastError') {
            return res.status(400).json({ error: "Invalid workout ID" });
        }
        res.status(500).json({ error: "Error deleting workout" });
    }
};

exports.completeWorkout = async (req, res) => {
    try {
        const userId = req.user.userId;
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const workout = await Workout.findById(req.params.id);
        if (!workout || workout.userEmail !== user.email) {
            return res.status(404).json({ error: 'Workout not found or unauthorized' });
        }

        // Update the original workout to mark it as completed
        workout.completed = true;
        workout.completedDate = new Date();
        await workout.save();

        const completedWorkout = new CompletedWorkout({
            userEmail: user.email,
            workoutId: workout._id,
            name: workout.name,
            description: workout.description,
            category: workout.category,
            target: workout.target,
            exerciseName: workout.exerciseName,
            weightLifted: workout.category === 'Bodyweight' ? user.weight : workout.weight,
            setsCompleted: workout.sets,
            repsCompleted: workout.reps,
            completedDate: new Date()
        });

        await completedWorkout.save();

        // Update the user's total weight lifted if it's not a bodyweight workout
        if (workout.category !== 'Bodyweight') {
            const weightToAdd = workout.weight * workout.sets * workout.reps;
            user.totalWeightLifted = (user.totalWeightLifted || 0) + weightToAdd;
            await user.save();
        }

        // Create activity for completed workout
        try {
            // Format weight information based on category
            const weightInfo = workout.category === 'Bodyweight' 
                ? '' 
                : ` with ${workout.weight}kg`;

            // First, try to post directly to the workout activity endpoint
            try {
                await axios.post(
                    `${req.protocol}://${req.get('host')}/api/activity/workout`,
                    {
                        workoutId: workout._id.toString(),
                        workoutName: workout.name,
                        workoutCategory: workout.category,
                        workoutTarget: workout.target,
                        exerciseName: workout.exerciseName,
                        sets: workout.sets,
                        reps: workout.reps,
                        weight: workout.weight
                    },
                    { headers: { Authorization: req.headers.authorization } }
                );
            } catch (workoutError) {
                // Fallback to using achievement endpoint if workout endpoint fails
                console.log('Falling back to achievement endpoint for workout activity:', workoutError.message);
                const activityData = {
                    achievementId: `workout-complete-${workout._id}-${Date.now()}`,
                    achievementTitle: `Completed ${workout.category} Workout`,
                    achievementDescription: `${workout.exerciseName} (${workout.target}): ${workout.sets} sets × ${workout.reps} reps${weightInfo}`,
                    achievementCategory: 'workout',
                    hideImage: true
                };

                await axios.post(
                    `${req.protocol}://${req.get('host')}/api/activity/achievement`,
                    activityData,
                    { headers: { Authorization: req.headers.authorization } }
                );
            }
        } catch (activityError) {
            console.error('Error creating workout completion activity:', activityError);
            // Don't fail the whole request if activity creation fails
        }
        
        res.status(200).json({ 
            message: "Workout marked as completed", 
            completedWorkout,
            workout // Include the updated workout in the response
        });
    } catch (error) {
        console.error("Error completing workout:", error);
        res.status(500).json({ error: "Error marking workout as completed" });
    }
};

exports.getCompletedWorkouts = async (req, res) => {
    try {
        // Extract the email from query parameter if provided
        const { email } = req.query;
        
        // Determine which user's completed workouts to fetch
        let userEmail = req.user.email;
        
        // If email is provided, check permission and use that email
        if (email) {
            const User = require('../models/User');
            const userByEmail = await User.findOne({ email });
            
            if (!userByEmail) {
                return res.status(404).json({ error: 'User not found' });
            }
            
            // Check if the profile is private
            if (userByEmail.isPrivate && userByEmail.email !== req.user.email) {
                return res.status(403).json({ error: 'This profile is private' });
            }
            
            userEmail = email;
        }
        
        // Get completed workouts from CompletedWorkout collection
        const completedWorkouts = await CompletedWorkout.find({
            userEmail: userEmail
        }).sort({ completedDate: -1 });
        
        // Also get workouts that have the completed flag set to true
        const completedRegularWorkouts = await Workout.find({
            userEmail: userEmail,
            completed: true
        }).sort({ completedDate: -1 });
        
        // Combine and deduplicate the results
        const allCompletedWorkouts = [
            ...completedWorkouts.map(cw => ({
                _id: cw._id,
                workoutId: cw.workoutId,
                name: cw.name,
                description: cw.description,
                category: cw.category,
                target: cw.target,
                exerciseName: cw.exerciseName,
                weightLifted: cw.weightLifted,
                sets: cw.setsCompleted,
                reps: cw.repsCompleted,
                completedDate: cw.completedDate,
                isCompleted: true
            })),
            ...completedRegularWorkouts
                .filter(w => !completedWorkouts.some(cw => cw.workoutId.toString() === w._id.toString()))
                .map(w => ({
                    _id: w._id,
                    workoutId: w._id,
                    name: w.name,
                    description: w.description,
                    category: w.category,
                    target: w.target,
                    exerciseName: w.exerciseName,
                    weightLifted: w.weight,
                    sets: w.sets,
                    reps: w.reps,
                    completedDate: w.completedDate,
                    isCompleted: true
                }))
        ];
        
        res.json(allCompletedWorkouts);
    } catch (error) {
        console.error('Error getting completed workouts:', error);
        res.status(500).json({ error: error.message });
    }
};