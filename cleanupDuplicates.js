const mongoose = require('mongoose');
const Activity = require('./models/Activity');
require('dotenv').config();

async function removeDuplicatesNow() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGO_URI);
    
    console.log('Finding all achievement activities...');
    const activities = await Activity.find({activityType: 'achievement'});
    
    console.log(`Found ${activities.length} total achievement activities`);
    
    // Group activities by user and achievement ID
    const userGroups = {};
    
    activities.forEach(activity => {
      if (activity.content && activity.content.achievementId) {
        const userId = activity.userId.toString();
        if (!userGroups[userId]) userGroups[userId] = {};
        
        const achievementId = activity.content.achievementId;
        if (!userGroups[userId][achievementId]) userGroups[userId][achievementId] = [];
        
        userGroups[userId][achievementId].push(activity);
      }
    });
    
    // Process each user's duplicates
    let totalDuplicatesRemoved = 0;
    
    for (const userId in userGroups) {
      for (const achievementId in userGroups[userId]) {
        const userAchievements = userGroups[userId][achievementId];
        
        // If we have duplicates
        if (userAchievements.length > 1) {
          // Sort by creation date (oldest first)
          userAchievements.sort((a, b) => a.createdAt - b.createdAt);
          
          // Keep the first, delete the rest
          const [keep, ...duplicates] = userAchievements;
          
          console.log(`User ${userId}: Found ${duplicates.length} duplicates for achievement ${achievementId}`);
          
          // Delete duplicates
          for (const duplicate of duplicates) {
            await Activity.findByIdAndDelete(duplicate._id);
            totalDuplicatesRemoved++;
          }
        }
      }
    }
    
    console.log(`Cleanup complete. Removed ${totalDuplicatesRemoved} duplicate activities.`);
    mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the cleanup
removeDuplicatesNow(); 