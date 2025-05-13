require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const User = require('./models/User');
const authRoutes = require('./routes/authRoutes');
const workoutRoutes = require('./routes/workoutRoutes'); 
const profileRoutes = require('./routes/profileRoutes');
const path = require('path');
const workoutScheduleRoutes = require('./routes/workoutScheduleRoutes');
const streakRoutes = require('./routes/streakRoutes'); 
const friendRoutes = require("./routes/friendRoutes");
const weightRoutes = require('./routes/weightRoutes');
const leaderboardRoutes = require('./routes/leaderboardRoutes');
const activityRoutes = require('./routes/activityRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const { initScheduledTasks } = require('./utils/scheduledTasks');
const app = express();

// CORS configuration
console.log('🔑 Setting CORS origin:', process.env.FRONTEND_URL);
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Serve static files from the public directory
app.use(express.static('public'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/workouts', workoutRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/workout-schedule', workoutScheduleRoutes);
app.use('/api/streak', streakRoutes);
app.use('/api/weight', weightRoutes);
app.use('/api/friends', friendRoutes); 
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/notifications', notificationRoutes);

console.log("🚀 Server.js is running...");

// Ensure MongoDB URI is set
const mongoURI = process.env.MONGO_URI;
if (!mongoURI) {
  console.error("❌ ERROR: MONGO_URI is not defined in .env file!");
  process.exit(1);
}

async function migrateIsPrivateField() {
    try {
        const result = await User.updateMany(
            { isPrivate: { $exists: false } },
            { $set: { isPrivate: false } }
        );
        console.log('✅ Privacy field migration completed:', result.modifiedCount, 'users updated');
    } catch (error) {
        console.error('❌ Privacy field migration failed:', error);
    }
}

// Update the MongoDB connection to include migration
mongoose.connect(mongoURI)
    .then(async () => {
        console.log('✅ MongoDB Connected');
        await migrateIsPrivateField();
        
        // Initialize scheduled tasks for workout reminders
        initScheduledTasks();
        console.log('✅ Scheduled tasks initialized for workout reminders');
    })
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// Base route
app.get('/', (req, res) => {
  res.send('🚀 Gym Web App Backend is Running!');
});

// Health check route
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

