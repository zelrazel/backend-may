const Activity = require('../models/Activity');
const User = require('../models/User');
const Notification = require('../models/Notification');

// Get all activities for the current user
exports.getUserActivities = async (req, res) => {
    try {
        // Extract the email from query parameter if provided
        const { email } = req.query;
        
        // If email is provided, fetch that user's activities
        // Otherwise, fetch the current user's activities
        let userId = req.user.userId;
        
        // If email is provided, find the user ID associated with that email
        if (email) {
            const userByEmail = await User.findOne({ email });
            
            if (!userByEmail) {
                return res.status(404).json({ error: 'User not found' });
            }
            
            userId = userByEmail._id;
        }
        
        // First, detect and clean up any duplicate achievement activities
        const cleanupPerformed = await removeDuplicateAchievements(userId);
        
        // Check if force refresh is requested
        const forceRefresh = req.headers && req.headers['x-force-refresh'] === 'true';
        
        // If force refresh is requested, update all user's activity profiles
        if (forceRefresh) {
            // Get user details to update activities with
            const user = await User.findById(userId);
            if (user) {
                await updateUserProfileInfo(userId, {
                    profilePicture: user.profilePicture,
                    firstName: user.firstName,
                    lastName: user.lastName
                });
                console.log(`Force refreshed all activities for user ${userId}`);
            }
        }
        
        // Get activities after cleanup and possible refresh
        // Make sure we only get activities created BY this user
        // Activities are filtered by userId to ensure we only get this specific user's activities
        const activities = await Activity.find({ userId })
            .sort({ createdAt: -1 })
            .populate('userId')
            .populate('comments.userId')
            .populate('reactions.userId');
            
        const populatedActivities = activities.map(activity => {
            const activityObj = activity.toObject();
            
            // Anonymize reactions and comments if appropriate
            if (activityObj.reactions) {
                activityObj.reactions = activityObj.reactions.map(reaction => ({
                    ...reaction,
                    userId: {
                        _id: reaction.userId._id,
                        firstName: reaction.userId.firstName,
                        lastName: reaction.userId.lastName,
                        profilePicture: reaction.userId.profilePicture,
                        email: reaction.userId.email
                    }
                }));
            }
            
            if (activityObj.comments) {
                activityObj.comments = activityObj.comments.map(comment => ({
                    ...comment,
                    userId: comment.userId ? {
                        _id: comment.userId._id,
                        firstName: comment.userId.firstName,
                        lastName: comment.userId.lastName,
                        profilePicture: comment.userId.profilePicture,
                        email: comment.userId.email
                    } : null
                }));
            }
            
            return {
                ...activityObj,
                userId: {
                    _id: activityObj.userId._id,
                    firstName: activityObj.userId.firstName,
                    lastName: activityObj.userId.lastName,
                    profilePicture: activityObj.userId.profilePicture,
                    email: activityObj.userId.email
                }
            };
        });
        
        // If we cleaned up duplicates, add a message to help diagnose
        const response = {
            activities: populatedActivities
        };
        
        if (cleanupPerformed) {
            response.message = "Duplicate achievements were cleaned up";
        }
        
        if (forceRefresh) {
            response.forceRefreshed = true;
        }
            
        res.json(response);
    } catch (error) {
        console.error('Error getting user activities:', error);
        res.status(500).json({ error: error.message });
    }
};

// Helper function to remove duplicate achievement activities
const removeDuplicateAchievements = async (userId) => {
    try {
        // Get all achievement activities for this user
        const activities = await Activity.find({ 
            userId: userId,
            activityType: 'achievement'
        });
        
        // Track unique achievement IDs and their oldest activities
        const achievementMap = {};
        const duplicatesToRemove = [];
        
        // First, sort all activities by creation date (oldest first)
        activities.sort((a, b) => a.createdAt - b.createdAt);
        
        // Identify duplicates (keeping the oldest for each achievement ID)
        for (const activity of activities) {
            if (activity.content && activity.content.achievementId) {
                const achievementId = activity.content.achievementId;
                
                if (achievementMap[achievementId]) {
                    // This is a duplicate - mark for removal
                    duplicatesToRemove.push(activity._id);
                } else {
                    // First occurrence - keep this one
                    achievementMap[achievementId] = activity._id;
                }
            }
        }
        
        // Delete all duplicates if any found
        if (duplicatesToRemove.length > 0) {
            console.log(`Removing ${duplicatesToRemove.length} duplicate achievement activities for user ${userId}`);
            for (const activityId of duplicatesToRemove) {
                await Activity.findByIdAndDelete(activityId);
            }
            return true; // Indicates changes were made
        }
        
        return false; // No changes needed
    } catch (error) {
        console.error('Error removing duplicate achievements:', error);
        return false;
    }
};

// Helper function to update user profile info across all activities
const updateUserProfileInfo = async (userId, updatedInfo) => {
    try {
        if (!userId) return false;
        
        // Get fields to update - only update fields that are provided
        const updateFields = {};
        if (updatedInfo.profilePicture !== undefined) {
            updateFields.userProfilePicture = updatedInfo.profilePicture;
        }
        if (updatedInfo.firstName !== undefined && updatedInfo.lastName !== undefined) {
            updateFields.userName = `${updatedInfo.firstName} ${updatedInfo.lastName}`;
        }
        
        // If there's nothing to update, exit early
        if (Object.keys(updateFields).length === 0) return false;
        
        // Update all activities where this user is the author
        const result = await Activity.updateMany(
            { userId: userId },
            { $set: updateFields }
        );
        
        // Update all comments made by this user
        const activities = await Activity.find({ "comments.userId": userId });
        
        for (const activity of activities) {
            let updated = false;
            
            // Update each comment made by this user
            for (const comment of activity.comments) {
                if (comment.userId.toString() === userId.toString()) {
                    if (updatedInfo.profilePicture !== undefined) {
                        comment.userProfilePicture = updatedInfo.profilePicture;
                    }
                    if (updatedInfo.firstName !== undefined && updatedInfo.lastName !== undefined) {
                        comment.userName = `${updatedInfo.firstName} ${updatedInfo.lastName}`;
                    }
                    updated = true;
                }
            }
            
            // Save if any comments were updated
            if (updated) {
                await activity.save();
            }
        }
        
        console.log(`Updated profile info in activities for user ${userId}`);
        return true;
    } catch (error) {
        console.error('Error updating user profile in activities:', error);
        return false;
    }
};

// Create activity for an achievement
exports.createAchievementActivity = async (req, res) => {
    try {
        const { 
            achievementId, 
            achievementTitle, 
            achievementDescription, 
            achievementIcon,
            achievementCategory = 'weightLoss',
            hideImage = false
        } = req.body;
        
        // Get user details
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check if an activity already exists for this achievement
        const existingActivity = await Activity.findOne({ 
            userId: req.user.userId,
            'content.achievementId': achievementId,
            activityType: 'achievement'
        });
        
        // If an activity for this achievement already exists, return it instead of creating a new one
        if (existingActivity && achievementCategory !== 'workout') {
            // Run cleanup to ensure there are no other duplicates
            await removeDuplicateAchievements(req.user.userId);
            
            return res.status(200).json({ 
                message: 'Activity already exists',
                activity: existingActivity
            });
        }

        // Process image URL only if not hidden and icon is provided
        let imageUrl = '';
        if (!hideImage && achievementIcon) {
            imageUrl = achievementIcon;
            // Fix specific paths based on how they're imported in the frontend
            if (imageUrl.includes('Weight Loss Badges/')) {
                imageUrl = `/Weight Loss Badges/${imageUrl.split('Weight Loss Badges/')[1]}`;
            } else if (imageUrl.includes('Strength-Based Badges/')) {
                imageUrl = `/Strength-Based Badges/${imageUrl.split('Strength-Based Badges/')[1]}`;
            } else if (imageUrl.includes('Consistency Badges/')) {
                imageUrl = `/Consistency Badges/${imageUrl.split('Consistency Badges/')[1]}`;
            } else if (imageUrl.includes('Hybrid Badges/')) {
                imageUrl = `/Hybrid Badges/${imageUrl.split('Hybrid Badges/')[1]}`;
            } 
            // For relative paths that use ../
            else if (imageUrl.startsWith('../')) {
                imageUrl = imageUrl.substring(3);
            }
            
            // If it's still not a URL or data URI, make it an absolute URL
            if (!imageUrl.startsWith('http') && !imageUrl.startsWith('data:') && !imageUrl.startsWith('/')) {
                imageUrl = `/${imageUrl}`;
            }
            
            // Store with the host prefix if not already an absolute URL
            if (!imageUrl.startsWith('http') && !imageUrl.startsWith('data:')) {
                const baseUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
                imageUrl = `${baseUrl}${imageUrl}`;
            }
        }

        // Create new activity
        const activity = new Activity({
            userId: req.user.userId,
            userName: `${user.firstName} ${user.lastName}`,
            userEmail: user.email,
            userProfilePicture: user.profilePicture || '',
            activityType: 'achievement',
            content: {
                title: achievementTitle,
                description: achievementDescription,
                imageUrl: imageUrl,
                achievementId: achievementId,
                category: achievementCategory,
                hideImage: hideImage
            }
        });

        await activity.save();
        res.status(201).json(activity);

    } catch (error) {
        console.error('Error creating achievement activity:', error);
        res.status(500).json({ error: error.message });
    }
};

// Create rank activities
exports.createRankActivity = async (req, res) => {
    try {
        const { 
            rankNumber, 
            rankCategory,
            rankTitle,
            rankDescription
        } = req.body;
        
        // Validate rank number (only top 3 ranks can create activities)
        if (!rankNumber || ![1, 2, 3].includes(Number(rankNumber))) {
            return res.status(400).json({ error: 'Invalid rank number. Only top 3 ranks can create activities.' });
        }
        
        // Get user details
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Ensure we have a valid category
        if (!rankCategory || !['weightLoss', 'strength', 'consistency', 'hybrid'].includes(rankCategory)) {
            return res.status(400).json({ error: 'Invalid rank category' });
        }

        // Check if an activity for this rank achievement already exists
        const existingActivity = await Activity.findOne({ 
            userId: req.user.userId,
            activityType: 'ranking',
            'content.achievementId': `rank-${rankNumber}-${rankCategory}`
        });
        
        if (existingActivity) {
            console.log(`Rank activity already exists for user ${user.email} with rank ${rankNumber} in ${rankCategory}`);
            return res.status(200).json({ 
                message: 'Rank activity already exists',
                activity: existingActivity
            });
        }
        
        // Generate title and description if not provided
        let finalTitle = rankTitle;
        let finalDescription = rankDescription;
        
        if (!finalTitle || !finalDescription) {
            // Get emoji for rank
            let rankEmoji = '';
            if (rankNumber === 1) rankEmoji = '👑';
            else if (rankNumber === 2) rankEmoji = '🥈';
            else if (rankNumber === 3) rankEmoji = '🥉';
            
            // Get display name for category
            let categoryName = rankCategory;
            if (rankCategory === 'weightLoss') categoryName = 'Weight Loss';
            else if (rankCategory === 'strength') categoryName = 'Strength-Based';
            else if (rankCategory === 'consistency') categoryName = 'Consistency';
            else if (rankCategory === 'hybrid') categoryName = 'Hybrid';
            
            // Get user-friendly rank name
            let rankName = '';
            if (rankNumber === 1) rankName = 'First Place';
            else if (rankNumber === 2) rankName = 'Second Place';
            else if (rankNumber === 3) rankName = 'Third Place';
            
            const userCourse = user.course || '';
            const courseText = userCourse ? ` on course ${userCourse}` : '';
            
            finalTitle = finalTitle || `Achieved ${rankName} ${rankEmoji}`;
            finalDescription = finalDescription || `Congratulations on achieving ${rankName.toLowerCase()} in the ${categoryName} leaderboard${courseText}!`;
        }

        // Create the rank activity
        const activity = new Activity({
            userId: req.user.userId,
            userName: `${user.firstName} ${user.lastName}`,
            userEmail: user.email,
            userProfilePicture: user.profilePicture || '',
            activityType: 'ranking',
            content: {
                title: finalTitle,
                description: finalDescription,
                category: rankCategory,
                achievementId: `rank-${rankNumber}-${rankCategory}`,
                userCourse: user.course || ''
            }
        });

        await activity.save();
        console.log(`Created rank activity for user ${user.email} with rank ${rankNumber} in ${rankCategory}`);
        
        res.status(201).json(activity);
    } catch (error) {
        console.error('Create rank activity error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Add a reaction to an activity
exports.addReaction = async (req, res) => {
    try {
        const { activityId, reactionType } = req.body;
        
        // Validate reaction type
        if (!['❤️', '🔥', '💪', '👏'].includes(reactionType)) {
            return res.status(400).json({ error: 'Invalid reaction type' });
        }
        
        // Get user details
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Get the activity
        const activity = await Activity.findById(activityId);
        if (!activity) {
            return res.status(404).json({ error: 'Activity not found' });
        }
        
        // Check for duplicate activities (particularly for ranking activities)
        if (activity.activityType === 'ranking' && activity.content && activity.content.achievementId) {
            const duplicates = await Activity.find({
                userId: activity.userId,
                activityType: 'ranking',
                _id: { $ne: activity._id }, // Exclude this activity
                'content.category': activity.content.category,
                'content.achievementId': activity.content.achievementId
            });
            
            if (duplicates.length > 0) {
                console.log(`Found ${duplicates.length} duplicates of this ranking activity. Merging reactions.`);
                
                // We'll merge all reactions to the current activity and delete the duplicates
                for (const duplicate of duplicates) {
                    // Merge reactions
                    for (const reaction of duplicate.reactions) {
                        // Skip if this reaction already exists in the main activity
                        const exists = activity.reactions.some(r => 
                            r.userId.toString() === reaction.userId.toString() && 
                            r.reactionType === reaction.reactionType
                        );
                        
                        if (!exists) {
                            activity.reactions.push(reaction);
                        }
                    }
                    
                    // Merge comments
                    for (const comment of duplicate.comments) {
                        // Skip if this comment already exists in the main activity
                        const exists = activity.comments.some(c => 
                            c.userId.toString() === comment.userId.toString() && 
                            c.content === comment.content
                        );
                        
                        if (!exists) {
                            activity.comments.push(comment);
                        }
                    }
                    
                    // Delete the duplicate
                    await Activity.findByIdAndDelete(duplicate._id);
                }
                
                // Save the merged activity
                await activity.save();
            }
        }
        
        // Check if user already reacted with this type
        const existingReaction = activity.reactions.find(
            r => r.userId.toString() === req.user.userId && r.reactionType === reactionType
        );
        
        // Remove all reactions from this user first
        activity.reactions = activity.reactions.filter(
            r => r.userId.toString() !== req.user.userId
        );
        
        if (existingReaction) {
            // This was a toggle-off action, leave the reactions empty for this user
            console.log(`User ${req.user.userId} removed their reaction: ${reactionType}`);
        } else {
            // Add the new reaction
            activity.reactions.push({
                userId: req.user.userId,
                userName: `${user.firstName} ${user.lastName}`,
                reactionType
            });
            console.log(`User ${req.user.userId} added reaction: ${reactionType}`);
            
            // Create notification if the activity owner is not the same person adding the reaction
            if (activity.userId.toString() !== req.user.userId.toString()) {
                // Get activity owner details
                const activityOwner = await User.findById(activity.userId);
                if (activityOwner) {
                    // Create a notification for the activity owner
                    const notification = new Notification({
                        recipient: activityOwner.email,
                        sender: user.email,
                        type: 'reaction',
                        content: {
                            message: `${user.firstName} ${user.lastName} reacted with ${reactionType} to your activity`,
                            activityId: activityId,
                            activityTitle: activity.content.title,
                            senderName: `${user.firstName} ${user.lastName}`,
                            senderProfilePic: user.profilePicture || '',
                            reactionType: reactionType,
                            activityOwnerEmail: activityOwner.email
                        }
                    });
                    
                    await notification.save();
                    console.log(`Created reaction notification for user ${activityOwner.email}`);
                }
            }
        }
        
        await activity.save();
        
        // Get list of reaction types the current user has on this activity
        const userReactions = activity.reactions
            .filter(r => r.userId.toString() === req.user.userId)
            .map(r => r.reactionType);
        
        res.json({
            message: existingReaction ? 'Reaction removed' : 'Reaction added',
            reactionCounts: activity.reactionCounts,
            userReactions: userReactions
        });
        
    } catch (error) {
        console.error('Error adding reaction:', error);
        res.status(500).json({ error: error.message });
    }
};

// Add a comment to an activity
exports.addComment = async (req, res) => {
    try {
        const { activityId, content } = req.body;
        
        if (!content || content.trim().length === 0) {
            return res.status(400).json({ error: 'Comment content is required' });
        }
        
        // Get user details
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Get the activity
        const activity = await Activity.findById(activityId);
        if (!activity) {
            return res.status(404).json({ error: 'Activity not found' });
        }
        
        const trimmedContent = content.trim();
        
        // Add the comment
        const newComment = {
            userId: req.user.userId,
            userName: `${user.firstName} ${user.lastName}`,
            userProfilePicture: user.profilePicture || '',
            content: trimmedContent,
            createdAt: new Date()
        };
        
        activity.comments.push(newComment);
        await activity.save();
        
        // Create notification if the activity owner is not the same person adding the comment
        if (activity.userId.toString() !== req.user.userId.toString()) {
            // Get activity owner details
            const activityOwner = await User.findById(activity.userId);
            if (activityOwner) {
                // Create a notification for the activity owner
                const notification = new Notification({
                    recipient: activityOwner.email,
                    sender: user.email,
                    type: 'activity_comment',
                    content: {
                        message: `${user.firstName} ${user.lastName} commented on your activity: "${trimmedContent.substring(0, 30)}${trimmedContent.length > 30 ? '...' : ''}"`,
                        activityId: activityId,
                        activityTitle: activity.content.title,
                        commentId: activity.comments[activity.comments.length - 1]._id,
                        senderName: `${user.firstName} ${user.lastName}`,
                        senderProfilePic: user.profilePicture || '',
                        commentPreview: trimmedContent.substring(0, 50),
                        activityOwnerEmail: activityOwner.email
                    }
                });
                
                await notification.save();
                console.log(`Created comment notification for user ${activityOwner.email}`);
            }
        }
        
        // Return only the new comment, not the whole activity
        res.status(201).json({
            message: 'Comment added',
            comment: activity.comments[activity.comments.length - 1],
            commentCount: activity.comments.length
        });
        
    } catch (error) {
        console.error('Error adding comment:', error);
        res.status(500).json({ error: error.message });
    }
};

// Delete a comment
exports.deleteComment = async (req, res) => {
    try {
        const { activityId, commentId } = req.params;
        
        // Get the activity
        const activity = await Activity.findById(activityId);
        if (!activity) {
            return res.status(404).json({ error: 'Activity not found' });
        }
        
        // Find the comment index
        const commentIndex = activity.comments.findIndex(
            comment => comment._id.toString() === commentId
        );
        
        if (commentIndex === -1) {
            return res.status(404).json({ error: 'Comment not found' });
        }
        
        // Check if this is the user's own comment
        if (activity.comments[commentIndex].userId.toString() !== req.user.userId) {
            return res.status(403).json({ error: 'You can only delete your own comments' });
        }
        
        // Remove the comment using pull
        activity.comments.splice(commentIndex, 1);
        await activity.save();
        
        res.json({
            message: 'Comment deleted',
            commentCount: activity.comments.length
        });
        
    } catch (error) {
        console.error('Error deleting comment:', error);
        res.status(500).json({ error: error.message });
    }
};

// Create activity for a workout
exports.createWorkoutActivity = async (req, res) => {
    try {
        console.log('Creating workout activity with data:', req.body);
        
        const { 
            workoutId,
            workoutName, 
            workoutCategory, 
            workoutTarget,
            exerciseName,
            sets,
            reps,
            weight
        } = req.body;
        
        // Get user details
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Format weight information
        const weightInfo = workoutCategory === 'Bodyweight' 
            ? '' 
            : ` with ${weight}kg`;

        // Create new activity
        const activity = new Activity({
            userId: req.user.userId,
            userName: `${user.firstName} ${user.lastName}`,
            userEmail: user.email,
            userProfilePicture: user.profilePicture || '',
            activityType: 'workout',
            content: {
                title: `Completed ${workoutCategory} Workout`,
                description: `${exerciseName} (${workoutTarget}): ${sets} sets × ${reps} reps${weightInfo}`,
                category: workoutCategory,
                achievementId: `workout-complete-${workoutId}-${Date.now()}`,
                hideImage: true
            }
        });

        await activity.save();
        console.log('Successfully created workout activity:', activity._id);
        res.status(201).json(activity);

    } catch (error) {
        console.error('Error creating workout activity:', error);
        res.status(500).json({ error: error.message });
    }
};

// Create activity for a completed workout
exports.createCompletedWorkoutActivity = async (req, res) => {
    try {
        const { 
            workoutName, 
            workoutCategory, 
            workoutTarget,
            exerciseName,
            sets,
            reps,
            weight
        } = req.body;
        
        // Get user details
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Create new activity
        const activity = new Activity({
            userId: req.user.userId,
            userName: `${user.firstName} ${user.lastName}`,
            userEmail: user.email,
            userProfilePicture: user.profilePicture || '',
            activityType: 'workout',
            content: {
                title: `Completed a ${workoutCategory} workout`,
                description: `${workoutName}: ${sets} sets x ${reps} reps of ${exerciseName} (${workoutTarget}) ${weight > 0 ? `with ${weight}kg` : ''}`,
                category: workoutCategory
            }
        });

        await activity.save();
        res.status(201).json(activity);

    } catch (error) {
        console.error('Error creating completed workout activity:', error);
        res.status(500).json({ error: error.message });
    }
};

// Create activity for scheduled workouts
exports.createScheduledWorkoutActivity = async (req, res) => {
    try {
        const { 
            workoutId,
            date,
            time, 
            category, 
            target,
            exerciseName
        } = req.body;
        
        // Get user details
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Format time
        const formattedTime = time ? formatTime(time) : '';
        
        // Create new activity
        const activity = new Activity({
            userId: req.user.userId,
            userName: `${user.firstName} ${user.lastName}`,
            userEmail: user.email,
            userProfilePicture: user.profilePicture || '',
            activityType: 'scheduled-workout',
            content: {
                title: `Scheduled a ${category} Workout`,
                description: `${exerciseName} (${target}) scheduled for ${date} at ${formattedTime}`,
                category: category,
                achievementId: `scheduled-workout-${workoutId || Date.now()}`,
                hideImage: true,
                // Add additional fields to help format the display
                exerciseName: exerciseName,
                target: target,
                date: date,
                time: formattedTime
            }
        });

        await activity.save();
        
        // Check if the workout is truly in the future by comparing full date and time
        const workoutDateTime = new Date(`${date}T${time}`);
        const now = new Date();
        
        if (workoutDateTime > now) {
            // Create a notification for the user about their scheduled workout
            const notification = new Notification({
                recipient: user.email,
                sender: user.email, // Self notification 
                type: 'scheduled_workout',
                content: {
                    message: `You scheduled a ${category} workout: ${exerciseName} (${target}) for ${date} at ${formattedTime}`,
                    workoutId: workoutId || activity._id,
                    exerciseName: exerciseName,
                    target: target,
                    date: date,
                    time: time,
                    category: category,
                    scheduledWorkout: true
                }
            });
            
            await notification.save();
            console.log('Created scheduled workout notification for user:', user.email);
            
            // Check if the workout is starting very soon (within 15 minutes)
            const timeDiff = workoutDateTime.getTime() - now.getTime();
            const minutesDiff = Math.round(timeDiff / (1000 * 60));
            
            if (minutesDiff <= 15) {
                // Create an immediate start notification
                const startSoonNotification = new Notification({
                    recipient: user.email,
                    sender: user.email,
                    type: 'scheduled_workout',
                    content: {
                        message: `🔔 STARTING SOON: Your ${category} workout (${exerciseName}) is scheduled to start in ${minutesDiff <= 1 ? 'less than a minute' : minutesDiff + ' minutes'}!`,
                        workoutId: workoutId || activity._id,
                        exerciseName: exerciseName,
                        target: target,
                        date: date,
                        time: time,
                        category: category,
                        scheduledWorkout: true,
                        isStartingSoon: true
                    }
                });
                
                await startSoonNotification.save();
                console.log('Created "starting soon" notification for workout:', workoutId || activity._id);
            }
        } else {
            console.log('Skipping notification for past workout time:', date, time);
        }
        
        console.log('Successfully created scheduled workout activity:', activity._id);
        res.status(201).json(activity);

    } catch (error) {
        console.error('Error creating scheduled workout activity:', error);
        res.status(500).json({ error: error.message });
    }
};

// Delete a scheduled workout activity
exports.deleteScheduledWorkoutActivity = async (req, res) => {
    try {
        const { workoutId } = req.params;
        
        if (!workoutId) {
            return res.status(400).json({ error: 'Workout ID is required' });
        }
        
        // Find and delete the activity
        const activity = await Activity.findOneAndDelete({
            userId: req.user.userId,
            activityType: 'scheduled-workout',
            'content.achievementId': `scheduled-workout-${workoutId}`
        });
        
        if (!activity) {
            console.log('No activity found for workout ID:', workoutId);
            return res.status(200).json({ message: 'No activity found for this workout' });
        }
        
        console.log('Successfully deleted scheduled workout activity for workout ID:', workoutId);
        res.status(200).json({ message: 'Scheduled workout activity deleted' });
        
    } catch (error) {
        console.error('Error deleting scheduled workout activity:', error);
        res.status(500).json({ error: error.message });
    }
};

// Helper function to format time for scheduled workouts
const formatTime = (time) => {
    if (!time) return '';
    
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours, 10);
    const isPM = hour >= 12;
    const formattedHour = hour % 12 || 12;
    
    return `${formattedHour}:${minutes} ${isPM ? 'PM' : 'AM'}`;
};

// Create activity for weight change (gain or loss)
exports.createWeightChangeActivity = async (req, res) => {
    try {
        const { 
            activityId,
            activityTitle, 
            activityDescription,
            changeType,
            changeAmount,
            newWeight
        } = req.body;
        
        // Get user details
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Determine category and image based on change type
        const category = 'weightTracking';
        
        // Create new activity
        const activity = new Activity({
            userId: req.user.userId,
            userName: `${user.firstName} ${user.lastName}`,
            userEmail: user.email,
            userProfilePicture: user.profilePicture || '',
            activityType: 'weight-change',
            content: {
                title: activityTitle,
                description: activityDescription,
                imageUrl: '', // No image for weight tracking activities
                achievementId: activityId,
                category: category,
                hideImage: true,
                changeType: changeType,
                changeAmount: changeAmount,
                newWeight: newWeight
            }
        });

        await activity.save();
        res.status(201).json(activity);
    } catch (error) {
        console.error('Error creating weight change activity:', error);
        res.status(500).json({ error: error.message });
    }
};

// Export helper functions for use in other files
exports.updateUserProfileInfo = updateUserProfileInfo; 