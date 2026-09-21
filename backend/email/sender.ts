import { Resend } from 'resend';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

let _resendConfigCache: { client: Resend; fromEmail: string } | null = null;
let _resendConfigCachedAt = 0;
const RESEND_CACHE_TTL_MS = 5 * 60 * 1000;

async function getResendClient() {
  const now = Date.now();
  if (_resendConfigCache && now - _resendConfigCachedAt < RESEND_CACHE_TTL_MS) {
    return _resendConfigCache;
  }

  console.log('[Email] Getting Resend client...');

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    console.log('[Email] ERROR: No Replit token available');
    return null;
  }
  if (!hostname) {
    console.log('[Email] ERROR: REPLIT_CONNECTORS_HOSTNAME not set');
    return null;
  }

  try {
    const response = await fetch(
      'https://' +
        hostname +
        '/api/v2/connection?include_secrets=true&connector_names=resend',
      {
        headers: {
          Accept: 'application/json',
          X_REPLIT_TOKEN: xReplitToken,
        },
      },
    );
    const data = await response.json();
    const connectionSettings = data.items?.[0];
    if (!connectionSettings) {
      console.log('[Email] ERROR: No Resend connection found.');
      return null;
    }
    if (!connectionSettings.settings?.api_key) {
      console.log('[Email] ERROR: Resend API key not configured');
      return null;
    }
    const config = {
      client: new Resend(connectionSettings.settings.api_key),
      fromEmail:
        connectionSettings.settings.from_email || 'onboarding@resend.dev',
    };
    _resendConfigCache = config;
    _resendConfigCachedAt = now;
    console.log(
      '[Email] Resend client configured successfully with from email:',
      config.fromEmail,
    );
    return config;
  } catch (error) {
    console.error('[Email] Failed to get Resend credentials:', error);
    return null;
  }
}

export async function sendEmail({
  to,
  subject,
  html,
}: EmailOptions): Promise<boolean> {
  console.log(`[Email] Attempting to send email to: ${to}`);
  console.log(`[Email] Subject: ${subject}`);

  const resendConfig = await getResendClient();

  if (!resendConfig) {
    console.log('[Email] WARNING: Resend not configured - email NOT sent!');
    return false;
  }

  try {
    console.log(`[Email] Sending via Resend from: ${resendConfig.fromEmail}`);
    console.log(`[Email] HTML size: ${html.length} bytes`);
    const { data, error } = await resendConfig.client.emails.send({
      from: resendConfig.fromEmail,
      to,
      subject,
      html,
    });
    if (error) {
      console.error('[Email] Resend API error:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }
    console.log(`[Email] SUCCESS - Email sent to ${to} (Resend ID: ${data?.id})`);
    return true;
  } catch (error) {
    console.error('[Email] Error sending email:', error);
    throw new Error('Failed to send email');
  }
}
