/**
 * Email notification module.
 *
 * Dev:        stampa su console (nessun SMTP necessario)
 * Production: usa nodemailer con credenziali da env / BTP Destination
 */

const isDev = process.env.NODE_ENV !== 'production';

/**
 * @param {{ to: string, subject: string, body: string, html?: string }} opts
 */
async function sendNotification({ to, subject, body, html }) {
  if (isDev) {
    console.log('\n📧 [EMAIL MOCK]');
    console.log(`   To:      ${to}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   Body:\n${body}\n`);
    return;
  }

  // ── Production: @sap-cloud-sdk/mail-client ────────────────
  const { sendMail } = require('@sap-cloud-sdk/mail-client');

  const mailOptions = {
    from:    process.env.SMTP_FROM || 'noreply@sysko.it',
    to,
    subject,
    text:    body,
    html:    html || body.replace(/\n/g, '<br>')
  };

  try {
    // Si aggancia in automatico alla Connectivity e legge le password criptate
    await sendMail({ destinationName: 'MailService_Sysko' }, [mailOptions]);
  } catch (error) {
    console.error('[SYSKO] 🔴 Errore invio Email tramite in Production:', error.message);
  }
}

module.exports = { sendNotification };
