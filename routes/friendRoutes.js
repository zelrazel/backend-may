const express = require("express");
const router = express.Router();
const Friend = require("../models/Friend");
const User = require("../models/User");
const authMiddleware = require('../middleware/auth');
const UserFriend = require("../models/Userfriend");
const Notification = require("../models/Notification");

router.post("/request", authMiddleware, async (req, res) => {
    try {
        const { receiverEmail } = req.body;
        const senderEmail = req.user.email;

        // Validate input
        if (!receiverEmail) {
            return res.status(400).json({ message: "Receiver email is required" });
        }

        if (senderEmail === receiverEmail) {
            return res.status(400).json({ message: "Cannot send friend request to yourself" });
        }

        // Find existing friend records
        let senderFriend = await UserFriend.findOne({ userId: senderEmail });
        if (!senderFriend) {
            senderFriend = new UserFriend({ userId: senderEmail, friends: [] });
        }

        let receiverFriend = await UserFriend.findOne({ userId: receiverEmail });
        if (!receiverFriend) {
            receiverFriend = new UserFriend({ userId: receiverEmail, friends: [] });
        }

        // Check if the receiver exists
        const receiverExists = await User.findOne({ email: receiverEmail });
        if (!receiverExists) {
            return res.status(404).json({ message: "User not found" });
        }

        // Check if there's an existing friendship record of any status
        const existingSenderFriendship = senderFriend.friends.find(f => f.friendId === receiverEmail);
        const existingReceiverFriendship = receiverFriend.friends.find(f => f.friendId === senderEmail);

        // If there's a pending or accepted friendship, return error
        if (existingSenderFriendship && 
            (existingSenderFriendship.status === 'pending' || existingSenderFriendship.status === 'accepted')) {
            return res.status(400).json({ 
                message: existingSenderFriendship.status === 'pending' 
                    ? "Friend request already exists" 
                    : "You are already friends with this user" 
            });
        }

        // If there was a previous rejected or removed friendship, clean it up
        if (existingSenderFriendship) {
            senderFriend.friends = senderFriend.friends.filter(f => f.friendId !== receiverEmail);
        }
        
        if (existingReceiverFriendship) {
            receiverFriend.friends = receiverFriend.friends.filter(f => f.friendId !== senderEmail);
        }

        // Create new pending friendship records
        senderFriend.friends.push({
            friendId: receiverEmail,
            status: 'pending',
            initiator: senderEmail
        });

        receiverFriend.friends.push({
            friendId: senderEmail,
            status: 'pending',
            initiator: senderEmail
        });

        // Save both records
        await senderFriend.save();
        await receiverFriend.save();

        // Get sender's info for notification
        const sender = await User.findOne({ email: senderEmail });
        
        // Create a notification for the receiver
        const notification = new Notification({
            recipient: receiverEmail,
            sender: senderEmail,
            type: 'friend_request',
            content: {
                senderName: `${sender.firstName} ${sender.lastName}`,
                senderProfilePic: sender.profilePicture || '',
                message: `${sender.firstName} ${sender.lastName} sent you a friend request`
            }
        });
        
        try {
            await notification.save();
        } catch (notifError) {
            console.log('Notification already exists or could not be created:', notifError);
            // Continue even if notification fails (might be a duplicate)
        }

        res.status(201).json({ message: "Friend request sent successfully" });

    } catch (error) {
        console.error('Friend request error:', error);
        res.status(500).json({ message: "Failed to send friend request" });
    }
});

router.get("/requests", authMiddleware, async (req, res) => {
    try {
        const userFriend = await UserFriend.findOne({ userId: req.user.email });
        if (!userFriend) {
            return res.json([]);
        }

        const pendingRequests = userFriend.friends.filter(f => 
            f.status === 'pending' && f.initiator !== req.user.email
        );
        
        const requests = await Promise.all(
            pendingRequests.map(async (request) => {
                const sender = await User.findOne({ email: request.friendId })
                    .select('firstName lastName email profilePicture');
                return {
                    _id: request._id,
                    sender,
                    createdAt: request.createdAt
                };
            })
        );

        res.json(requests);
    } catch (error) {
        console.error('Error fetching requests:', error);
        res.status(500).json({ message: "Failed to fetch friend requests" });
    }
});

router.get("/sent-requests", authMiddleware, async (req, res) => {
    try {
        const userFriend = await UserFriend.findOne({ userId: req.user.email });
        if (!userFriend) {
            return res.json([]);
        }

        const sentRequests = userFriend.friends.filter(f => 
            f.status === 'pending' && f.initiator === req.user.email
        );
        
        const requests = await Promise.all(
            sentRequests.map(async (request) => {
                const receiver = await User.findOne({ email: request.friendId })
                    .select('firstName lastName email profilePicture');
                return {
                    _id: request._id,
                    receiver,
                    createdAt: request.createdAt
                };
            })
        );

        res.json(requests);
    } catch (error) {
        console.error('Error fetching sent requests:', error);
        res.status(500).json({ message: "Failed to fetch sent requests" });
    }
});

router.get("/search", authMiddleware, async (req, res) => {
    try {
        const { email } = req.query;
        
        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        const user = await User.findOne({ email })
            .select('firstName lastName email profilePicture course height weight gender age phoneNumber isPrivate');

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const userFriend = await UserFriend.findOne({
            userId: req.user.email,
            'friends.friendId': email
        });

        let friendshipStatus = "none";
        if (userFriend) {
            const friend = userFriend.friends.find(f => f.friendId === email);
            friendshipStatus = friend ? friend.status : "none";
        }

        const responseData = {
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            profilePicture: user.profilePicture,
            course: user.course,
            gender: user.gender,
            phoneNumber: user.phoneNumber,
            isPrivate: user.isPrivate,
            friendshipStatus
        };

        res.json(responseData);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ message: "Error searching for user" });
    }
});



router.post("/accept", authMiddleware, async (req, res) => {
    try {
        const { requestId } = req.body;
        const userEmail = req.user.email;

        const userFriend = await UserFriend.findOne({ userId: userEmail });
        if (!userFriend) {
            return res.status(404).json({ message: "Friend request not found" });
        }

        const friendRequest = userFriend.friends.id(requestId);
        if (!friendRequest) {
            return res.status(404).json({ message: "Friend request not found" });
        }

        friendRequest.status = 'accepted';
        
        // Get the sender's email (the person who sent the friend request)
        const senderEmail = friendRequest.friendId;

        const senderFriend = await UserFriend.findOne({ userId: senderEmail });
        if (senderFriend) {
            const senderRequest = senderFriend.friends.find(
                f => f.friendId === userEmail
            );
            if (senderRequest) {
                senderRequest.status = 'accepted';
                await senderFriend.save();
            }
        }

        await userFriend.save();
        
        // Get current user's info to include in notification
        const user = await User.findOne({ email: userEmail });
        
        // Create notification for the request sender
        const notification = new Notification({
            recipient: senderEmail,
            sender: userEmail,
            type: 'friend_accept',
            content: {
                senderName: `${user.firstName} ${user.lastName}`,
                senderProfilePic: user.profilePicture || '',
                message: `${user.firstName} ${user.lastName} accepted your friend request`
            }
        });
        
        await notification.save();

        res.json({ message: "Friend request accepted" });

    } catch (error) {
        console.error('Error accepting request:', error);
        res.status(500).json({ message: "Failed to accept request" });
    }
});

router.post("/reject", authMiddleware, async (req, res) => {
    try {
        const { requestId } = req.body;
        const userEmail = req.user.email;

        const userFriend = await UserFriend.findOne({ userId: userEmail });
        if (!userFriend) {
            return res.status(404).json({ message: "Friend request not found" });
        }

        const friendRequest = userFriend.friends.id(requestId);
        if (!friendRequest) {
            return res.status(404).json({ message: "Friend request not found" });
        }

        // Store the sender's email before updating status
        const senderEmail = friendRequest.friendId;
        
        friendRequest.status = 'rejected';

        const senderFriend = await UserFriend.findOne({ userId: senderEmail });
        if (senderFriend) {
            const senderRequest = senderFriend.friends.find(
                f => f.friendId === userEmail
            );
            if (senderRequest) {
                senderRequest.status = 'rejected';
                await senderFriend.save();
            }
        }

        await userFriend.save();
        
        // Get current user's info to include in notification
        const user = await User.findOne({ email: userEmail });
        
        // Create notification for the request sender
        const notification = new Notification({
            recipient: senderEmail,
            sender: userEmail,
            type: 'friend_reject',
            content: {
                senderName: `${user.firstName} ${user.lastName}`,
                senderProfilePic: user.profilePicture || '',
                message: `${user.firstName} ${user.lastName} declined your friend request`
            }
        });
        
        await notification.save();

        res.json({ message: "Friend request rejected" });

    } catch (error) {
        console.error('Error rejecting request:', error);
        res.status(500).json({ message: "Failed to reject request" });
    }
});

router.post("/remove", authMiddleware, async (req, res) => {
    try {
        const { friendEmail } = req.body;
        const userEmail = req.user.email;

        if (!friendEmail) {
            return res.status(400).json({ message: "Friend email is required" });
        }

        // Find both user's friend records
        const userFriend = await UserFriend.findOne({ userId: userEmail });
        const friendUser = await UserFriend.findOne({ userId: friendEmail });

        if (!userFriend) {
            return res.status(404).json({ message: "Friend relationship not found" });
        }

        // Check if they are actually friends
        const friendship = userFriend.friends.find(f => f.friendId === friendEmail && f.status === 'accepted');
        
        if (!friendship) {
            return res.status(400).json({ message: "You are not friends with this user" });
        }

        // Update user's friend list - remove the friendship completely
        await UserFriend.updateOne(
            { userId: userEmail },
            { $pull: { friends: { friendId: friendEmail } } }
        );

        // Update friend's friend list if it exists
        if (friendUser) {
            await UserFriend.updateOne(
                { userId: friendEmail },
                { $pull: { friends: { friendId: userEmail } } }
            );
        }

        // Create a notification for the friend being removed
        try {
            const removingUser = await User.findOne({ email: userEmail });
            
            const notification = new Notification({
                recipient: friendEmail,
                sender: userEmail,
                type: 'friend_remove',
                content: {
                    senderName: `${removingUser.firstName} ${removingUser.lastName}`,
                    senderProfilePic: removingUser.profilePicture || '',
                    message: `${removingUser.firstName} ${removingUser.lastName} removed you as a friend`
                }
            });
            
            await notification.save();
        } catch (notifError) {
            console.log('Could not create removal notification:', notifError);
            // Continue even if notification fails
        }

        res.status(200).json({ message: "Friend removed successfully" });
    } catch (error) {
        console.error("Error removing friend:", error);
        res.status(500).json({ message: "Failed to remove friend" });
    }
});

router.post("/cancel-request", authMiddleware, async (req, res) => {
    try {
        const { receiverEmail } = req.body;
        const senderEmail = req.user.email;

        const senderFriend = await UserFriend.findOne({ userId: senderEmail });
        if (senderFriend) {
            senderFriend.friends = senderFriend.friends.filter(
                f => f.friendId !== receiverEmail
            );
            await senderFriend.save();
        }

        const receiverFriend = await UserFriend.findOne({ userId: receiverEmail });
        if (receiverFriend) {
            receiverFriend.friends = receiverFriend.friends.filter(
                f => f.friendId !== senderEmail
            );
            await receiverFriend.save();
        }
        
        // Delete any pending friend request notifications
        await Notification.deleteOne({
            recipient: receiverEmail,
            sender: senderEmail,
            type: 'friend_request'
        });

        res.json({ message: "Friend request cancelled successfully" });
    } catch (error) {
        console.error('Error cancelling request:', error);
        res.status(500).json({ message: "Failed to cancel friend request" });
    }
});

router.get("/list", authMiddleware, async (req, res) => {
    try {
        const userFriend = await UserFriend.findOne({ userId: req.user.email });
        if (!userFriend) {
            return res.json([]);
        }

        const acceptedFriends = userFriend.friends.filter(f => f.status === 'accepted');
        
        const friendsList = await Promise.all(
            acceptedFriends.map(async (friend) => {
                const friendUser = await User.findOne({ email: friend.friendId })
                    .select('firstName lastName email profilePicture course height weight gender age phoneNumber isPrivate')
                    .lean();
                
                if (!friendUser) {
                    return null;
                }

                return {
                    _id: friend._id,
                    email: friendUser.email,
                    firstName: friendUser.firstName,
                    lastName: friendUser.lastName,
                    weight: friendUser.weight,
                    height: friendUser.height,
                    age: friendUser.age,
                    gender: friendUser.gender,
                    course: friendUser.course,
                    phoneNumber: friendUser.phoneNumber,                    
                    profilePicture: friendUser.profilePicture,
                    isPrivate: friendUser.isPrivate
                };
            })
        ).then(list => list.filter(friend => friend !== null));

        res.json(friendsList);
    } catch (error) {
        console.error('Error fetching friends:', error);
        res.status(500).json({ message: "Failed to fetch friends list" });
    }
});

module.exports = router;