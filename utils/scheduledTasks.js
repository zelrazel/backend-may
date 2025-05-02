const cron = require('node-cron');
const WorkoutSchedule = require('../models/WorkoutSchedule');
const Notification = require('../models/Notification');
const User = require('../models/User');

// Helper function to format time
const formatTime = (time) => {
    if (!time) return '';
    
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours, 10);
    const isPM = hour >= 12;
    const formattedHour = hour % 12 || 12;
    
    return `${formattedHour}:${minutes} ${isPM ? 'PM' : 'AM'}`;
};

// Function to send workout reminder notifications
// This runs every 15 minutes to check for workouts coming up in the next 30 minutes
const sendWorkoutReminders = async () => {
    try {
        console.log('Running scheduled task: checking for upcoming workouts...');
        
        const now = new Date();
        const thirtyMinutesLater = new Date(now.getTime() + 30 * 60000);
        
        // Format dates for comparison with the stored format
        const today = now.toISOString().split('T')[0]; // YYYY-MM-DD
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const reminderHour = thirtyMinutesLater.getHours();
        const reminderMinute = thirtyMinutesLater.getMinutes();
        
        // Find workouts scheduled for today that are coming up in the next 30 minutes
        const upcomingWorkouts = await WorkoutSchedule.find({
            date: today
        });
        
        console.log(`Found ${upcomingWorkouts.length} workouts scheduled for today`);
        
        // Check each workout to see if it's within the next 30 minutes
        for (const workout of upcomingWorkouts) {
            const [workoutHour, workoutMinute] = workout.time.split(':').map(Number);
            
            // Convert all to minutes for easier comparison
            const workoutTimeInMinutes = workoutHour * 60 + workoutMinute;
            const currentTimeInMinutes = currentHour * 60 + currentMinute;
            const reminderTimeInMinutes = reminderHour * 60 + reminderMinute;
            
            // Check if workout is within our 30-minute reminder window and hasn't started yet
            if (workoutTimeInMinutes > currentTimeInMinutes && 
                workoutTimeInMinutes <= reminderTimeInMinutes) {
                
                console.log(`Sending reminder for workout: ${workout.exerciseName} at ${workout.time}`);
                
                // Check if a reminder notification already exists for this workout
                const existingNotification = await Notification.findOne({
                    'content.workoutId': workout._id.toString(),
                    'content.isReminder': true
                });
                
                if (!existingNotification) {
                    // Format time for display
                    const formattedTime = formatTime(workout.time);
                    
                    // Create a reminder notification
                    const notification = new Notification({
                        recipient: workout.userEmail,
                        sender: workout.userEmail, // Self notification
                        type: 'scheduled_workout',
                        content: {
                            message: `REMINDER: Your ${workout.category} workout: ${workout.exerciseName} (${workout.target}) is coming up at ${formattedTime}!`,
                            workoutId: workout._id,
                            exerciseName: workout.exerciseName,
                            target: workout.target,
                            date: workout.date,
                            time: workout.time,
                            category: workout.category,
                            scheduledWorkout: true,
                            isReminder: true // Flag to identify this as a reminder notification
                        }
                    });
                    
                    await notification.save();
                    console.log('Created workout reminder notification for:', workout.userEmail);
                } else {
                    console.log('Reminder notification already exists for this workout');
                }
            }
        }
    } catch (error) {
        console.error('Error sending workout reminders:', error);
    }
};

// Initialize scheduled tasks
const initScheduledTasks = () => {
    // Run every 15 minutes to check for upcoming workouts
    cron.schedule('*/15 * * * *', sendWorkoutReminders);
    
    console.log('Scheduled tasks initialized');
};

module.exports = {
    initScheduledTasks
}; 