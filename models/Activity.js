const mongoose = require('mongoose');

const ReactionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    userName: {
        type: String,
        required: true
    },
    reactionType: {
        type: String,
        enum: ['❤️', '🔥', '💪', '👏'],
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const CommentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    userName: {
        type: String,
        required: true
    },
    userProfilePicture: {
        type: String,
        default: ''
    },
    content: {
        type: String,
        required: true,
        trim: true,
        maxlength: [200, 'Comment cannot exceed 200 characters']
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const ActivitySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    userName: {
        type: String,
        required: true
    },
    userEmail: {
        type: String,
        required: true
    },
    userProfilePicture: {
        type: String,
        default: ''
    },
    activityType: {
        type: String,
        enum: ['achievement', 'ranking', 'workout', 'completed-workout', 'weight-change', 'scheduled-workout'],
        required: true
    },
    content: {
        title: {
            type: String,
            required: true
        },
        description: {
            type: String,
            required: true
        },
        imageUrl: {
            type: String,
            default: ''
        },
        achievementId: {
            type: String
        },
        category: {
            type: String
        },
        hideImage: {
            type: Boolean,
            default: false
        },
        changeType: {
            type: String,
            enum: ['gain', 'loss', 'initial', null],
            default: null
        },
        changeAmount: {
            type: Number,
            default: 0
        },
        newWeight: {
            type: Number,
            default: 0
        }
    },
    reactions: [ReactionSchema],
    comments: [CommentSchema],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Add virtual for reaction counts
ActivitySchema.virtual('reactionCounts').get(function() {
    const counts = {
        '❤️': 0,
        '🔥': 0,
        '💪': 0,
        '👏': 0
    };
    
    this.reactions.forEach(reaction => {
        counts[reaction.reactionType]++;
    });
    
    return counts;
});

// Add virtual for comment count
ActivitySchema.virtual('commentCount').get(function() {
    return this.comments.length;
});

// Set to export virtuals with toJSON
ActivitySchema.set('toJSON', { virtuals: true });
ActivitySchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Activity', ActivitySchema); 