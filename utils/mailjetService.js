const Mailjet = require('node-mailjet');

/**
 * Configure and return a Mailjet client instance
 * 
 * @param {string} apiKey - Mailjet API key 
 * @param {string} apiSecret - Mailjet API secret
 * @returns {object} - Mailjet client instance
 */
const getMailjetClient = (apiKey, apiSecret) => {
  if (!apiKey || !apiSecret) {
    console.log('❌ Mailjet credentials not provided');
    return null;
  }
  
  try {
    return Mailjet.apiConnect(apiKey, apiSecret);
  } catch (error) {
    console.error('❌ Failed to initialize Mailjet client:', error);
    return null;
  }
};

/**
 * Send verification email to user
 * 
 * @param {object} params - Email parameters
 * @param {string} params.recipientEmail - Email address of recipient
 * @param {string} params.recipientName - Name of recipient
 * @param {string} params.verificationToken - Token for email verification
 * @param {string} params.apiKey - Mailjet API key
 * @param {string} params.apiSecret - Mailjet API secret
 * @param {string} params.baseUrl - Base URL for verification link
 * @returns {Promise} - Promise resolving to email send result
 */
const sendVerificationEmail = async ({
  recipientEmail,
  recipientName,
  verificationToken,
  apiKey,
  apiSecret,
  baseUrl
}) => {
  try {
    console.log(`🔄 Sending verification email to: ${recipientEmail}`);
    
    const mailjet = getMailjetClient(apiKey, apiSecret);
    
    if (!mailjet) {
      throw new Error('Mailjet client initialization failed');
    }
    
    // Create proper backend URL for verification
    // Important: This URL must point to your backend API endpoint
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
    const verificationUrl = `${backendUrl}/api/auth/verify-email?token=${verificationToken}`;
    
    console.log('🔗 Verification URL:', verificationUrl);
    
    const request = mailjet
      .post('send', { version: 'v3.1' })
      .request({
        Messages: [
          {
            From: {
              Email: "emeralddandelionblank@gmail.com", // Using your verified email as sender
              Name: "TrackTechFit"
            },
            To: [
              {
                Email: recipientEmail,
                Name: recipientName
              }
            ],
            Subject: "Please verify your email for TrackTechFit",
            TextPart: `Hello ${recipientName},\n\nThank you for signing up for TrackTechFit! Please verify your email by clicking this link: ${verificationUrl}\n\nThis link will expire in 24 hours.\n\nThank you,\nThe TrackTechFit Team`,
            HTMLPart: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5; border-radius: 10px;">
                <h2 style="color: #00A951;">Welcome to TrackTechFit!</h2>
                <p>Hello ${recipientName},</p>
                <p>Thank you for signing up. Please verify your email address by clicking the button below:</p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${verificationUrl}" style="background-color: #00A951; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                    VERIFY MY EMAIL
                  </a>
                </div>
                <p>If the button doesn't work, you can also copy and paste this link into your browser:</p>
                <p style="background-color: #e9e9e9; padding: 10px; border-radius: 5px; word-break: break-all;">
                  <a href="${verificationUrl}" style="color: #00A951; text-decoration: none;">${verificationUrl}</a>
                </p>
                <p>This link will expire in 24 hours.</p>
               
                <!-- Important Notice Box -->
                <div style="margin: 25px 0; padding: 20px; background-color: #e9f7ef; border-left: 5px solid #00A951; border-radius: 5px;">
                  <div style="color: #00A951; font-size: 18px; font-weight: bold; margin-bottom: 10px;">
                    ⚠️ IMPORTANT NOTICE:
                  </div>
                  <p style="margin: 0; color: #006d32; font-size: 16px;">
                    If you can't find this email in your inbox, please <strong>CHECK YOUR SPAM/JUNK FOLDER</strong>.
                  </p>
                  <p style="margin-top: 8px; color: #006d32; font-size: 15px;">
                    To ensure you receive future emails from us, please add <strong>emeralddandelionblank@gmail.com</strong> to your contacts.
                  </p>
                </div>
                
                <hr style="border: 1px solid #e0e0e0; margin: 20px 0;">
                <p style="font-size: 12px; color: #666;">
                  If you didn't sign up for TrackTechFit, you can safely ignore this email.
                </p>
                <p>Thank you,<br>The TrackTechFit Team</p>
              </div>
            `
          }
        ]
      });
    
    const result = await request;
    console.log(`✅ Verification email sent successfully to: ${recipientEmail}`);
    return { success: true, result: result.body };
  } catch (error) {
    console.error('❌ Failed to send verification email:', error.message);
    if (error.statusCode) {
      console.error('❌ Mailjet status code:', error.statusCode);
    }
    if (error.response && error.response.data) {
      console.error('❌ Mailjet error detail:', JSON.stringify(error.response.data));
    }
    return { success: false, error: error.message };
  }
};

module.exports = {
  getMailjetClient,
  sendVerificationEmail
}; 