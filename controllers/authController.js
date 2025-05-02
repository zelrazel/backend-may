const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Streak = require('../models/Streak'); 

const router = express.Router();

// Register User
router.post('/signup', async (req, res) => {
    try {
        const { firstName, lastName, email, password } = req.body;
        const user = new User({ firstName, lastName, email, password });
        await user.save();
        console.log('New user registered:', email);
        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        console.error('Signup error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

//  Login User & Update Streak
router.post('/signin', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('Signin attempt:', email);
        
        const user = await User.findOne({ email });
        if (!user) {
            console.log('User not found:', email);
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            console.log('Invalid password attempt for:', email);
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ userId: user._id }, 'secret', { expiresIn: '3h' });

        console.log('User signed in:', email);

        // Ensure the user's streak entry exists
        let userStreak = await Streak.findOne({ email });

        if (!userStreak) {
            userStreak = new Streak({ email, streakCount: 1, lastLogin: new Date() });
        } else {
            const today = new Date().setHours(0, 0, 0, 0);
            const lastLogin = new Date(userStreak.lastLogin).setHours(0, 0, 0, 0);

            if (today - lastLogin === 86400000) {
                userStreak.streakCount += 1;
            } else if (today - lastLogin > 86400000) {
                userStreak.streakCount = 1;
            }
            userStreak.lastLogin = today;
        }

        await userStreak.save();

        res.json({ 
            token, 
            user: { 
                id: user._id, 
                firstName: user.firstName, 
                lastName: user.lastName, 
                email: user.email 
            } 
        });

    } catch (error) {
        console.error('Signin error:', error.message);
        res.status(500).json({ error: error.message });
    }
});


// Logout User
router.post('/signout', (req, res) => {
  res.json({ message: 'User signed out' });
});

module.exports = router;
