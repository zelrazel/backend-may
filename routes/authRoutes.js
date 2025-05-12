const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/jwt.config');
const User = require('../models/User');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { sendVerificationEmail } = require('../utils/mailjetService');

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

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    // Create new user with initialWeight set to the signup weight
    const user = new User({ 
      firstName, 
      lastName, 
      email, 
      password,
      course,
      height: parseFloat(height),
      weight: parseFloat(weight),
      initialWeight: parseFloat(weight),
      gender,
      age: parseInt(age),
      phoneNumber,
      isVerified: false, // Users must verify their email
      verificationToken,
      verificationTokenExpires
    });

    await user.save();

    // Attempt to send verification email with Mailjet
    const apiKey = process.env.MJ_APIKEY_PUBLIC;
    const apiSecret = process.env.MJ_APIKEY_PRIVATE;
    
    let emailSent = false;
    
    if (apiKey && apiSecret) {
      console.log(`📧 Attempting to send verification email to: ${email}`);
      
      try {
        // For verification emails, we want the backend API endpoint directly
        // since the backend needs to handle the verification process
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
        
        console.log(`Using frontend URL: ${frontendUrl}`);
        console.log(`Using backend URL: ${backendUrl}`);
        
        const emailResult = await sendVerificationEmail({
          recipientEmail: email,
          recipientName: `${firstName} ${lastName}`,
          verificationToken,
          apiKey,
          apiSecret,
          baseUrl: frontendUrl
        });
        
        if (emailResult.success) {
          console.log(`✅ Verification email sent to: ${email}`);
          emailSent = true;
        } else {
          console.log('❌ Failed to send verification email:', emailResult.error);
        }
      } catch (error) {
        console.error('📧 Error in email sending process:', error);
      }
    } else {
      console.log('❌ Mailjet credentials missing');
    }

    if (emailSent) {
      // Normal flow - email was sent, user needs to verify
      res.status(201).json({ 
        message: 'Registration successful! Please check your email to verify your account.',
        emailSent: true,
        autoVerified: false
      });
    } else {
      // Email failed to send but we still created the account
      res.status(201).json({ 
        message: 'Account created but verification email could not be sent. Please contact support.',
        emailSent: false,
        autoVerified: false
      });
    }
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Email verification route
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    console.log('🔍 Attempting to verify email with token:', token);
    
    if (!token) {
      console.log('❌ Verification failed: Token missing');
      return res.status(400).send('Verification token missing.');
    }
    
    // First, try to find a user with this token that hasn't expired
    const user = await User.findOne({ 
      verificationToken: token,
      verificationTokenExpires: { $gt: Date.now() }
    });
    
    if (!user) {
      // Check if the token exists but is expired
      const expiredTokenUser = await User.findOne({ verificationToken: token });
      
      if (expiredTokenUser) {
        console.log(`❌ Verification failed: Expired token for user ${expiredTokenUser.email}`);
        return res.status(400).send(`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Verification Failed - TrackTechFit</title>
            <style>
              body { font-family: Arial, sans-serif; background: linear-gradient(180deg, #1B4332 0%, #081C15 80%); display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; color: white; }
              .verification-container { background-color: rgba(177, 167, 166, 0.25); border-radius: 50px; padding: 40px; max-width: 500px; text-align: center; width: 100%; box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3); }
              .verification-title { color: #FFFFFF; font-size: 24px; font-weight: bold; margin-bottom: 20px; }
              .verification-subtitle { color: rgba(255, 255, 255, 0.8); font-size: 16px; margin-bottom: 30px; }
              .error-message { color: #ff6666; font-weight: bold; margin: 20px 0; }
              .btn { display: inline-block; padding: 12px 25px; border-radius: 5px; text-decoration: none; font-weight: bold; margin-top: 20px; }
              .btn-primary { background-color: #00A951; color: white; }
            </style>
          </head>
          <body>
            <div class="verification-container">
              <h1 class="verification-title">TrackTechFit</h1>
              <p class="verification-subtitle">Email Verification</p>
              <p class="error-message">Verification link has expired!</p>
              <p>This verification link has expired. Verification links are valid for 24 hours after they are sent.</p>
              <form action="/api/auth/resend-verification" method="post" style="margin-top: 20px;">
                <input type="hidden" name="email" value="${expiredTokenUser.email}">
                <button type="submit" class="btn btn-primary">Resend Verification Email</button>
              </form>
              <div style="margin-top: 15px;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/signin" class="btn btn-primary">Go to Sign In</a>
              </div>
            </div>
          </body>
          </html>
        `);
      }
      
      console.log('❌ Verification failed: No user found with this token');
      
      return res.status(400).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Verification Failed - TrackTechFit</title>
          <style>
            body { font-family: Arial, sans-serif; background: linear-gradient(180deg, #1B4332 0%, #081C15 80%); display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; color: white; }
            .verification-container { background-color: rgba(177, 167, 166, 0.25); border-radius: 50px; padding: 40px; max-width: 500px; text-align: center; width: 100%; box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3); }
            .verification-title { color: #FFFFFF; font-size: 24px; font-weight: bold; margin-bottom: 20px; }
            .verification-subtitle { color: rgba(255, 255, 255, 0.8); font-size: 16px; margin-bottom: 30px; }
            .error-message { color: #ff6666; font-weight: bold; margin: 20px 0; }
            .btn { display: inline-block; padding: 12px 25px; border-radius: 5px; text-decoration: none; font-weight: bold; margin-top: 20px; }
            .btn-primary { background-color: #00A951; color: white; }
          </style>
        </head>
        <body>
          <div class="verification-container">
            <h1 class="verification-title">TrackTechFit</h1>
            <p class="verification-subtitle">Email Verification</p>
            <p class="error-message">Invalid or expired verification token.</p>
            <p>This verification link is no longer valid. This may be because:</p>
            <ul style="text-align: left; padding-left: 30px;">
              <li>You have already verified your email</li>
              <li>The verification link has expired</li>
              <li>The verification token is incorrect</li>
            </ul>
            <p>Please return to the sign-in page to login, or request a new verification email if needed.</p>
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/signin" class="btn btn-primary">Go to Sign In</a>
          </div>
        </body>
        </html>
      `);
    }
    
    // Check if the user is already verified
    if (user.isVerified) {
      console.log(`❗ User ${user.email} is already verified`);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const redirectUrl = `${frontendUrl}/signin?verified=already`;
      
      return res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Email Already Verified - TrackTechFit</title>
          <style>
            body { font-family: Arial, sans-serif; background: linear-gradient(180deg, #1B4332 0%, #081C15 80%); display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; color: white; }
            .verification-container { background-color: rgba(177, 167, 166, 0.25); border-radius: 50px; padding: 40px; max-width: 500px; text-align: center; width: 100%; box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3); }
            .verification-title { color: #FFFFFF; font-size: 24px; font-weight: bold; margin-bottom: 20px; }
            .verification-subtitle { color: rgba(255, 255, 255, 0.8); font-size: 16px; margin-bottom: 30px; }
            .success-message { color: #00A951; font-weight: bold; margin: 20px 0; }
            .verification-loader { width: 40px; height: 40px; border: 4px solid rgba(255, 255, 255, 0.3); border-radius: 50%; border-top-color: #00A951; animation: spin 1s linear infinite; margin: 20px auto; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          </style>
        </head>
        <body>
          <div class="verification-container">
            <h1 class="verification-title">TrackTechFit</h1>
            <p class="verification-subtitle">Email Verification</p>
            <p class="success-message">Your email is already verified! You can sign in.</p>
            <p>You will be redirected to the login page in a few seconds...</p>
            <div class="verification-loader"></div>
          </div>
          <script>
            setTimeout(function() { window.location.href = "${redirectUrl}"; }, 3000);
          </script>
        </body>
        </html>
      `);
    }
    
    // Now verify the user's email
    console.log(`✅ Verifying user: ${user.email}`);
    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save();
    console.log(`✅ User verified: ${user.email}`);
    
    // Get the frontend URL from environment or use default
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    
    // Redirect to the frontend signin page with success parameter
    const redirectUrl = `${frontendUrl}/signin?verified=true`;
    console.log('🔄 Redirecting to:', redirectUrl);
    
    // HTML response with auto-redirect after showing a success message
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Verified - TrackTechFit</title>
        <style>
          body { font-family: Arial, sans-serif; background: linear-gradient(180deg, #1B4332 0%, #081C15 80%); display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; color: white; }
          .verification-container { background-color: rgba(177, 167, 166, 0.25); border-radius: 50px; padding: 40px; max-width: 500px; text-align: center; width: 100%; box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3); }
          .verification-title { color: #FFFFFF; font-size: 24px; font-weight: bold; margin-bottom: 20px; }
          .verification-subtitle { color: rgba(255, 255, 255, 0.8); font-size: 16px; margin-bottom: 30px; }
          .success-message { color: #00A951; font-weight: bold; margin: 20px 0; }
          .verification-loader { width: 40px; height: 40px; border: 4px solid rgba(255, 255, 255, 0.3); border-radius: 50%; border-top-color: #00A951; animation: spin 1s linear infinite; margin: 20px auto; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
      </head>
      <body>
        <div class="verification-container">
          <h1 class="verification-title">TrackTechFit</h1>
          <p class="verification-subtitle">Email Verification</p>
          <p class="success-message">Your email has been successfully verified!</p>
          <p>You will be redirected to the login page in a few seconds...</p>
          <div class="verification-loader"></div>
        </div>
        <script>
          setTimeout(function() { window.location.href = "${redirectUrl}"; }, 3000);
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('❌ Email verification error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verification Error - TrackTechFit</title>
        <style>
          body { font-family: Arial, sans-serif; background: linear-gradient(180deg, #1B4332 0%, #081C15 80%); display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; color: white; }
          .verification-container { background-color: rgba(177, 167, 166, 0.25); border-radius: 50px; padding: 40px; max-width: 500px; text-align: center; width: 100%; box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3); }
          .verification-title { color: #FFFFFF; font-size: 24px; font-weight: bold; margin-bottom: 20px; }
          .verification-subtitle { color: rgba(255, 255, 255, 0.8); font-size: 16px; margin-bottom: 30px; }
          .error-message { color: #ff6666; font-weight: bold; margin: 20px 0; }
          .btn { display: inline-block; padding: 12px 25px; border-radius: 5px; text-decoration: none; font-weight: bold; margin-top: 20px; }
          .btn-primary { background-color: #00A951; color: white; }
        </style>
      </head>
      <body>
        <div class="verification-container">
          <h1 class="verification-title">TrackTechFit</h1>
          <p class="verification-subtitle">Email Verification</p>
          <p class="error-message">Server error during email verification.</p>
          <p>We encountered an unexpected error while trying to verify your email. Please try again later or contact support.</p>
          <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/signin" class="btn btn-primary">Go to Sign In</a>
        </div>
      </body>
      </html>
    `);
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
    if (!user.isVerified) {
      return res.status(401).json({ error: 'Please verify your email before signing in.' });
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

// Forgot Password Route
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Validate email format
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    // Find user with this email
    const user = await User.findOne({ email });
    
    // Don't reveal if user exists or not for security
    if (!user) {
      console.log(`Password reset requested for non-existent email: ${email}`);
      // Return success even if user doesn't exist to prevent email enumeration
      return res.json({ 
        message: 'If your email is registered, you will receive password reset instructions shortly.' 
      });
    }

    // Generate password reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = Date.now() + 3600000; // 1 hour from now

    // Save token to user
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = resetTokenExpiry;
    await user.save();

    // Set up the email content
    const apiKey = process.env.MJ_APIKEY_PUBLIC;
    const apiSecret = process.env.MJ_APIKEY_PRIVATE;
    
    // Get the frontend URL from environment or use default
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    
    if (apiKey && apiSecret) {
      console.log(`📧 Sending password reset email to: ${email}`);
      
      try {
        // Create reset URL - FIXED: This should point to the frontend reset password page, not the API
        const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;
        console.log(`Reset URL created: ${resetUrl}`);

        // Configure email with Mailjet
        const mailjet = require('node-mailjet').apiConnect(apiKey, apiSecret);
        
        const request = mailjet.post('send', { version: 'v3.1' }).request({
          Messages: [
            {
              From: {
                Email: "emeralddandelionblank@gmail.com",
                Name: "TrackTechFit"
              },
              To: [
                {
                  Email: email,
                  Name: user.firstName || "User"
                }
              ],
              Subject: "Reset Your TrackTechFit Password",
              HTMLPart: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5; border-radius: 10px;">
                  <h2 style="color: #00A951;">Reset Your Password</h2>
                  <p>Hello ${user.firstName || 'there'},</p>
                  <p>We received a request to reset your password for your TrackTechFit account. Click the button below to set a new password:</p>
                  
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${resetUrl}" style="background-color: #00A951; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                      RESET PASSWORD
                    </a>
                  </div>
                  
                  <p>If you didn't request this, you can safely ignore this email. Your password will remain unchanged.</p>
                  
                  <p>The link will expire in 1 hour for security reasons.</p>
                  
                  <div style="margin: 25px 0; padding: 20px; background-color: #e9f7ef; border-left: 5px solid #00A951; border-radius: 5px;">
                    <div style="color: #00A951; font-size: 18px; font-weight: bold; margin-bottom: 10px;">
                      ⚠️ IMPORTANT NOTICE:
                    </div>
                    <p style="margin: 0; color: #006d32; font-size: 16px;">
                      If you can't find this email in your inbox, please <strong>CHECK YOUR SPAM/JUNK FOLDER</strong>.
                    </p>
                  </div>
                  
                  <hr style="border: 1px solid #e0e0e0; margin: 20px 0;">
                  <p style="font-size: 12px; color: #666;">
                    If you didn't request a password reset, please ignore this email or contact support if you have concerns.
                  </p>
                  <p>Thank you,<br>The TrackTechFit Team</p>
                </div>
              `
            }
          ]
        });
        
        const result = await request;
        console.log(`✅ Password reset email sent to: ${email}`);
        
        return res.json({ 
          message: 'Password reset instructions have been sent to your email.'
        });
      } catch (error) {
        console.error('❌ Failed to send password reset email:', error);
        // Don't reveal email sending failure to client
        return res.json({ 
          message: 'If your email is registered, you will receive password reset instructions shortly.'
        });
      }
    } else {
      console.log('❌ Mailjet credentials missing for password reset email');
      return res.json({ 
        message: 'If your email is registered, you will receive password reset instructions shortly.'
      });
    }
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ message: 'Server error during password reset request.' });
  }
});

// Verify Reset Token
router.get('/reset-password', async (req, res) => {
  try {
    const { token } = req.query;
    
    if (!token) {
      console.log('❌ Reset token verification failed: Token missing');
      return res.status(400).json({ message: 'Reset token is required', valid: false });
    }
    
    console.log(`🔍 Verifying reset token: ${token.substring(0, 10)}...`);
    
    // Find user with this token and check if token is still valid
    const user = await User.findOne({ 
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      console.log('❌ Reset token verification failed: Invalid or expired token');
      return res.status(400).json({ 
        message: 'Invalid or expired password reset token. Please request a new password reset link.', 
        valid: false
      });
    }
    
    console.log(`✅ Reset token verified successfully for user: ${user.email}`);
    
    // Return success if token is valid
    res.json({ valid: true, message: 'Token is valid' });
  } catch (error) {
    console.error('❌ Reset password verification error:', error);
    res.status(500).json({ message: 'Server error during token verification.', valid: false });
  }
});

// Reset Password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    console.log(`🔍 Processing reset password request with token: ${token ? token.substring(0, 10) + '...' : 'undefined'}`);
    
    if (!token || !password) {
      console.log('❌ Reset password failed: Missing token or password');
      return res.status(400).json({ message: 'Token and new password are required' });
    }
    
    // Validate password
    if (password.length < 7) {
      console.log('❌ Reset password failed: Password too short');
      return res.status(400).json({ message: 'Password must be at least 7 characters long' });
    }
    
    // Find user with this token and check if token is still valid
    const user = await User.findOne({ 
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      console.log('❌ Reset password failed: Invalid or expired token');
      return res.status(400).json({ message: 'Invalid or expired password reset token. Please request a new password reset link.' });
    }
    
    console.log(`✅ Found user with valid token: ${user.email}`);
    
    // Check if new password is the same as the old password
    const isSame = await bcrypt.compare(password, user.password);
    if (isSame) {
      console.log('❌ Reset password failed: New password same as old password');
      return res.status(400).json({ message: 'New password must be different from the old password.' });
    }
    
    // Manually hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Update user with new password and clear reset tokens
    await User.findByIdAndUpdate(
      user._id,
      {
        $set: {
          password: hashedPassword,
          resetPasswordToken: undefined,
          resetPasswordExpires: undefined
        }
      }
    );
    
    console.log(`✅ Password reset successful for user: ${user.email}`);
    
    // Return success response
    res.json({ message: 'Password has been reset successfully. You can now log in with your new password.' });
  } catch (error) {
    console.error('❌ Password reset error:', error);
    res.status(500).json({ message: 'Server error during password reset.' });
  }
});

// Resend verification email
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    console.log(`📧 Attempting to resend verification email to: ${email}`);
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    
    // Find the user
    const user = await User.findOne({ email });
    
    if (!user) {
      // Don't reveal that the user doesn't exist
      return res.status(200).json({ 
        message: 'If your email exists in our system, a new verification email has been sent.' 
      });
    }
    
    // Check if already verified
    if (user.isVerified) {
      return res.status(400).json({ 
        message: 'This email is already verified. Please sign in.' 
      });
    }
    
    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    
    // Update user with new token
    user.verificationToken = verificationToken;
    user.verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    await user.save();
    
    // Send new verification email
    const apiKey = process.env.MJ_APIKEY_PUBLIC;
    const apiSecret = process.env.MJ_APIKEY_PRIVATE;
    
    if (apiKey && apiSecret) {
      try {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        
        const emailResult = await sendVerificationEmail({
          recipientEmail: email,
          recipientName: `${user.firstName} ${user.lastName}`,
          verificationToken,
          apiKey,
          apiSecret,
          baseUrl: frontendUrl
        });
        
        if (emailResult.success) {
          console.log(`✅ New verification email sent to: ${email}`);
          return res.status(200).json({
            message: 'A new verification email has been sent. Please check your inbox.'
          });
        } else {
          console.log('❌ Failed to send new verification email:', emailResult.error);
          return res.status(500).json({
            message: 'Failed to send verification email. Please try again later.'
          });
        }
      } catch (error) {
        console.error('❌ Error in email sending process:', error);
        return res.status(500).json({
          message: 'Server error when sending verification email. Please try again later.'
        });
      }
    } else {
      console.log('❌ Mailjet credentials missing for verification email');
      return res.status(500).json({
        message: 'Email service is currently unavailable. Please try again later.'
      });
    }
  } catch (error) {
    console.error('❌ Resend verification error:', error);
    res.status(500).json({ message: 'Server error during verification email resend.' });
  }
});

// Resend verification link from expired token page
router.post('/resend-verification-from-expired', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Error - TrackTechFit</title>
          <style>
            body { font-family: Arial, sans-serif; background: linear-gradient(180deg, #1B4332 0%, #081C15 80%); display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; color: white; }
            .verification-container { background-color: rgba(177, 167, 166, 0.25); border-radius: 50px; padding: 40px; max-width: 500px; text-align: center; width: 100%; box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3); }
            .verification-title { color: #FFFFFF; font-size: 24px; font-weight: bold; margin-bottom: 20px; }
            .verification-subtitle { color: rgba(255, 255, 255, 0.8); font-size: 16px; margin-bottom: 30px; }
            .error-message { color: #ff6666; font-weight: bold; margin: 20px 0; }
            .btn { display: inline-block; padding: 12px 25px; border-radius: 5px; text-decoration: none; font-weight: bold; margin-top: 20px; }
            .btn-primary { background-color: #00A951; color: white; }
          </style>
        </head>
        <body>
          <div class="verification-container">
            <h1 class="verification-title">TrackTechFit</h1>
            <p class="verification-subtitle">Email Verification</p>
            <p class="error-message">Email address required</p>
            <p>We couldn't process your request because the email address was missing.</p>
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/signin" class="btn btn-primary">Go to Sign In</a>
          </div>
        </body>
        </html>
      `);
    }
    
    // Find the user
    const user = await User.findOne({ email });
    
    if (!user) {
      // Don't reveal that the user doesn't exist
      return res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Email Sent - TrackTechFit</title>
          <style>
            body { font-family: Arial, sans-serif; background: linear-gradient(180deg, #1B4332 0%, #081C15 80%); display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; color: white; }
            .verification-container { background-color: rgba(177, 167, 166, 0.25); border-radius: 50px; padding: 40px; max-width: 500px; text-align: center; width: 100%; box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3); }
            .verification-title { color: #FFFFFF; font-size: 24px; font-weight: bold; margin-bottom: 20px; }
            .verification-subtitle { color: rgba(255, 255, 255, 0.8); font-size: 16px; margin-bottom: 30px; }
            .success-message { color: #00A951; font-weight: bold; margin: 20px 0; }
            .verification-loader { width: 40px; height: 40px; border: 4px solid rgba(255, 255, 255, 0.3); border-radius: 50%; border-top-color: #00A951; animation: spin 1s linear infinite; margin: 20px auto; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          </style>
        </head>
        <body>
          <div class="verification-container">
            <h1 class="verification-title">TrackTechFit</h1>
            <p class="verification-subtitle">Email Verification</p>
            <p class="success-message">Email Sent</p>
            <p>If your email exists in our system, a new verification email has been sent.</p>
            <p>You will be redirected to the login page in a few seconds...</p>
            <div class="verification-loader"></div>
          </div>
          <script>
            setTimeout(function() { window.location.href = "${process.env.FRONTEND_URL || 'http://localhost:3000'}/signin"; }, 3000);
          </script>
        </body>
        </html>
      `);
    }
    
    // Check if already verified
    if (user.isVerified) {
      return res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Already Verified - TrackTechFit</title>
          <style>
            body { font-family: Arial, sans-serif; background: linear-gradient(180deg, #1B4332 0%, #081C15 80%); display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; color: white; }
            .verification-container { background-color: rgba(177, 167, 166, 0.25); border-radius: 50px; padding: 40px; max-width: 500px; text-align: center; width: 100%; box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3); }
            .verification-title { color: #FFFFFF; font-size: 24px; font-weight: bold; margin-bottom: 20px; }
            .verification-subtitle { color: rgba(255, 255, 255, 0.8); font-size: 16px; margin-bottom: 30px; }
            .success-message { color: #00A951; font-weight: bold; margin: 20px 0; }
            .verification-loader { width: 40px; height: 40px; border: 4px solid rgba(255, 255, 255, 0.3); border-radius: 50%; border-top-color: #00A951; animation: spin 1s linear infinite; margin: 20px auto; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          </style>
        </head>
        <body>
          <div class="verification-container">
            <h1 class="verification-title">TrackTechFit</h1>
            <p class="verification-subtitle">Email Verification</p>
            <p class="success-message">Email Already Verified</p>
            <p>Your email address is already verified. You can sign in now.</p>
            <p>You will be redirected to the login page in a few seconds...</p>
            <div class="verification-loader"></div>
          </div>
          <script>
            setTimeout(function() { window.location.href = "${process.env.FRONTEND_URL || 'http://localhost:3000'}/signin"; }, 3000);
          </script>
        </body>
        </html>
      `);
    }
    
    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    
    // Update user with new token
    user.verificationToken = verificationToken;
    user.verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    await user.save();
    
    // Send new verification email
    const apiKey = process.env.MJ_APIKEY_PUBLIC;
    const apiSecret = process.env.MJ_APIKEY_PRIVATE;
    
    if (apiKey && apiSecret) {
      try {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        
        const emailResult = await sendVerificationEmail({
          recipientEmail: email,
          recipientName: `${user.firstName} ${user.lastName}`,
          verificationToken,
          apiKey,
          apiSecret,
          baseUrl: frontendUrl
        });
        
        if (emailResult.success) {
          console.log(`✅ New verification email sent to: ${email}`);
          return res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Email Sent - TrackTechFit</title>
              <style>
                body { font-family: Arial, sans-serif; background: linear-gradient(180deg, #1B4332 0%, #081C15 80%); display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; color: white; }
                .verification-container { background-color: rgba(177, 167, 166, 0.25); border-radius: 50px; padding: 40px; max-width: 500px; text-align: center; width: 100%; box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3); }
                .verification-title { color: #FFFFFF; font-size: 24px; font-weight: bold; margin-bottom: 20px; }
                .verification-subtitle { color: rgba(255, 255, 255, 0.8); font-size: 16px; margin-bottom: 30px; }
                .success-message { color: #00A951; font-weight: bold; margin: 20px 0; }
                .verification-loader { width: 40px; height: 40px; border: 4px solid rgba(255, 255, 255, 0.3); border-radius: 50%; border-top-color: #00A951; animation: spin 1s linear infinite; margin: 20px auto; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
              </style>
            </head>
            <body>
              <div class="verification-container">
                <h1 class="verification-title">TrackTechFit</h1>
                <p class="verification-subtitle">Email Verification</p>
                <p class="success-message">Verification Email Sent!</p>
                <p>We've sent a new verification email to your address. Please check your inbox (and spam folder) to verify your account.</p>
                <p>You will be redirected to the login page in a few seconds...</p>
                <div class="verification-loader"></div>
              </div>
              <script>
                setTimeout(function() { window.location.href = "${process.env.FRONTEND_URL || 'http://localhost:3000'}/signin"; }, 5000);
              </script>
            </body>
            </html>
          `);
        } else {
          console.log('❌ Failed to send new verification email:', emailResult.error);
          return res.status(500).send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Error - TrackTechFit</title>
              <style>
                body { font-family: Arial, sans-serif; background: linear-gradient(180deg, #1B4332 0%, #081C15 80%); display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; color: white; }
                .verification-container { background-color: rgba(177, 167, 166, 0.25); border-radius: 50px; padding: 40px; max-width: 500px; text-align: center; width: 100%; box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3); }
                .verification-title { color: #FFFFFF; font-size: 24px; font-weight: bold; margin-bottom: 20px; }
                .verification-subtitle { color: rgba(255, 255, 255, 0.8); font-size: 16px; margin-bottom: 30px; }
                .error-message { color: #ff6666; font-weight: bold; margin: 20px 0; }
                .btn { display: inline-block; padding: 12px 25px; border-radius: 5px; text-decoration: none; font-weight: bold; margin-top: 20px; }
                .btn-primary { background-color: #00A951; color: white; }
              </style>
            </head>
            <body>
              <div class="verification-container">
                <h1 class="verification-title">TrackTechFit</h1>
                <p class="verification-subtitle">Email Verification</p>
                <p class="error-message">Failed to send verification email</p>
                <p>We couldn't send a verification email at this time. Please try again later.</p>
                <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/signin" class="btn btn-primary">Go to Sign In</a>
              </div>
            </body>
            </html>
          `);
        }
      } catch (error) {
        console.error('❌ Error in email sending process:', error);
        return res.status(500).send(`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Error - TrackTechFit</title>
            <style>
              body { font-family: Arial, sans-serif; background: linear-gradient(180deg, #1B4332 0%, #081C15 80%); display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; color: white; }
              .verification-container { background-color: rgba(177, 167, 166, 0.25); border-radius: 50px; padding: 40px; max-width: 500px; text-align: center; width: 100%; box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3); }
              .verification-title { color: #FFFFFF; font-size: 24px; font-weight: bold; margin-bottom: 20px; }
              .verification-subtitle { color: rgba(255, 255, 255, 0.8); font-size: 16px; margin-bottom: 30px; }
              .error-message { color: #ff6666; font-weight: bold; margin: 20px 0; }
              .btn { display: inline-block; padding: 12px 25px; border-radius: 5px; text-decoration: none; font-weight: bold; margin-top: 20px; }
              .btn-primary { background-color: #00A951; color: white; }
            </style>
          </head>
          <body>
            <div class="verification-container">
              <h1 class="verification-title">TrackTechFit</h1>
              <p class="verification-subtitle">Email Verification</p>
              <p class="error-message">Server Error</p>
              <p>We encountered an error while processing your request. Please try again later.</p>
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/signin" class="btn btn-primary">Go to Sign In</a>
            </div>
          </body>
          </html>
        `);
      }
    } else {
      console.log('❌ Mailjet credentials missing for verification email');
      return res.status(500).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Error - TrackTechFit</title>
          <style>
            body { font-family: Arial, sans-serif; background: linear-gradient(180deg, #1B4332 0%, #081C15 80%); display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; color: white; }
            .verification-container { background-color: rgba(177, 167, 166, 0.25); border-radius: 50px; padding: 40px; max-width: 500px; text-align: center; width: 100%; box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3); }
            .verification-title { color: #FFFFFF; font-size: 24px; font-weight: bold; margin-bottom: 20px; }
            .verification-subtitle { color: rgba(255, 255, 255, 0.8); font-size: 16px; margin-bottom: 30px; }
            .error-message { color: #ff6666; font-weight: bold; margin: 20px 0; }
            .btn { display: inline-block; padding: 12px 25px; border-radius: 5px; text-decoration: none; font-weight: bold; margin-top: 20px; }
            .btn-primary { background-color: #00A951; color: white; }
          </style>
        </head>
        <body>
          <div class="verification-container">
            <h1 class="verification-title">TrackTechFit</h1>
            <p class="verification-subtitle">Email Verification</p>
            <p class="error-message">Email Service Unavailable</p>
            <p>Our email service is currently unavailable. Please try again later.</p>
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/signin" class="btn btn-primary">Go to Sign In</a>
          </div>
        </body>
        </html>
      `);
    }
  } catch (error) {
    console.error('❌ Resend verification from expired error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Error - TrackTechFit</title>
        <style>
          body { font-family: Arial, sans-serif; background: linear-gradient(180deg, #1B4332 0%, #081C15 80%); display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; color: white; }
          .verification-container { background-color: rgba(177, 167, 166, 0.25); border-radius: 50px; padding: 40px; max-width: 500px; text-align: center; width: 100%; box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3); }
          .verification-title { color: #FFFFFF; font-size: 24px; font-weight: bold; margin-bottom: 20px; }
          .verification-subtitle { color: rgba(255, 255, 255, 0.8); font-size: 16px; margin-bottom: 30px; }
          .error-message { color: #ff6666; font-weight: bold; margin: 20px 0; }
          .btn { display: inline-block; padding: 12px 25px; border-radius: 5px; text-decoration: none; font-weight: bold; margin-top: 20px; }
          .btn-primary { background-color: #00A951; color: white; }
        </style>
      </head>
      <body>
        <div class="verification-container">
          <h1 class="verification-title">TrackTechFit</h1>
          <p class="verification-subtitle">Email Verification</p>
          <p class="error-message">Server Error</p>
          <p>We encountered an error while processing your request. Please try again later.</p>
          <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/signin" class="btn btn-primary">Go to Sign In</a>
        </div>
      </body>
      </html>
    `);
  }
});

module.exports = router;
