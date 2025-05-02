const express = require('express');
const User = require('../models/User');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const cloudinary = require('../config/cloudinary');
const { updateUserProfileInfo } = require('../controllers/activityController');
const axios = require('axios');

//  Configure multer for file storage
const storage = multer.memoryStorage();

// allowed file types
const ALLOWED_FILE_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    'image/tiff'
];

const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB in bytes
    },
    fileFilter: (req, file, cb) => {
        if (ALLOWED_FILE_TYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only images and GIF files are allowed. Supported formats: JPG, PNG, GIF, WebP, BMP, TIFF'));
        }
    }
});

//  Fetch user profile
router.get('/', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            course: user.course,
            height: user.height,
            weight: user.weight,
            initialWeight: user.initialWeight,
            gender: user.gender,
            age: user.age,
            phoneNumber: user.phoneNumber,
            profilePicture: user.profilePicture,
            isPrivate: user.isPrivate
        });
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Fetch another user's profile by email
router.get('/:email', authMiddleware, async (req, res) => {
    try {
        const userEmail = req.params.email;
        const user = await User.findOne({ email: userEmail });
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // If the profile is private, return limited info
        if (user.isPrivate && user._id.toString() !== req.user.userId) {
            return res.json({
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                profilePicture: user.profilePicture,
                isPrivate: true
            });
        }

        // Return full profile for public profiles or own profile
        res.json({
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            course: user.course,
            height: user.height,
            weight: user.weight,
            initialWeight: user.initialWeight,
            gender: user.gender,
            age: user.age,
            phoneNumber: user.phoneNumber,
            profilePicture: user.profilePicture,
            isPrivate: user.isPrivate
        });
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ error: error.message });
    }
});

//  Upload or update profile picture
router.post('/upload-profile', authMiddleware, (req, res) => {
    upload.single('profilePicture')(req, res, async (err) => {
        try {
            if (err) {
                return res.status(400).json({ error: err.message });
            }

            if (!req.file) {
                return res.status(400).json({ error: "No file uploaded" });
            }

            // Convert buffer to base64
            const b64 = Buffer.from(req.file.buffer).toString('base64');
            const dataURI = `data:${req.file.mimetype};base64,${b64}`;

            // Upload to Cloudinary
            const result = await cloudinary.uploader.upload(dataURI, {
                folder: 'profile-pictures',
                width: 250,
                height: 250,
                crop: 'fill'
            });

            // Save Cloudinary URL to user profile
            const user = await User.findByIdAndUpdate(
                req.user.userId,
                { profilePicture: result.secure_url },
                { new: true }
            );

            // Update profile picture in all activities and comments
            await updateUserProfileInfo(req.user.userId, { profilePicture: result.secure_url });

            res.json({ 
                message: "Profile picture updated", 
                profilePicture: user.profilePicture 
            });

        } catch (error) {
            console.error("Profile upload error:", error);
            res.status(500).json({ error: error.message });
        }
    });
});

//  Delete profile picture
router.delete('/delete-profile', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        if (!user || !user.profilePicture) {
            return res.status(404).json({ error: 'No profile picture found' });
        }

        // Extract public_id from Cloudinary URL
        const publicId = user.profilePicture.split('/').slice(-2).join('/').split('.')[0];
        
        // Delete from Cloudinary
        await cloudinary.uploader.destroy(`profile-pictures/${publicId}`);

        // Update user profile
        user.profilePicture = "";
        await user.save();

        res.json({ message: "Profile picture removed", profilePicture: "" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

//  handle name updates
router.put('/update-name', authMiddleware, async (req, res) => {
    try {
        const { firstName, lastName } = req.body;
        const user = await User.findByIdAndUpdate(
            req.user.userId,
            { firstName, lastName },
            { new: true }
        );
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({
            firstName: user.firstName,
            lastName: user.lastName
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/update-info', authMiddleware, async (req, res) => {
    try {
        const { firstName, lastName, height, gender, age, phoneNumber } = req.body;
        
        // Find the user first
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const updateData = {
            firstName,
            lastName,
            height,
            gender,
            age,
            phoneNumber
        };
        
        const updatedUser = await User.findByIdAndUpdate(
            req.user.userId,
            updateData,
            { new: true, runValidators: true }
        );

        // Create activity for name change
        if (firstName !== user.firstName || lastName !== user.lastName) {
            try {
                const activity = {
                    achievementId: 'profile-name-update-' + Date.now(),
                    achievementTitle: 'Updated Profile Name',
                    achievementDescription: `Changed name from ${user.firstName} ${user.lastName} to ${firstName} ${lastName}`,
                    achievementCategory: 'profile'
                };

                await axios.post(
                    `${req.protocol}://${req.get('host')}/api/activity/achievement`,
                    activity,
                    { headers: { Authorization: req.headers.authorization } }
                );

                // Update profile info in all activities and comments
                await updateUserProfileInfo(req.user.userId, { 
                    firstName: updatedUser.firstName, 
                    lastName: updatedUser.lastName 
                });
            } catch (error) {
                console.error('Error creating name change activity:', error);
            }
        }

        // Create activity for gender change
        if (gender !== user.gender) {
            try {
                const activity = {
                    achievementId: 'profile-gender-update-' + Date.now(),
                    achievementTitle: 'Updated Gender',
                    achievementDescription: `Changed gender from ${user.gender || 'Not Set'} to ${gender}`,
                    achievementCategory: 'profile'
                };

                await axios.post(
                    `${req.protocol}://${req.get('host')}/api/activity/achievement`,
                    activity,
                    { headers: { Authorization: req.headers.authorization } }
                );
            } catch (error) {
                console.error('Error creating gender change activity:', error);
            }
        }

        // Create activity for age change
        if (age !== user.age) {
            try {
                const activity = {
                    achievementId: 'profile-age-update-' + Date.now(),
                    achievementTitle: 'Updated Age',
                    achievementDescription: `Changed age from ${user.age || 'Not Set'} to ${age} years old`,
                    achievementCategory: 'profile'
                };

                await axios.post(
                    `${req.protocol}://${req.get('host')}/api/activity/achievement`,
                    activity,
                    { headers: { Authorization: req.headers.authorization } }
                );
            } catch (error) {
                console.error('Error creating age change activity:', error);
            }
        }

        // Create activity for height change
        if (height !== user.height) {
            try {
                const activity = {
                    achievementId: 'profile-height-update-' + Date.now(),
                    achievementTitle: 'Updated Height',
                    achievementDescription: `Changed height from ${user.height || 'Not Set'} cm to ${height} cm`,
                    achievementCategory: 'profile'
                };

                await axios.post(
                    `${req.protocol}://${req.get('host')}/api/activity/achievement`,
                    activity,
                    { headers: { Authorization: req.headers.authorization } }
                );
            } catch (error) {
                console.error('Error creating height change activity:', error);
            }
        }
        
        res.json({
            firstName: updatedUser.firstName,
            lastName: updatedUser.lastName,
            course: updatedUser.course,
            height: updatedUser.height,
            weight: updatedUser.weight,
            initialWeight: updatedUser.initialWeight,
            gender: updatedUser.gender,
            age: updatedUser.age,
            phoneNumber: updatedUser.phoneNumber
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/toggle-privacy', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.user.userId,
            { $set: { isPrivate: !user.isPrivate } },
            { new: true, runValidators: false }
        );

        res.json({ 
            isPrivate: updatedUser.isPrivate,
            message: `Profile is now ${updatedUser.isPrivate ? 'private' : 'public'}`
        });
    } catch (error) {
        console.error('Privacy toggle error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/search/:email', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.params.email });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const publicData = {
            _id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            profilePicture: user.profilePicture,
            isPrivate: user.isPrivate
        };

        if (!user.isPrivate) {
            publicData.course = user.course;
            publicData.height = user.height;
            publicData.weight = user.weight;
            publicData.gender = user.gender;
            publicData.age = user.age;
        }

        res.json(publicData);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.put('/update', authMiddleware, async (req, res) => {
    try {
        const { phoneNumber } = req.body;

        // Check if phone number is being changed
        if (phoneNumber) {
            const existingPhone = await User.findOne({ 
                phoneNumber,
                _id: { $ne: req.user.userId } 
            });
            
            if (existingPhone) {
                return res.status(400).json({ 
                    message: 'Phone number already registered to another user' 
                });
            }
        }

    } catch (error) {
        console.error('Update error:', error);
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
