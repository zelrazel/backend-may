const mongoose = require("mongoose");

const FriendSchema = new mongoose.Schema({
    friendId: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ["pending", "accepted", "rejected", "cancelled"],
        default: "pending"
    },
    initiator: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

const UserFriendSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true
    },
    friends: [FriendSchema]
});

UserFriendSchema.methods.addFriend = async function(friendId, initiator) {
    this.friends.push({ friendId, initiator });
    return this.save();
};

UserFriendSchema.methods.updateFriendStatus = async function(friendId, status) {
    const friend = this.friends.find(f => f.friendId === friendId);
    if (friend) {
        friend.status = status;
        friend.updatedAt = Date.now();
    }
    return this.save();
};

UserFriendSchema.methods.removeFriend = async function(friendId) {
    this.friends = this.friends.filter(f => f.friendId !== friendId);
    return this.save();
};

module.exports = mongoose.model("UserFriend", UserFriendSchema);