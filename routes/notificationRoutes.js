const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

// Get all notifications for the current user
router.get('/', authMiddleware, async (req, res) => {
    try {
        const userEmail = req.user.email;
        
        // Find all notifications for this user, sorted by newest first
        const notifications = await Notification.find({ 
            recipient: userEmail 
        }).sort({ createdAt: -1 });
        
        res.json(notifications);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get unread notification count
router.get('/count', authMiddleware, async (req, res) => {
    try {
        const userEmail = req.user.email;
        
        // Count unread notifications
        const count = await Notification.countDocuments({ 
            recipient: userEmail,
            read: false
        });
        
        res.json({ count });
    } catch (error) {
        console.error('Error counting notifications:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Mark notification as read
router.put('/:id/read', authMiddleware, async (req, res) => {
    try {
        const userEmail = req.user.email;
        const notificationId = req.params.id;
        
        // Find and update the notification
        const notification = await Notification.findById(notificationId);
        
        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }
        
        // Security check to ensure user only updates their own notifications
        if (notification.recipient !== userEmail) {
            return res.status(403).json({ message: 'Not authorized' });
        }
        
        // Mark as read
        notification.read = true;
        await notification.save();
        
        res.json({ message: 'Notification marked as read' });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Mark all notifications as read
router.put('/read-all', authMiddleware, async (req, res) => {
    try {
        const userEmail = req.user.email;
        
        // Update all unread notifications for this user
        const result = await Notification.updateMany(
            { recipient: userEmail, read: false },
            { $set: { read: true } }
        );
        
        res.json({ 
            message: 'All notifications marked as read',
            count: result.modifiedCount
        });
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Delete a notification
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const userEmail = req.user.email;
        const notificationId = req.params.id;
        
        // Find the notification
        const notification = await Notification.findById(notificationId);
        
        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }
        
        // Security check
        if (notification.recipient !== userEmail) {
            return res.status(403).json({ message: 'Not authorized' });
        }
        
        // Delete it
        await Notification.findByIdAndDelete(notificationId);
        
        res.json({ message: 'Notification deleted' });
    } catch (error) {
        console.error('Error deleting notification:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Clear all notifications
router.delete('/', authMiddleware, async (req, res) => {
    try {
        const userEmail = req.user.email;
        
        // Delete all notifications for this user
        const result = await Notification.deleteMany({ recipient: userEmail });
        
        res.json({ 
            message: 'All notifications cleared',
            count: result.deletedCount
        });
    } catch (error) {
        console.error('Error clearing notifications:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router; 