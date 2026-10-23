import { NotificationPayload } from '../types';
import { renderTemplate } from '../templates';

export interface EmailChannelConfig {
  resendApiKey?: string;
  fromAddress: string;
  unsubscribeBaseUrl: string;
  smtp?: {
    host: string;
    port: number;
    user?: string;
    pass?: string;
    secure?: boolean;
  };
}

function buildUnsubscribeUrl(baseUrl: string, recipient: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('email', recipient);
  return url.toString();
}

function buildHtml(payload: NotificationPayload, unsubscribeUrl: string): string {
  const body = renderTemplate(payload.template, payload.data);
  return `${body}\n<hr />\n<p style="font-size:12px;color:#888">
  <a href="${unsubscribeUrl}">Unsubscribe</a> from these notifications.
</p>`;
}

async function sendViaResend(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Resend API error ${response.status}: ${detail}`);
  }
}

async function sendViaSmtp(
  smtp: NonNullable<EmailChannelConfig['smtp']>,
  from: string,
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  // Lazy-load nodemailer so the Resend path does not require SMTP deps.
  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure ?? smtp.port === 465,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  });

  await transporter.sendMail({ from, to, subject, html });
}

export async function sendEmail(
  payload: NotificationPayload,
  config: EmailChannelConfig,
): Promise<void> {
  const recipient = payload.recipient;
  const subject = payload.subject ?? 'Notification';
  const unsubscribeUrl = buildUnsubscribeUrl(config.unsubscribeBaseUrl, recipient);
  const html = buildHtml(payload, unsubscribeUrl);

  try {
    if (config.resendApiKey) {
      await sendViaResend(config.resendApiKey, config.fromAddress, recipient, subject, html);
      return;
    }

    if (config.smtp) {
      await sendViaSmtp(config.smtp, config.fromAddress, recipient, subject, html);
      return;
    }

    throw new Error('No email transport configured: set RESEND_API_KEY or SMTP settings');
  } catch (error) {
    // Log delivery errors without crashing the dispatcher.
    console.error('[email] delivery failed', {
      recipient,
      template: payload.template,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
