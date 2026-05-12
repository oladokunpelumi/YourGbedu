const { Resend } = require('resend');

function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

let resendClient = null;
let resendClientKey = null;

function getFromEmail() {
  return process.env.FROM_EMAIL || 'YourGbedu <onboarding@resend.dev>';
}

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_placeholder')) return null;

  if (!resendClient || resendClientKey !== apiKey) {
    try {
      resendClient = new Resend(apiKey);
      resendClientKey = apiKey;
    } catch (err) {
      console.error('[Email] Failed to initialize Resend client:', err.message);
      return null;
    }
  }

  return resendClient;
}

/**
 * Send a payment/order confirmation email.
 * @param {object} params
 * @param {string} params.to - Customer email
 * @param {string} params.orderId - Short order reference
 * @param {string} params.genre - Song genre
 * @param {string} params.mood - Song mood
 * @param {string} params.deliveryDate - ISO date string
 * @param {string} params.reference - Paystack reference
 */
async function sendConfirmationEmail({ to, orderId, genre, mood, deliveryDate, reference }) {
  const resend = getResendClient();
  if (!resend) {
    console.log('[Email] Resend not configured — skipping confirmation email');
    return;
  }

  const delivery = new Date(deliveryDate).toLocaleDateString('en-NG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const safeOrderId   = escapeHtml(orderId);
  const safeGenre     = escapeHtml(genre || 'Custom');
  const safeMood      = escapeHtml(mood || 'Custom');
  const safeReference = escapeHtml(reference);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #f0f0f0; margin: 0; padding: 0; }
    .container { max-width: 540px; margin: 40px auto; background: #141414; border-radius: 16px; overflow: hidden; border: 1px solid #242424; }
    .header { background: linear-gradient(135deg, #e11d48, #9f1239); padding: 40px 32px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; color: white; letter-spacing: -0.5px; }
    .header p { margin: 8px 0 0; color: rgba(255,255,255,0.8); font-size: 14px; }
    .body { padding: 32px; }
    .row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #242424; }
    .row:last-child { border-bottom: none; }
    .label { color: #6b7280; font-size: 13px; }
    .value { color: #f9fafb; font-size: 13px; font-weight: 600; text-align: right; }
    .cta { display: block; margin: 24px 0 0; padding: 14px; background: #e11d48; color: white; text-decoration: none; border-radius: 10px; text-align: center; font-weight: 700; font-size: 15px; }
    .footer { padding: 24px 32px; background: #0f0f0f; text-align: center; color: #4b5563; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎵 YourGbedu</h1>
      <p>Your custom song is in production!</p>
    </div>
    <div class="body">
      <p style="color:#d1d5db; line-height:1.6;">Thank you for your order. Our team of professional artists has received your brief and will begin composing your unique song immediately.</p>
      <div style="background:#1c1c1c; border-radius:10px; padding:16px; margin: 20px 0;">
        <div class="row"><span class="label">Order ID</span><span class="value">#${safeOrderId}</span></div>
        <div class="row"><span class="label">Genre</span><span class="value">${safeGenre}</span></div>
        <div class="row"><span class="label">Mood</span><span class="value">${safeMood}</span></div>
        <div class="row"><span class="label">Amount Paid</span><span class="value">₦30,000</span></div>
        <div class="row"><span class="label">Estimated Delivery</span><span class="value">${delivery}</span></div>
        <div class="row"><span class="label">Payment Ref</span><span class="value" style="font-size:11px; font-family:monospace;">${safeReference}</span></div>
      </div>
      <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/track" class="cta">Track Your Order →</a>
    </div>
    <div class="footer">YourGbedu • Your story, our music. © ${new Date().getFullYear()}</div>
  </div>
</body>
</html>`;

  try {
    const result = await resend.emails.send({
      from: getFromEmail(),
      to,
      subject: `🎵 Your YourGbedu order #${orderId} is in production!`,
      html,
    });
    console.log('[Email] Sent confirmation | ID:', result.data?.id);
    return result;
  } catch (err) {
    console.error('[Email] Failed to send confirmation email:', err.message);
  }
}
/**
 * Send a magic link login email.
 * @param {object} params
 * @param {string} params.to - Customer email
 * @param {string} params.token - Magic link token
 */
async function sendMagicLinkEmail({ to, token, clientUrl }) {
  const resend = getResendClient();
  if (!resend) {
    console.log('[Email] Resend not configured — skipping magic link email');
    return;
  }

  const loginUrl = `${clientUrl || process.env.CLIENT_URL || 'http://localhost:3000'}/#/verify?token=${token}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #f0f0f0; margin: 0; padding: 0; }
    .container { max-width: 540px; margin: 40px auto; background: #141414; border-radius: 16px; overflow: hidden; border: 1px solid #242424; }
    .header { background: linear-gradient(135deg, #e11d48, #9f1239); padding: 40px 32px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; color: white; letter-spacing: -0.5px; }
    .header p { margin: 8px 0 0; color: rgba(255,255,255,0.8); font-size: 14px; }
    .body { padding: 32px; text-align: center; }
    .cta { display: inline-block; margin: 24px 0; padding: 14px 28px; background: #e11d48; color: white; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 15px; }
    .footer { padding: 24px 32px; background: #0f0f0f; text-align: center; color: #4b5563; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎵 YourGbedu</h1>
      <p>Sign in to your account</p>
    </div>
    <div class="body">
      <p style="color:#d1d5db; line-height:1.6;">Click the button below to securely sign in to YourGbedu. This link will expire in 15 minutes.</p>
      <a href="${loginUrl}" class="cta">Sign In to YourGbedu</a>
      <p style="color:#6b7280; font-size:12px; margin-top:20px;">If you didn't request this email, you can safely ignore it.</p>
    </div>
    <div class="footer">YourGbedu • Your story, our music. © ${new Date().getFullYear()}</div>
  </div>
</body>
</html>`;

  try {
    const result = await resend.emails.send({
      from: getFromEmail(),
      to,
      subject: '🎵 Sign in to YourGbedu',
      html,
    });
    console.log('[Email] Sent magic link | ID:', result.data?.id);
    return result;
  } catch (err) {
    console.error('[Email] Failed to send magic link email:', err.message);
  }
}

/**
 * Send an order completion email to the customer.
 * @param {object} params
 * @param {string} params.to - Customer email
 * @param {string} params.orderId - Short order reference (8-char uppercase)
 * @param {string} params.genre - Song genre
 * @param {string} params.senderName - Name of the person who ordered
 * @param {string} params.recipientType - Who the song is for (e.g. "Wife")
 */
async function sendCompletionEmail({ to, orderId, genre, senderName, recipientType }) {
  const resend = getResendClient();
  if (!resend) {
    console.log('[Email] Resend not configured — skipping completion email');
    return;
  }

  const safeOrderId       = escapeHtml(orderId);
  const safeGenre         = escapeHtml(genre);
  const safeSenderName    = escapeHtml(senderName);
  const safeRecipientType = escapeHtml(recipientType);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #f0f0f0; margin: 0; padding: 0; }
    .container { max-width: 540px; margin: 40px auto; background: #141414; border-radius: 16px; overflow: hidden; border: 1px solid #242424; }
    .header { background: linear-gradient(135deg, #16a34a, #15803d); padding: 40px 32px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; color: white; letter-spacing: -0.5px; }
    .header p { margin: 8px 0 0; color: rgba(255,255,255,0.8); font-size: 14px; }
    .body { padding: 32px; }
    .row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #242424; }
    .row:last-child { border-bottom: none; }
    .label { color: #6b7280; font-size: 13px; }
    .value { color: #f9fafb; font-size: 13px; font-weight: 600; text-align: right; }
    .cta { display: block; margin: 24px 0 0; padding: 14px; background: #e11d48; color: white; text-decoration: none; border-radius: 10px; text-align: center; font-weight: 700; font-size: 15px; }
    .badge { display: inline-block; background: #16a34a22; color: #4ade80; border: 1px solid #16a34a44; border-radius: 20px; padding: 4px 14px; font-size: 13px; font-weight: 700; margin-bottom: 20px; }
    .footer { padding: 24px 32px; background: #0f0f0f; text-align: center; color: #4b5563; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎵 YourGbedu</h1>
      <p>Your custom song is ready!</p>
    </div>
    <div class="body">
      <div style="text-align:center; margin-bottom: 24px;">
        <span class="badge">✓ Song Completed</span>
      </div>
      <p style="color:#d1d5db; line-height:1.6;">
        ${safeSenderName ? `Hi ${safeSenderName},` : 'Hello,'}<br><br>
        Great news! Your custom${safeRecipientType ? ` song for your ${safeRecipientType}` : ' song'} has been completed and is ready for delivery. Our team has poured their heart into crafting something truly special for you.
      </p>
      <div style="background:#1c1c1c; border-radius:10px; padding:16px; margin: 20px 0;">
        <div class="row"><span class="label">Order ID</span><span class="value">#${safeOrderId}</span></div>
        ${safeGenre ? `<div class="row"><span class="label">Genre</span><span class="value">${safeGenre}</span></div>` : ''}
        ${safeRecipientType ? `<div class="row"><span class="label">Song For</span><span class="value">${safeRecipientType}</span></div>` : ''}
        <div class="row"><span class="label">Status</span><span class="value" style="color:#4ade80;">Completed ✓</span></div>
      </div>
      <p style="color:#9ca3af; font-size:13px; line-height:1.6;">
        Our team will be in touch with the final track. If you have any questions, please don't hesitate to reach out.
      </p>
      <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/#/track" class="cta">View Your Order →</a>
    </div>
    <div class="footer">YourGbedu • Your story, our music. © ${new Date().getFullYear()}</div>
  </div>
</body>
</html>`;

  try {
    const result = await resend.emails.send({
      from: getFromEmail(),
      to,
      subject: `🎵 Your YourGbedu song #${orderId} is ready!`,
      html,
    });
    console.log('[Email] Sent completion email | ID:', result.data?.id);
    return result;
  } catch (err) {
    console.error('[Email] Failed to send completion email:', err.message);
  }
}

module.exports = { sendConfirmationEmail, sendMagicLinkEmail, sendCompletionEmail };
