/**
 * Pluggable Email Service for B.H.T Diner
 * Supports Resend, SendGrid, and Console / In-Memory test logging.
 */

const emailLogs = [];

/**
 * Core send method using the configured provider adapter.
 */
async function sendMail({ to, subject, html, text }) {
  const provider = (process.env.EMAIL_PROVIDER || 'resend').toLowerCase();
  const from = process.env.EMAIL_FROM || 'B.H.T Diner <onboarding@resend.dev>';
  const resendApiKey = process.env.RESEND_API_KEY;
  const sendgridApiKey = process.env.SENDGRID_API_KEY;
  const isTest = process.env.NODE_ENV === 'test';

  const emailRecord = {
    to,
    from,
    subject,
    html,
    text,
    sentAt: new Date()
  };

  // Always record in memory for test runners / inspection
  emailLogs.push(emailRecord);

  // If in test mode, or provider is explicitly console, or no API keys configured
  if (isTest || provider === 'console' || (provider === 'resend' && !resendApiKey) || (provider === 'sendgrid' && !sendgridApiKey)) {
    console.log('\n================== ✉️ EMAIL DISPATCH (DEV/TEST) ==================');
    console.log(`To:      ${to}`);
    console.log(`From:    ${from}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body:    ${text || html}`);
    console.log('=================================================================\n');
    return { ok: true, mode: 'console/test', record: emailRecord };
  }

  // Resend API Adapter
  if (provider === 'resend') {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey.trim()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from,
          to: Array.isArray(to) ? to : [to],
          subject,
          html,
          text: text || html.replace(/<[^>]+>/g, '')
        })
      });

      const data = await response.json();
      if (!response.ok) {
        console.error('❌ Resend API Error:', data);
        return { ok: false, error: data.message || 'Failed to send email via Resend' };
      }
      return { ok: true, messageId: data.id };
    } catch (err) {
      console.error('❌ Resend Network Error:', err.message);
      return { ok: false, error: err.message };
    }
  }

  // SendGrid API Adapter
  if (provider === 'sendgrid') {
    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sendgridApiKey.trim()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: from.includes('<') ? from.match(/<([^>]+)>/)[1] : from },
          subject,
          content: [
            { type: 'text/html', value: html }
          ]
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('❌ SendGrid API Error:', errText);
        return { ok: false, error: errText };
      }
      return { ok: true };
    } catch (err) {
      console.error('❌ SendGrid Network Error:', err.message);
      return { ok: false, error: err.message };
    }
  }

  return { ok: true, mode: 'unhandled_provider' };
}

/**
 * Sends 6-digit OTP email for account activation.
 * @param {string} toEmail
 * @param {string} otp
 */
async function sendActivationOtp(toEmail, otp) {
  const subject = 'B.H.T Diner - Account Activation Code';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 550px; margin: auto; padding: 24px; border: 2px solid #ba1414; border-radius: 16px; background-color: #ffffff;">
      <h2 style="color: #ba1414; margin-top: 0;">🍽️ B.H.T Diner - Account Activation</h2>
      <p style="color: #334155; font-size: 15px;">Welcome to B.H.T Diner! Please use the following One-Time Password (OTP) to activate your account:</p>
      <div style="background-color: #f5f5f5; border: 1px dashed #ba1414; border-radius: 12px; padding: 18px; text-align: center; margin: 20px 0;">
        <span style="font-size: 32px; font-weight: 900; letter-spacing: 6px; color: #ba1414;">${otp}</span>
      </div>
      <p style="color: #64748b; font-size: 13px;">⚠️ This activation code will expire in <strong>2 minutes</strong>. You have 3 attempts to input the code.</p>
      <p style="color: #64748b; font-size: 13px;">If you did not register for an account at B.H.T Diner, you can safely ignore this email.</p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin-top: 24px;">
      <p style="color: #94a3b8; font-size: 11px; text-align: center;">&copy; B.H.T Diner - Classic Quality &amp; Taste</p>
    </div>
  `;
  const text = `B.H.T Diner - Account Activation\n\nYour 6-digit OTP code is: ${otp}\nThis code will expire in 2 minutes.`;
  return await sendMail({ to: toEmail, subject, html, text });
}

/**
 * Sends password reset link email.
 * @param {string} toEmail
 * @param {string} resetUrl
 */
async function sendPasswordResetLink(toEmail, resetUrl) {
  const subject = 'B.H.T Diner - Reset Your Password';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 550px; margin: auto; padding: 24px; border: 2px solid #ba1414; border-radius: 16px; background-color: #ffffff;">
      <h2 style="color: #ba1414; margin-top: 0;">🔑 B.H.T Diner - Password Reset Request</h2>
      <p style="color: #334155; font-size: 15px;">We received a request to reset your password. Click the button below to set a new password:</p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${resetUrl}" style="background-color: #ba1414; color: #f5f5f5; padding: 14px 28px; font-weight: bold; font-size: 15px; text-decoration: none; border-radius: 12px; display: inline-block;">Reset Password</a>
      </div>
      <p style="color: #64748b; font-size: 13px;">Or copy and paste this link into your browser:</p>
      <p style="color: #334155; font-size: 12px; word-break: break-all; background: #f8fafc; padding: 10px; border-radius: 8px;">${resetUrl}</p>
      <p style="color: #64748b; font-size: 13px;">⚠️ This link will expire in <strong>15 minutes</strong>. Your current password remains unchanged until you complete the reset process.</p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin-top: 24px;">
      <p style="color: #94a3b8; font-size: 11px; text-align: center;">&copy; B.H.T Diner - Classic Quality &amp; Taste</p>
    </div>
  `;
  const text = `B.H.T Diner - Password Reset Request\n\nReset your password here: ${resetUrl}\nThis link expires in 15 minutes.`;
  return await sendMail({ to: toEmail, subject, html, text });
}

function getEmailLogs() {
  return emailLogs;
}

function clearEmailLogs() {
  emailLogs.length = 0;
}

module.exports = {
  sendMail,
  sendActivationOtp,
  sendPasswordResetLink,
  getEmailLogs,
  clearEmailLogs
};
