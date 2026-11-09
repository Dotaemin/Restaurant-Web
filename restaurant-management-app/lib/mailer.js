const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465', 10);
const SMTP_SECURE = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : SMTP_PORT === 465;
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';

// Create transporter only if user/pass are provided
let transporter = null;
if (SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
}

/**
 * Send 6-digit OTP code to user's email for account activation
 */
async function sendActivationOtpEmail(toEmail, otp) {
  const mailOptions = {
    from: `"B.H.T Diner" <${SMTP_USER || 'no-reply@bhtdiner.com'}>`,
    to: toEmail,
    subject: 'Your B.H.T Diner Activation Code',
    text: `Hello,\n\nYour 6-digit activation code is: ${otp}\n\nThis code will expire in 2 minutes.\nPlease enter this code on the activation page to activate your account.\n\nThank you,\nB.H.T Diner Team`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; rounded: 12px; background-color: #f8fafc;">
        <h2 style="color: #ba1414; margin-top: 0;">Welcome to B.H.T Diner</h2>
        <p style="color: #334155; font-size: 16px;">Please use the following 6-digit code to activate your new account:</p>
        <div style="background-color: #ffffff; padding: 16px; text-align: center; border-radius: 8px; border: 2px dashed #ba1414; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #ba1414;">${otp}</span>
        </div>
        <p style="color: #64748b; font-size: 14px;">This code is valid for <strong>2 minutes</strong>.</p>
        <p style="color: #64748b; font-size: 13px; margin-top: 24px; border-top: 1px solid #cbd5e1; padding-top: 12px;">If you did not request this registration, please safely ignore this email.</p>
      </div>
    `
  };

  if (!transporter) {
    console.log(`[SMTP Mailer Notice] Live Gmail SMTP credentials not detected in .env.`);
    console.log(`[SMTP Mailer Simulated Dispatch] To: ${toEmail} | OTP Code: ${otp}`);
    return { messageId: 'simulated-otp-id', success: true };
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Failed to dispatch OTP email via Gmail SMTP:', error.message);
    throw error;
  }
}

/**
 * Send password reset link to user's email
 */
async function sendPasswordResetEmail(toEmail, resetUrl) {
  const mailOptions = {
    from: `"B.H.T Diner" <${SMTP_USER || 'no-reply@bhtdiner.com'}>`,
    to: toEmail,
    subject: 'Reset Your B.H.T Diner Password',
    text: `Hello,\n\nWe received a request to reset your password for B.H.T Diner.\n\nPlease click the link below to set a new password:\n${resetUrl}\n\nThis link will expire in 15 minutes.\nIf you did not request this, your password remains secure and unchanged.\n\nThank you,\nB.H.T Diner Team`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #f8fafc;">
        <h2 style="color: #ba1414; margin-top: 0;">Password Reset Request</h2>
        <p style="color: #334155; font-size: 16px;">We received a request to reset the password associated with your account.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #ba1414; color: #ffffff; padding: 12px 24px; font-weight: bold; text-decoration: none; border-radius: 8px; display: inline-block;">
            Reset My Password
          </a>
        </div>
        <p style="color: #64748b; font-size: 14px;">Or copy and paste this link in your browser:<br/><a href="${resetUrl}" style="color: #ba1414; word-break: break-all;">${resetUrl}</a></p>
        <p style="color: #64748b; font-size: 13px; margin-top: 24px; border-top: 1px solid #cbd5e1; padding-top: 12px;">Your current password remains active until you complete the reset. If you did not make this request, please ignore this email.</p>
      </div>
    `
  };

  if (!transporter) {
    console.log(`[SMTP Mailer Notice] Live Gmail SMTP credentials not detected in .env.`);
    console.log(`[SMTP Mailer Simulated Dispatch] To: ${toEmail} | Reset Link: ${resetUrl}`);
    return { messageId: 'simulated-reset-id', success: true };
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Failed to dispatch reset email via Gmail SMTP:', error.message);
    throw error;
  }
}

module.exports = {
  sendActivationOtpEmail,
  sendPasswordResetEmail
};
