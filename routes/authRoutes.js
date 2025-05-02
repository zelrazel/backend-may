const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/jwt.config');
const User = require('../models/User');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

// Check if email exists
router.get('/check-email', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const existingUser = await User.findOne({ email });
    return res.json({ exists: !!existingUser });
  } catch (error) {
    console.error('Check email error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Check if phone number exists
router.get('/check-phone', async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) {
      return res.status(400).json({ message: 'Phone number is required' });
    }

    const existingUser = await User.findOne({ phoneNumber: phone });
    return res.json({ exists: !!existingUser });
  } catch (error) {
    console.error('Check phone error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Register
router.post('/signup', async (req, res) => {
  try {
    const { 
      firstName, 
      lastName, 
      email, 
      password,
      course,
      height,
      weight,
      gender,
      age,
      phoneNumber 
    } = req.body;

    // Validate email format
    if (!email.match(/^[^\s@]+@[^\s@]+\.com$/)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    // Check if all required fields are present
    const requiredFields = [
      'firstName', 
      'lastName', 
      'email', 
      'password',
      'course',
      'height',
      'weight',
      'gender',
      'age',
      'phoneNumber'
    ];

    const missingFields = requiredFields.filter(field => !req.body[field]);
    if (missingFields.length > 0) {
      return res.status(400).json({ message: `Missing required fields: ${missingFields.join(', ')}` });
    }

    // Check for existing email
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    // Check for existing phone number
    const existingPhone = await User.findOne({ phoneNumber });
    if (existingPhone) {
      return res.status(400).json({ message: 'Phone number already exists' });
    }

    // Create new user with initialWeight set to the signup weight
    const user = new User({ 
      firstName, 
      lastName, 
      email, 
      password,
      course,
      height: parseFloat(height),
      weight: parseFloat(weight),
      initialWeight: parseFloat(weight), // Add this line
      gender,
      age: parseInt(age),
      phoneNumber
    });

    await user.save();
    console.log(`✅ User signed up: ${email}`);
    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Login
router.post('/signin', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
        { userId: user._id, email: user.email }, 
        JWT_SECRET,
        { expiresIn: '3h' }
    );

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
    console.error('Signin error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Auth check endpoint to get userId from token
router.get('/check', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ 
      userId: user._id,
      email: user.email
    });
  } catch (error) {
    console.error('Auth check error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Logout
router.post('/signout', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required for signout' });
    console.log(`✅ User signed out successfully: ${email}`);
    res.json({ message: 'User signed out successfully' });
  } catch (error) {
    console.error('❌ Signout Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});


module.exports = router;
