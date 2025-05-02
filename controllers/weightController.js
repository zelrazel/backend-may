const Weight = require('../models/Weight');
const User = require('../models/User');
const CompletedWorkout = require('../models/CompletedWorkout');

exports.logWeight = async (req, res) => {
    try {
        // Log full request
        console.log('FULL REQUEST BODY:', req.body);
        
        // Extract weight with fallback
        let { weight, changeType, changeAmount } = req.body;
        
        // Ensure weight is a number
        weight = Number(weight);
        
        // Basic validation
        if (isNaN(weight)) {
            return res.status(400).json({ error: 'Weight must be a valid number' });
        }
        
        // Get user ID from request
        const userId = req.user.userId;
        console.log('Processing request for userId:', userId, 'weight:', weight);
        
        // Find user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        console.log('Current user weight:', user.weight);
        
        // Check if user has already logged weight today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const existingEntry = await Weight.findOne({
            userId,
            date: { 
                $gte: today,
                $lt: tomorrow
            },
            isWorkout: { $ne: true }
        });
        
        if (existingEntry) {
            return res.status(400).json({ 
                error: 'You have already logged your weight today. Please come back tomorrow!' 
            });
        }
        
        // Basic global limits (from Weight model)
        if (weight < 40) {
            return res.status(400).json({ error: 'Weight cannot be less than 40 kg' });
        }
        
        if (weight > 500) {
            return res.status(400).json({ error: 'Weight cannot exceed 500 kg' });
        }
        
        // Determine change type and amount if not provided
        if (!changeType || !changeAmount) {
            if (user.weight > 0) {
                if (weight > user.weight) {
                    changeType = 'gain';
                    changeAmount = Number((weight - user.weight).toFixed(1));
                } else if (weight < user.weight) {
                    changeType = 'loss';
                    changeAmount = Number((user.weight - weight).toFixed(1));
                } else {
                    changeType = null;
                    changeAmount = 0;
                }
            } else {
                // First weight entry
                changeType = 'initial';
                changeAmount = 0;
            }
        }
        
        // Update the user's weight
        await User.updateOne({ _id: userId }, { weight: weight });
        
        // Create new weight record
        const newWeight = await Weight.create({
            userId,
            userEmail: user.email,
            weight,
            date: new Date(),
            changeType,
            changeAmount
        });
        
        console.log('Successfully created weight entry:', newWeight);
        
        // Return success response
        return res.status(201).json({
            success: true,
            weight: newWeight,
            currentWeight: weight,
            initialWeight: user.initialWeight
        });
    } catch (error) {
        console.error('ERROR LOGGING WEIGHT:', error);
        return res.status(500).json({ error: error.message || 'Server error logging weight' });
    }
};

exports.getWeightHistory = async (req, res) => {
    try {
        // Extract the email from query parameter if provided
        const { email } = req.query;
        
        // If email is provided, fetch that user's weight history
        // Otherwise, fetch the current user's weight history
        let userId = req.user.userId;
        
        // If email is provided, find the user ID associated with that email
        if (email) {
            const User = require('../models/User');
            const userByEmail = await User.findOne({ email });
            
            if (!userByEmail) {
                return res.status(404).json({ error: 'User not found' });
            }
            
            // Check if the profile is private
            if (userByEmail.isPrivate && userByEmail._id.toString() !== req.user.userId) {
                return res.status(403).json({ error: 'This profile is private' });
            }
            
            userId = userByEmail._id;
        }
        
        const Weight = require('../models/Weight');
        const weightEntries = await Weight.find({ userId })
            .sort({ date: -1 });
        
        res.json(weightEntries);
    } catch (error) {
        console.error('Error getting weight history:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.deleteWeight = async (req, res) => {
    try {
        const { id } = req.params;
        const weight = await Weight.findOneAndDelete({
            _id: id,
            userId: req.user.userId
        });

        if (!weight) {
            return res.status(404).json({ error: 'Weight record not found' });
        }

        res.json({ message: 'Weight record deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.logWorkoutWeight = async (req, res) => {
    try {
        const { workoutWeight } = req.body;
        const userId = req.user.userId;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Create new workout weight entry
        const newWorkout = await Weight.create({
            userId,
            userEmail: user.email,
            weight: user.weight, 
            workoutWeight,
            isWorkout: true,
            date: new Date()
        });

        // Update user's total weight lifted
        user.totalWeightLifted = (user.totalWeightLifted || 0) + workoutWeight;
        await user.save();

        res.status(201).json({
            success: true,
            workout: newWorkout,
            totalWeightLifted: user.totalWeightLifted
        });
    } catch (error) {
        console.error('Error logging workout weight:', error);
        res.status(500).json({ error: error.message || 'Error logging workout weight' });
    }
};

exports.getTotalWeightLifted = async (req, res) => {
    try {
        // Extract the email from query parameter if provided
        const { email } = req.query;
        
        // Get the user email to fetch data for
        let userEmail = req.user.email;
        
        // If email is provided, find that user instead
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
        
        // Get the user to check saved totalWeightLifted
        const user = await User.findOne({ email: userEmail });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Get completed workouts from CompletedWorkout collection for history display
        const completedWorkouts = await CompletedWorkout.find({ userEmail });
        
        // Use only the user's totalWeightLifted field which is already updated
        // when workouts are completed in workoutController.js
        const totalWeightLifted = user.totalWeightLifted || 0;
        
        // Return both the workouts for history and the total weight
        res.json({ 
            totalWeightLifted,
            workouts: completedWorkouts 
        });
    } catch (error) {
        console.error('Error calculating total weight lifted:', error);
        res.status(500).json({ error: error.message });
    }
};