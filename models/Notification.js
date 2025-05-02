const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const NotificationSchema = new Schema({
    recipient: {
        type: String,
        required: true
    },
    sender: {
        type: String
    },
    type: {
        type: String,
        required: true,
        enum: ['like', 'comment', 'follow', 'mention', 'system', 'friend_request', 'friend_accept', 'friend_reject', 'friend_remove', 'reaction', 'activity_comment', 'scheduled_workout']
    },
    read: {
        type: Boolean,
        default: false
    },
    content: {
        type: Schema.Types.Mixed,
        required: true
    },
    link: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Create a compound index to ensure uniqueness for certain notification types
NotificationSchema.index({ recipient: 1, sender: 1, type: 1 }, { 
    unique: true, 
    partialFilterExpression: { type: 'friend_request' } // Only apply uniqueness to friend requests
});

module.exports = mongoose.model('Notification', NotificationSchema); 