const Weight = require('../models/Weight');
const User = require('../models/User');
const Streak = require('../models/Streak');
const Workout = require('../models/Workout');
const CompletedWorkout = require('../models/CompletedWorkout');
const Activity = require('../models/Activity');

exports.getWeightLossLeaderboard = async (req, res) => {
    try {
        console.log('Starting weight loss leaderboard fetch...');
        const course = req.query.course || 'BSCS'; // Default to BSCS if no course is specified
        console.log(`Filtering by course: ${course}`);
        
        const users = await User.find({ course: course })
            .select('firstName lastName email profilePicture weight initialWeight course isPrivate')
            .lean();
        
        console.log(`Found ${users.length} total users for course ${course}`);
        
        const weightHistories = await Weight.find({}).sort({ date: -1 });
        console.log(`Found ${weightHistories.length} weight entries`);

        // Get current week's date range
        const today = new Date();
        const startOfWeek = new Date(today);
        startOfWeek.setHours(0, 0, 0, 0);
        startOfWeek.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)

        const leaderboardData = await Promise.all(users.map(async (user) => {
            const userWeights = weightHistories.filter(w => w.userEmail === user.email);
            
            if (userWeights.length === 0) return null;

            const startingWeight = user.initialWeight || userWeights[userWeights.length - 1].weight;
            const currentWeight = userWeights[0].weight;

            // Count unique days in current week
            const daysThisWeek = new Set(
                userWeights
                    .filter(w => new Date(w.date) >= startOfWeek)
                    .map(w => new Date(w.date).toDateString())
            ).size;

            // Calculate bonus based on current week's activity
            let consistencyBonus = 0;
            if (daysThisWeek >= 5) {
                consistencyBonus = 0.5; // 50% bonus
            } else if (daysThisWeek >= 3) {
                consistencyBonus = 0.25; // 25% bonus
            } else if (daysThisWeek >= 1) {
                consistencyBonus = 0.1; // 10% bonus
            }

            const weightLoss = startingWeight - currentWeight;
            const totalScore = weightLoss * (1 + consistencyBonus);

            return {
                _id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                profilePicture: user.profilePicture,
                course: user.course,
                isPrivate: user.isPrivate || false,
                startingWeight,
                currentWeight,
                weightLoss,
                consistencyBonus,
                weighInDays: daysThisWeek,
                totalScore
            };
        }));

        console.log(`Processed ${leaderboardData.length} users for weight loss leaderboard`);
        
        const validEntries = leaderboardData.filter(entry => entry !== null);
        console.log(`Found ${validEntries.length} valid entries (non-null)`);
        
        const sortedEntries = validEntries.sort((a, b) => b.totalScore - a.totalScore);
        console.log(`Sending ALL ${sortedEntries.length} sorted entries`);
        
        // Create rank activities for top 3 users
        if (sortedEntries.length > 0) {
            // Get full user info for the top 3 users
            const top3Users = sortedEntries.slice(0, Math.min(3, sortedEntries.length));
            for (let i = 0; i < top3Users.length; i++) {
                const user = await User.findOne({ email: top3Users[i].email });
                if (user) {
                    // Create rank activity for this user with their rank (1-indexed)
                    await createRankActivityIfNeeded(user, i + 1, 'weightLoss');
                }
            }
        }
        
        res.json(sortedEntries);
    } catch (error) {
        console.error('Leaderboard error:', error);
        res.status(500).json({ error: 'Failed to fetch leaderboard data' });
    }
};

exports.getStrengthLeaderboard = async (req, res) => {
    try {
        console.log('Starting strength leaderboard fetch...');
        const course = req.query.course || 'BSCS'; // Default to BSCS if no course is specified
        const { startDate, endDate } = req.query;
        let start = startDate ? new Date(startDate) : null;
        let end = endDate ? new Date(endDate) : null;
        if (end) { end.setHours(23,59,59,999); }
        console.log(`Filtering by course: ${course}`);
        
        // Get all users with their weights
        const users = await User.find({ course: course })
            .select('firstName lastName email profilePicture weight course isPrivate')
            .lean();
        
        console.log(`Found ${users.length} total users for course ${course}`);

        // Get all completed workouts
        const completedWorkouts = await CompletedWorkout.find({})
            .sort({ completedDate: -1 })
            .lean();
        
        console.log(`Found ${completedWorkouts.length} completed workouts`);

        const leaderboardData = users.map(user => {
            // Get all completed workouts for this user, filtered by date if provided
            let userWorkouts = completedWorkouts.filter(w => w.userEmail === user.email);
            if (start) userWorkouts = userWorkouts.filter(w => new Date(w.completedDate) >= start);
            if (end) userWorkouts = userWorkouts.filter(w => new Date(w.completedDate) <= end);
            
            if (userWorkouts.length === 0) return null;

            // Calculate total strength score using completed workouts
            let totalStrengthScore = userWorkouts.reduce((total, workout) => {
                const weight = workout.category === 'Bodyweight' 
                    ? (user.weight || 0) 
                    : workout.weightLifted;
                
                return total + (weight * workout.setsCompleted * workout.repsCompleted);
            }, 0);

            totalStrengthScore = Number(totalStrengthScore) || 0;

            return {
                _id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                profilePicture: user.profilePicture,
                course: user.course,
                isPrivate: user.isPrivate || false,
                strengthScore: totalStrengthScore,
                workoutCount: userWorkouts.length,
                totalVolume: totalStrengthScore.toFixed(2)
            };
        });

        console.log(`Processed ${leaderboardData.length} users for strength leaderboard`);
        
        const validEntries = leaderboardData.filter(entry => entry !== null);
        console.log(`Found ${validEntries.length} valid entries (non-null)`);
        
        const sortedEntries = validEntries.sort((a, b) => b.strengthScore - a.strengthScore);
        console.log(`Sending ALL ${sortedEntries.length} sorted entries`);
        
        // Create rank activities for top 3 users
        if (sortedEntries.length > 0) {
            // Get full user info for the top 3 users
            const top3Users = sortedEntries.slice(0, Math.min(3, sortedEntries.length));
            for (let i = 0; i < top3Users.length; i++) {
                const user = await User.findOne({ email: top3Users[i].email });
                if (user) {
                    // Create rank activity for this user with their rank (1-indexed)
                    await createRankActivityIfNeeded(user, i + 1, 'strength');
                }
            }
        }
        
        res.json(sortedEntries);
    } catch (error) {
        console.error('Strength leaderboard error:', error);
        res.status(500).json({ error: 'Failed to fetch strength leaderboard data' });
    }
};

exports.getConsistencyLeaderboard = async (req, res) => {
    try {
        console.log('Starting consistency leaderboard fetch...');
        const course = req.query.course || 'BSCS'; // Default to BSCS if no course is specified
        const { startDate, endDate } = req.query;
        let start = startDate ? new Date(startDate) : null;
        let end = endDate ? new Date(endDate) : null;
        if (end) { end.setHours(23,59,59,999); }
        console.log(`Filtering by course: ${course}`);
        
        const users = await User.find({ course: course })
            .select('firstName lastName email profilePicture course isPrivate')
            .lean();
        
        console.log(`Found ${users.length} total users for course ${course}`);

        const completedWorkouts = await CompletedWorkout.find()
            .sort({ completedDate: -1 })
            .lean();
        
        console.log(`Found ${completedWorkouts.length} completed workouts`);

        const leaderboardData = await Promise.all(users.map(async user => {
            // Get all completed workouts for this user, filtered by date if provided
            let userWorkouts = completedWorkouts.filter(w => w.userEmail === user.email);
            if (start) userWorkouts = userWorkouts.filter(w => new Date(w.completedDate) >= start);
            if (end) userWorkouts = userWorkouts.filter(w => new Date(w.completedDate) <= end);
            
            if (userWorkouts.length === 0) return null;

            // Calculate active days (unique days with workouts)
            const uniqueDays = new Set(
                userWorkouts.map(workout => 
                    new Date(workout.completedDate).toDateString()
                )
            );
            const activeDays = uniqueDays.size;

            // Calculate consistency score using the correct formula:
            // Total Workouts Completed + (Active Days × 10)
            const consistencyScore = userWorkouts.length + (activeDays * 10);

            return {
                _id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                profilePicture: user.profilePicture,
                course: user.course,
                isPrivate: user.isPrivate || false,
                totalWorkouts: userWorkouts.length,
                activeDays: activeDays,
                consistencyScore: consistencyScore
            };
        }));

        console.log(`Processed ${leaderboardData.length} users for consistency leaderboard`);
        
        const validEntries = leaderboardData.filter(entry => entry !== null);
        console.log(`Found ${validEntries.length} valid entries (non-null)`);
        
        const sortedEntries = validEntries.sort((a, b) => b.consistencyScore - a.consistencyScore);
        console.log(`Sending ALL ${sortedEntries.length} sorted entries`);
        
        // Create rank activities for top 3 users
        if (sortedEntries.length > 0) {
            // Get full user info for the top 3 users
            const top3Users = sortedEntries.slice(0, Math.min(3, sortedEntries.length));
            for (let i = 0; i < top3Users.length; i++) {
                const user = await User.findOne({ email: top3Users[i].email });
                if (user) {
                    // Create rank activity for this user with their rank (1-indexed)
                    await createRankActivityIfNeeded(user, i + 1, 'consistency');
                }
            }
        }
        
        res.json(sortedEntries);
    } catch (error) {
        console.error('Consistency leaderboard error:', error);
        res.status(500).json({ error: 'Failed to fetch consistency leaderboard data' });
    }
};

exports.getHybridLeaderboard = async (req, res) => {
    try {
        console.log('Starting hybrid leaderboard fetch...');
        const course = req.query.course || 'BSCS'; // Default to BSCS if no course is specified
        const { startDate, endDate } = req.query;
        let start = startDate ? new Date(startDate) : null;
        let end = endDate ? new Date(endDate) : null;
        if (end) { end.setHours(23,59,59,999); }
        console.log(`Filtering by course: ${course}`);
        
        const users = await User.find({ course: course })
            .select('firstName lastName email profilePicture course isPrivate')
            .lean();
        
        console.log(`Found ${users.length} total users for course ${course}`);

        const completedWorkouts = await CompletedWorkout.find()
            .sort({ completedDate: -1 })
            .lean();
        
        console.log(`Found ${completedWorkouts.length} completed workouts`);

        const leaderboardData = await Promise.all(users.map(async user => {
            // Get all completed workouts for this user, filtered by date if provided
            let userWorkouts = completedWorkouts.filter(w => w.userEmail === user.email);
            if (start) userWorkouts = userWorkouts.filter(w => new Date(w.completedDate) >= start);
            if (end) userWorkouts = userWorkouts.filter(w => new Date(w.completedDate) <= end);
            
            if (userWorkouts.length === 0) return null;

            const uniqueDays = new Set(
                userWorkouts.map(workout => 
                    new Date(workout.completedDate).toDateString()
                )
            );
            const activeDays = uniqueDays.size;

            const totalVolume = userWorkouts.reduce((sum, workout) => {
                const volume = workout.weightLifted * workout.repsCompleted * workout.setsCompleted;
                return sum + volume;
            }, 0);

            const hybridScore = totalVolume + (activeDays * 10);

            return {
                _id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                profilePicture: user.profilePicture,
                course: user.course,
                isPrivate: user.isPrivate || false,
                totalVolume: totalVolume,
                activeDays: activeDays,
                hybridScore: hybridScore,
                totalWorkouts: userWorkouts.length
            };
        }));

        console.log(`Processed ${leaderboardData.length} users for hybrid leaderboard`);
        
        const validEntries = leaderboardData.filter(entry => entry !== null);
        console.log(`Found ${validEntries.length} valid entries (non-null)`);
        
        const sortedEntries = validEntries.sort((a, b) => b.hybridScore - a.hybridScore);
        console.log(`Sending ALL ${sortedEntries.length} sorted entries`);
        
        // Create rank activities for top 3 users
        if (sortedEntries.length > 0) {
            // Get full user info for the top 3 users
            const top3Users = sortedEntries.slice(0, Math.min(3, sortedEntries.length));
            for (let i = 0; i < top3Users.length; i++) {
                const user = await User.findOne({ email: top3Users[i].email });
                if (user) {
                    // Create rank activity for this user with their rank (1-indexed)
                    await createRankActivityIfNeeded(user, i + 1, 'hybrid');
                }
            }
        }
        
        res.json(sortedEntries);
    } catch (error) {
        console.error('Hybrid leaderboard error:', error);
        res.status(500).json({ error: 'Failed to fetch hybrid leaderboard data' });
    }
};

// Helper function to find rank
function findRank(data, userEmail) {
    if (!data || !Array.isArray(data)) return { rank: 0, total: 0 };
    
    const userIndex = data.findIndex(user => user.email === userEmail);
    return {
        rank: userIndex !== -1 ? userIndex + 1 : 0,
        total: data.length
    };
}

// Update getUserRanks to work with full data and filter by course
exports.getUserRanks = async (req, res) => {
    try {
        const userEmail = req.params.email;
        
        // First find the user's course
        const user = await User.findOne({ email: userEmail }).select('course');
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Use the user's actual course for filtering
        const userCourse = user.course || 'BSCS';
        console.log(`Fetching ranks for user: ${userEmail} with course: ${userCourse}`);
        
        // Manually get all leaderboard data
        // Weight Loss
        const users = await User.find({ course: userCourse })
            .select('firstName lastName email profilePicture weight initialWeight course')
            .lean();
        
        const weightHistories = await Weight.find({}).sort({ date: -1 });
        
        // Get current week's date range
        const today = new Date();
        const startOfWeek = new Date(today);
        startOfWeek.setHours(0, 0, 0, 0);
        startOfWeek.setDate(today.getDate() - today.getDay());
        
        // Process weight loss data
        const weightLossData = [];
        for (const user of users) {
            const userWeights = weightHistories.filter(w => w.userEmail === user.email);
            
            if (userWeights.length === 0) continue;
            
            const startingWeight = user.initialWeight || userWeights[userWeights.length - 1].weight;
            const currentWeight = userWeights[0].weight;
            
            const daysThisWeek = new Set(
                userWeights
                    .filter(w => new Date(w.date) >= startOfWeek)
                    .map(w => new Date(w.date).toDateString())
            ).size;
            
            let consistencyBonus = 0;
            if (daysThisWeek >= 5) {
                consistencyBonus = 0.5;
            } else if (daysThisWeek >= 3) {
                consistencyBonus = 0.25;
            } else if (daysThisWeek >= 1) {
                consistencyBonus = 0.1;
            }
            
            const weightLoss = startingWeight - currentWeight;
            const totalScore = weightLoss * (1 + consistencyBonus);
            
            weightLossData.push({
                email: user.email,
                totalScore
            });
        }
        
        // Get completed workouts for other categories
        const completedWorkouts = await CompletedWorkout.find()
            .sort({ completedDate: -1 })
            .lean();
        
        // Process strength data
        const strengthData = [];
        for (const user of users) {
            const userWorkouts = completedWorkouts.filter(w => w.userEmail === user.email);
            
            if (userWorkouts.length === 0) continue;
            
            let totalStrengthScore = userWorkouts.reduce((total, workout) => {
                const weight = workout.category === 'Bodyweight' 
                    ? (user.weight || 0) 
                    : workout.weightLifted;
                
                return total + (weight * workout.setsCompleted * workout.repsCompleted);
            }, 0);
            
            totalStrengthScore = Number(totalStrengthScore) || 0;
            
            strengthData.push({
                email: user.email,
                strengthScore: totalStrengthScore
            });
        }
        
        // Process consistency data
        const consistencyData = [];
        for (const user of users) {
            const userWorkouts = completedWorkouts.filter(w => w.userEmail === user.email);
            
            if (userWorkouts.length === 0) continue;
            
            const uniqueDays = new Set(
                userWorkouts.map(workout => 
                    new Date(workout.completedDate).toDateString()
                )
            );
            const activeDays = uniqueDays.size;
            
            const consistencyScore = userWorkouts.length + (activeDays * 10);
            
            consistencyData.push({
                email: user.email,
                consistencyScore
            });
        }
        
        // Process hybrid data
        const hybridData = [];
        for (const user of users) {
            const userWorkouts = completedWorkouts.filter(w => w.userEmail === user.email);
            
            if (userWorkouts.length === 0) continue;
            
            const uniqueDays = new Set(
                userWorkouts.map(workout => 
                    new Date(workout.completedDate).toDateString()
                )
            );
            const activeDays = uniqueDays.size;
            
            const totalVolume = userWorkouts.reduce((sum, workout) => {
                const volume = workout.weightLifted * workout.repsCompleted * workout.setsCompleted;
                return sum + volume;
            }, 0);
            
            const hybridScore = totalVolume + (activeDays * 10);
            
            hybridData.push({
                email: user.email,
                hybridScore
            });
        }
        
        // Sort all data
        weightLossData.sort((a, b) => b.totalScore - a.totalScore);
        strengthData.sort((a, b) => b.strengthScore - a.strengthScore);
        consistencyData.sort((a, b) => b.consistencyScore - a.consistencyScore);
        hybridData.sort((a, b) => b.hybridScore - a.hybridScore);
        
        // Find ranks
        const weightLossRank = findRankInArray(weightLossData, userEmail);
        const strengthRank = findRankInArray(strengthData, userEmail);
        const consistencyRank = findRankInArray(consistencyData, userEmail);
        const hybridRank = findRankInArray(hybridData, userEmail);
        
        // Return all ranks
        res.json({
            weightLoss: weightLossRank,
            strength: strengthRank,
            consistency: consistencyRank,
            hybrid: hybridRank,
            course: userCourse
        });
        
    } catch (error) {
        console.error('Get user ranks error:', error);
        res.status(500).json({ error: 'Failed to fetch user ranks' });
    }
};

// Helper function to find rank in array
function findRankInArray(data, userEmail) {
    if (!data || !Array.isArray(data) || data.length === 0) return { rank: 0, total: 0 };
    
    const userIndex = data.findIndex(item => item.email === userEmail);
    return {
        rank: userIndex !== -1 ? userIndex + 1 : 0,
        total: data.length
    };
}

// Helper function to create rank activities
async function createRankActivityIfNeeded(user, rankNumber, category) {
    try {
        if (!user || !user.email || rankNumber > 3) {
            return null; // Only create activities for ranks 1-3
        }
        
        const userId = user._id;
        const Activity = require('../models/Activity');
        const axios = require('axios');
        
        // Check if activity already exists
        const existingActivity = await Activity.findOne({
            userId: userId,
            activityType: 'ranking',
            'content.category': category,
            'content.achievementId': `rank-${rankNumber}-${category}`
        });
        
        if (existingActivity) {
            console.log(`Rank activity already exists for user ${user.email} with rank ${rankNumber} in ${category}`);
            return null;
        }
        
        // Get category display name
        let categoryName = '';
        switch (category) {
            case 'weightLoss':
                categoryName = 'Weight Loss';
                break;
            case 'strength':
                categoryName = 'Strength';
                break;
            case 'consistency':
                categoryName = 'Consistency';
                break;
            case 'hybrid':
                categoryName = 'Hybrid';
                break;
            default:
                categoryName = category;
        }
        
        // Get rank emoji
        let rankEmoji = '';
        switch (rankNumber) {
            case 1:
                rankEmoji = '👑';
                break;
            case 2:
                rankEmoji = '🥈';
                break;
            case 3:
                rankEmoji = '🥉';
                break;
        }
        
        // Get course text
        const userCourse = user.course || '';
        const courseText = userCourse ? ` on course ${userCourse}` : '';
        
        // Create activity
        const activity = new Activity({
            userId: userId,
            userName: `${user.firstName} ${user.lastName}`,
            userEmail: user.email,
            userProfilePicture: user.profilePicture || '',
            activityType: 'ranking',
            content: {
                title: `Achieved Rank ${rankNumber} ${rankEmoji}`,
                description: `Congratulations on achieving rank ${rankNumber} in the ${categoryName} leaderboard${courseText}!`,
                category: category,
                achievementId: `rank-${rankNumber}-${category}`,
                userCourse: userCourse
            }
        });
        
        await activity.save();
        console.log(`Created rank activity for user ${user.email} with rank ${rankNumber} in ${category}`);
        return activity;
        
    } catch (error) {
        console.error(`Error creating rank activity: ${error.message}`);
        return null;
    }
}