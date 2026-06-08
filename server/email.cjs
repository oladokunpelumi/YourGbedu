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

function getResendClientStatus() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_placeholder')) {
    return { client: null, reason: 'resend_not_configured' };
  }

  if (!resendClient || resendClientKey !== apiKey) {
    try {
      resendClient = new Resend(apiKey);
      resendClientKey = apiKey;
    } catch (err) {
      console.error('[Email] Failed to initialize Resend client:', err.message);
      return { client: null, reason: 'resend_init_failed', error: err.message };
    }
  }

  return { client: resendClient, reason: null };
}

function getClientUrl() {
  return (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function normalizeClientUrl(clientUrl) {
  return (clientUrl || process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function getTrackUrl(orderId) {
  return `${getClientUrl()}/#/track?id=${encodeURIComponent(orderId)}`;
}

function getVerifyUrl({ clientUrl, token }) {
  return `${normalizeClientUrl(clientUrl)}/#/verify?token=${encodeURIComponent(token)}`;
}

function redactEmail(email) {
  const value = String(email || '');
  const [name, domain] = value.split('@');
  if (!name || !domain) return 'unknown';
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${name.length > 2 ? '***' : '*'}@${domain}`;
}

function logEmailResult(type, status, details = {}) {
  const payload = Object.entries(details)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${value}`)
    .join(' | ');
  const line = `[Email] ${type} ${status}${payload ? ` | ${payload}` : ''}`;
  if (status === 'sent') console.log(line);
  else if (status === 'skipped') console.warn(line);
  else console.error(line);
}

function skippedEmailResult(type, to, reason, extra = {}) {
  const result = { ok: false, skipped: true, reason, ...extra };
  logEmailResult(type, 'skipped', { to: redactEmail(to), reason });
  return result;
}

function failedEmailResult(type, to, reason, error) {
  const message = error?.message || error || 'Unknown email provider error';
  const result = { ok: false, skipped: false, reason, error: message };
  logEmailResult(type, 'failed', { to: redactEmail(to), reason, error: message });
  return result;
}

function sentEmailResult(type, to, result) {
  const providerId = result?.data?.id;
  const payload = { ok: true, skipped: false, provider: 'resend', id: providerId };
  logEmailResult(type, 'sent', { to: redactEmail(to), id: providerId });
  return payload;
}

/**
 * Send a payment/order confirmation email.
 * @param {object} params
 * @param {string} params.to - Customer email
 * @param {string} params.orderId - Short order reference
 * @param {string} params.genre - Song genre
 * @param {string} params.deliveryDate - ISO date string
 * @param {string} params.reference - Payment reference
 * @param {string} [params.amountLabel] - Human-readable paid amount
 */
async function sendConfirmationEmail({ to, orderId, genre, deliveryDate, reference, amountLabel }) {
  const { client: resend, reason } = getResendClientStatus();
  if (!resend) {
    return skippedEmailResult('confirmation', to, reason);
  }

  const delivery = new Date(deliveryDate).toLocaleDateString('en-NG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const safeOrderId   = escapeHtml(orderId);
  const safeGenre     = escapeHtml(genre || 'Custom');
  const safeReference = escapeHtml(reference);
  const safeAmount    = escapeHtml(amountLabel || 'Paid');
  const trackUrl      = getTrackUrl(orderId);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #FAF6EE; color: #1F1B14; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 40px auto; background: #FFFDF6; border-radius: 18px; overflow: hidden; border: 1px solid #E5DDD0; }
    .header { background: #1F1B14; padding: 40px 32px; text-align: center; }
    .header h1 { margin: 0; font-size: 30px; color: #FFFDF6; letter-spacing: -0.2px; font-family: Georgia, serif; font-style: italic; font-weight: 500; }
    .header p { margin: 8px 0 0; color: rgba(255,253,246,0.72); font-size: 14px; }
    .body { padding: 32px; }
    .row { display: flex; justify-content: space-between; gap: 20px; padding: 12px 0; border-bottom: 1px solid #E5DDD0; }
    .row:last-child { border-bottom: none; }
    .label { color: #8B7F6C; font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; }
    .value { color: #1F1B14; font-size: 13px; font-weight: 700; text-align: right; }
    .panel { background:#FAF6EE; border:1px solid #E5DDD0; border-radius:14px; padding:16px; margin: 22px 0; }
    .cta { display: block; margin: 24px 0 0; padding: 14px; background: #B3522F; color: #FFFDF6; text-decoration: none; border-radius: 999px; text-align: center; font-weight: 800; font-size: 13px; text-transform: uppercase; letter-spacing: 0.12em; }
    .fallback { color:#8B7F6C; font-size:12px; line-height:1.6; word-break:break-all; }
    .footer { padding: 24px 32px; background: #1F1B14; text-align: center; color: rgba(255,253,246,0.45); font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>YourGbedu</h1>
      <p>Your custom song is in production!</p>
    </div>
    <div class="body">
      <p style="color:#5A4F3F; line-height:1.7;">Thank you for your order. We received your brief and your production tracker is ready.</p>
      <div class="panel">
        <div class="row"><span class="label">Order ID</span><span class="value">#${safeOrderId}</span></div>
        <div class="row"><span class="label">Genre</span><span class="value">${safeGenre}</span></div>
        <div class="row"><span class="label">Amount Paid</span><span class="value">${safeAmount}</span></div>
        <div class="row"><span class="label">Estimated Delivery</span><span class="value">${delivery}</span></div>
        <div class="row"><span class="label">Payment Ref</span><span class="value" style="font-size:11px; font-family:monospace;">${safeReference}</span></div>
      </div>
      <a href="${trackUrl}" class="cta">Track Your Order</a>
      <p class="fallback">If the button does not open, paste this link into your browser:<br>${trackUrl}</p>
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
    if (result.error) return failedEmailResult('confirmation', to, 'resend_rejected', result.error);
    return sentEmailResult('confirmation', to, result);
  } catch (err) {
    return failedEmailResult('confirmation', to, 'send_exception', err);
  }
}
/**
 * Send a magic link login email.
 * @param {object} params
 * @param {string} params.to - Customer email
 * @param {string} params.token - Magic link token
 */
async function sendMagicLinkEmail({ to, token, clientUrl }) {
  const loginUrl = getVerifyUrl({ clientUrl, token });
  const { client: resend, reason } = getResendClientStatus();
  if (!resend) {
    const devLinkLogged = process.env.NODE_ENV !== 'production' && process.env.DEV_MAGIC_LINK_LOG !== 'false';
    if (devLinkLogged) {
      console.info(`[Email][dev] Magic link for ${to}: ${loginUrl}`);
    }
    return skippedEmailResult('magic_link', to, reason, {
      devLinkLogged,
      previewUrl: devLinkLogged ? loginUrl : undefined,
    });
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #FAF6EE; color: #1F1B14; margin: 0; padding: 0; }
    .container { max-width: 540px; margin: 40px auto; background: #FFFDF6; border-radius: 16px; overflow: hidden; border: 1px solid #E5DDD0; }
    .header { background: #1F1B14; padding: 40px 32px; text-align: center; }
    .header h1 { margin: 0; font-size: 30px; color: #FFFDF6; font-family: Georgia, serif; font-style: italic; font-weight: 500; }
    .header p { margin: 8px 0 0; color: rgba(255,253,246,0.72); font-size: 14px; }
    .body { padding: 32px; text-align: center; }
    .cta { display: inline-block; margin: 24px 0; padding: 14px 28px; background: #B3522F; color: #FFFDF6; text-decoration: none; border-radius: 999px; font-weight: 800; font-size: 13px; text-transform: uppercase; letter-spacing: 0.12em; }
    .fallback { color:#8B7F6C; font-size:12px; line-height:1.6; word-break:break-all; }
    .footer { padding: 24px 32px; background: #1F1B14; text-align: center; color: rgba(255,253,246,0.45); font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>YourGbedu</h1>
      <p>Open your order tracker</p>
    </div>
    <div class="body">
      <p style="color:#5A4F3F; line-height:1.7;">Click the button below to securely open your YourGbedu order tracker. This link will expire in 15 minutes.</p>
      <a href="${loginUrl}" class="cta">Open order tracker</a>
      <p class="fallback">If the button does not open, paste this link into your browser:<br>${loginUrl}</p>
      <p style="color:#8B7F6C; font-size:12px; margin-top:20px;">If you didn't request this email, you can safely ignore it.</p>
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
    if (result.error) return failedEmailResult('magic_link', to, 'resend_rejected', result.error);
    return sentEmailResult('magic_link', to, result);
  } catch (err) {
    return failedEmailResult('magic_link', to, 'send_exception', err);
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
  const { client: resend, reason } = getResendClientStatus();
  if (!resend) {
    return skippedEmailResult('completion', to, reason);
  }

  const safeOrderId       = escapeHtml(orderId);
  const safeGenre         = escapeHtml(genre);
  const safeSenderName    = escapeHtml(senderName);
  const safeRecipientType = escapeHtml(recipientType);
  const trackUrl          = getTrackUrl(orderId);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #FAF6EE; color: #1F1B14; margin: 0; padding: 0; }
    .container { max-width: 540px; margin: 40px auto; background: #FFFDF6; border-radius: 16px; overflow: hidden; border: 1px solid #E5DDD0; }
    .header { background: #5D6A42; padding: 40px 32px; text-align: center; }
    .header h1 { margin: 0; font-size: 30px; color: #FFFDF6; font-family: Georgia, serif; font-style: italic; font-weight: 500; }
    .header p { margin: 8px 0 0; color: rgba(255,253,246,0.82); font-size: 14px; }
    .body { padding: 32px; }
    .row { display: flex; justify-content: space-between; gap:20px; padding: 12px 0; border-bottom: 1px solid #E5DDD0; }
    .row:last-child { border-bottom: none; }
    .label { color: #8B7F6C; font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; }
    .value { color: #1F1B14; font-size: 13px; font-weight: 700; text-align: right; }
    .panel { background:#FAF6EE; border:1px solid #E5DDD0; border-radius:14px; padding:16px; margin: 20px 0; }
    .cta { display: block; margin: 24px 0 0; padding: 14px; background: #B3522F; color: #FFFDF6; text-decoration: none; border-radius: 999px; text-align: center; font-weight: 800; font-size: 13px; text-transform: uppercase; letter-spacing: 0.12em; }
    .badge { display: inline-block; background: #EEF2E2; color: #5D6A42; border: 1px solid #C9D2B0; border-radius: 20px; padding: 4px 14px; font-size: 13px; font-weight: 700; margin-bottom: 20px; }
    .fallback { color:#8B7F6C; font-size:12px; line-height:1.6; word-break:break-all; }
    .footer { padding: 24px 32px; background: #1F1B14; text-align: center; color: rgba(255,253,246,0.45); font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>YourGbedu</h1>
      <p>Your custom song is ready!</p>
    </div>
    <div class="body">
      <div style="text-align:center; margin-bottom: 24px;">
        <span class="badge">✓ Song Completed</span>
      </div>
      <p style="color:#5A4F3F; line-height:1.7;">
        ${safeSenderName ? `Hi ${safeSenderName},` : 'Hello,'}<br><br>
        Great news! Your custom${safeRecipientType ? ` song for your ${safeRecipientType}` : ' song'} has been completed and is ready for delivery. Our team has poured their heart into crafting something truly special for you.
      </p>
      <div class="panel">
        <div class="row"><span class="label">Order ID</span><span class="value">#${safeOrderId}</span></div>
        ${safeGenre ? `<div class="row"><span class="label">Genre</span><span class="value">${safeGenre}</span></div>` : ''}
        ${safeRecipientType ? `<div class="row"><span class="label">Song For</span><span class="value">${safeRecipientType}</span></div>` : ''}
        <div class="row"><span class="label">Status</span><span class="value" style="color:#5D6A42;">Completed</span></div>
      </div>
      <p style="color:#8B7F6C; font-size:13px; line-height:1.6;">
        Our team will be in touch with the final track. If you have any questions, please don't hesitate to reach out.
      </p>
      <a href="${trackUrl}" class="cta">View your order</a>
      <p class="fallback">If the button does not open, paste this link into your browser:<br>${trackUrl}</p>
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
    if (result.error) return failedEmailResult('completion', to, 'resend_rejected', result.error);
    return sentEmailResult('completion', to, result);
  } catch (err) {
    return failedEmailResult('completion', to, 'send_exception', err);
  }
}

module.exports = {
  sendConfirmationEmail,
  sendMagicLinkEmail,
  sendCompletionEmail,
  getTrackUrl,
  getVerifyUrl,
};
