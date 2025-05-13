// Script to fix verification tokens for existing users
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const crypto = require('crypto');

async function fixUserVerification() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB');

    // Find all users
    const users = await User.find({});
    console.log(`Found ${users.length} users in the database.`);

    let updatedCount = 0;
    let alreadyVerifiedCount = 0;
    let needsVerificationCount = 0;

    // Check and update each user
    for (const user of users) {
      console.log(`\nProcessing user: ${user.email}`);
      
      // If isVerified field is undefined, set it to false and generate token
      if (user.isVerified === undefined) {
        user.isVerified = false;
        user.verificationToken = crypto.randomBytes(32).toString('hex');
        user.verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
        await user.save();
        console.log(`  ✅ Updated user ${user.email} with verification fields`);
        updatedCount++;
        needsVerificationCount++;
      }
      // If user has isVerified=false but no token, generate one
      else if (user.isVerified === false && !user.verificationToken) {
        user.verificationToken = crypto.randomBytes(32).toString('hex');
        user.verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
        await user.save();
        console.log(`  ✅ Added missing verification token for ${user.email}`);
        updatedCount++;
        needsVerificationCount++;
      }
      // If user has verificationToken but no expiry, add expiry
      else if (user.isVerified === false && user.verificationToken && !user.verificationTokenExpires) {
        user.verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
        await user.save();
        console.log(`  ✅ Added missing verification token expiry for ${user.email}`);
        updatedCount++;
        needsVerificationCount++;
      }
      // If verification token is expired but user isn't verified, renew the token
      else if (user.isVerified === false && user.verificationToken && user.verificationTokenExpires && user.verificationTokenExpires < Date.now()) {
        user.verificationToken = crypto.randomBytes(32).toString('hex');
        user.verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
        await user.save();
        console.log(`  ✅ Renewed expired verification token for ${user.email}`);
        updatedCount++;
        needsVerificationCount++;
      }
      // If user is already verified, make sure they don't have a token
      else if (user.isVerified === true && (user.verificationToken || user.verificationTokenExpires)) {
        user.verificationToken = undefined;
        user.verificationTokenExpires = undefined;
        await user.save();
        console.log(`  ✅ Removed unnecessary verification token for verified user ${user.email}`);
        updatedCount++;
        alreadyVerifiedCount++;
      }
      else if (user.isVerified === true) {
        console.log(`  ℹ️ User ${user.email} is already verified`);
        alreadyVerifiedCount++;
      }
      else if (user.isVerified === false) {
        const tokenStatus = user.verificationTokenExpires && user.verificationTokenExpires > Date.now() 
          ? 'valid' 
          : 'expired';
        
        console.log(`  ℹ️ User ${user.email} needs to verify email (token: ${user.verificationToken?.substring(0, 10)}..., status: ${tokenStatus})`);
        needsVerificationCount++;
      }
    }

    console.log('\n======== SUMMARY ========');
    console.log(`Total users: ${users.length}`);
    console.log(`Updated users: ${updatedCount}`);
    console.log(`Already verified users: ${alreadyVerifiedCount}`);
    console.log(`Users needing verification: ${needsVerificationCount}`);
    console.log('=========================');

    return 'Script completed successfully';
  } catch (error) {
    console.error('Error:', error);
    return 'Script failed';
  } finally {
    // Close the connection
    await mongoose.connection.close();
    console.log('Disconnected from MongoDB');
  }
}

// Run the function
fixUserVerification()
  .then(result => console.log(result))
  .catch(error => console.error('Error running script:', error)); 