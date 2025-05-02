const express = require('express');
const router = express.Router();
const activityController = require('../controllers/activityController');
const authMiddleware = require('../middleware/auth');

// Apply auth middleware to all routes
router.use(authMiddleware);

// Get user activities
router.get('/', activityController.getUserActivities);

// Create achievement activity
router.post('/achievement', activityController.createAchievementActivity);

// Create rank activity
router.post('/rank', activityController.createRankActivity);

// Create weight change activity
router.post('/weight-change', activityController.createWeightChangeActivity);

// Create workout activity
router.post('/workout', activityController.createWorkoutActivity);

// Create scheduled workout activity
router.post('/scheduled-workout', activityController.createScheduledWorkoutActivity);

// Delete scheduled workout activity
router.delete('/scheduled-workout/:workoutId', activityController.deleteScheduledWorkoutActivity);

// Add reaction to activity
router.post('/reaction', activityController.addReaction);

// Add comment to activity
router.post('/comment', activityController.addComment);

// Delete a comment
router.delete('/comment/:activityId/:commentId', activityController.deleteComment);

// Add an endpoint to clean up duplicate achievements
router.get('/cleanup-duplicates', async (req, res) => {
    try {
     
        const Activity = require('../models/Activity');
        
        // Get all achievement activities for this user
        const activities = await Activity.find({ 
            userId: req.user.userId,
            activityType: 'achievement'
        });
        
        // Track unique achievement IDs and their oldest activities
        const uniqueAchievements = new Map();
        const duplicatesToRemove = [];
        
        activities.forEach(activity => {
            if (activity.content && activity.content.achievementId) {
                const achievementId = activity.content.achievementId;
                const currentActivity = {
                    id: activity._id,
                    createdAt: activity.createdAt,
                    title: activity.content.title
                };
                
                if (!uniqueAchievements.has(achievementId) || 
                    uniqueAchievements.get(achievementId).createdAt > activity.createdAt) {
                    uniqueAchievements.set(achievementId, currentActivity);
                }
            }
        });
        
        activities.forEach(activity => {
            if (activity.content && activity.content.achievementId) {
                const achievementId = activity.content.achievementId;
                const oldest = uniqueAchievements.get(achievementId);
                
                if (oldest && oldest.id.toString() !== activity._id.toString()) {
                    duplicatesToRemove.push(activity);
                }
            }
        });
        
        for (const duplicate of duplicatesToRemove) {
            await Activity.findByIdAndDelete(duplicate._id);
        }
        
        // Generate detailed report
        const report = {
            totalActivities: activities.length,
            uniqueAchievements: uniqueAchievements.size,
            duplicatesRemoved: duplicatesToRemove.length,
            details: Array.from(uniqueAchievements.entries()).map(([id, activity]) => ({
                achievementId: id,
                title: activity.title,
                duplicatesRemoved: duplicatesToRemove.filter(d => 
                    d.content.achievementId === id
                ).length
            }))
        };
        
        res.json({ 
            success: true, 
            message: `Cleaned up ${duplicatesToRemove.length} duplicate achievement activities.`,
            report
        });
    } catch (error) {
        console.error('Error cleaning up duplicates:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router; 