const express = require('express');
const router = express.Router();
const leaderboardController = require('../controllers/leaderboardController');
const authMiddleware = require('../middleware/auth');


router.get('/weight-loss', leaderboardController.getWeightLossLeaderboard);
router.get('/strength', leaderboardController.getStrengthLeaderboard);
router.get('/consistency', leaderboardController.getConsistencyLeaderboard);
router.get('/hybrid', leaderboardController.getHybridLeaderboard);
router.get('/user-ranks/:email', leaderboardController.getUserRanks);

// Add a route to clean up duplicate activities with authentication
router.post('/cleanup-duplicates', authMiddleware, async (req, res) => {
    try {
        const Activity = require('../models/Activity');
        const User = require('../models/User');
        
        // Get user from middleware
        const userId = req.user.userId;
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        console.log(`Cleaning up duplicates for user: ${user.email}`);
        
        // Find all ranking activities for this user
        const rankingActivities = await Activity.find({
            userId: userId,
            activityType: 'ranking'
        });
        
        // Group by category and achievementId
        const groups = {};
        rankingActivities.forEach(activity => {
            const category = activity.content.category;
            const achievementId = activity.content.achievementId;
            const key = `${category}-${achievementId}`;
            
            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(activity);
        });
        
        // Process each group
        let totalDuplicatesRemoved = 0;
        
        for (const [key, activities] of Object.entries(groups)) {
            if (activities.length <= 1) continue;
            
            console.log(`Found ${activities.length} activities for ${key}`);
            
            // Sort by createdAt (newest first)
            activities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            
            // Find any with reactions or comments
            const withEngagement = activities.filter(a => 
                (a.reactions && a.reactions.length > 0) || 
                (a.comments && a.comments.length > 0)
            );
            
            let keepActivity;
            
            if (withEngagement.length > 0) {
                // Keep the one with most engagement
                keepActivity = withEngagement.reduce((prev, current) => {
                    const prevEngagement = (prev.reactions?.length || 0) + (prev.comments?.length || 0);
                    const currentEngagement = (current.reactions?.length || 0) + (current.comments?.length || 0);
                    return prevEngagement >= currentEngagement ? prev : current;
                });
            } else {
                // If none have engagement, keep the newest
                keepActivity = activities[0];
            }
            
            // Get IDs to delete (all except the one to keep)
            const deleteIds = activities
                .filter(a => a._id.toString() !== keepActivity._id.toString())
                .map(a => a._id);
            
            if (deleteIds.length > 0) {
                console.log(`Deleting ${deleteIds.length} duplicates for ${key}, keeping ${keepActivity._id}`);
                await Activity.deleteMany({ _id: { $in: deleteIds }});
                totalDuplicatesRemoved += deleteIds.length;
            }
        }
        
        res.json({ 
            message: `Cleanup complete. Removed ${totalDuplicatesRemoved} duplicate activities.`,
            totalDuplicatesRemoved
        });
    } catch (error) {
        console.error('Error cleaning up duplicates:', error);
        res.status(500).json({ error: 'Failed to clean up duplicates' });
    }
});

module.exports = router;