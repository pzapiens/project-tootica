import { env } from '../../config/env';

export interface SmsMessage {
  /** Destination in E.164 form, e.g. "+14155550100". */
  to: string;
  body: string;
}

/** Abstraction over outbound SMS so the transport can be swapped per env. */
export interface SmsProvider {
  send(message: SmsMessage): Promise<void>;
}

/**
 * Dev / no-credentials fallback: logs the message instead of sending it, so the
 * OTP login flow is fully exercisable locally without a paid SMS gateway. The
 * code is printed to the server console — read it there to complete a login.
 */
class ConsoleSmsProvider implements SmsProvider {
  async send(message: SmsMessage): Promise<void> {
    console.info(`[sms:console] to=${message.to} body=${message.body}`);
  }
}

/**
 * Twilio via the REST API (no SDK dependency — a single authenticated fetch).
 * Selected only when TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM are
 * all set; otherwise we fall back to the console provider above.
 */
class TwilioSmsProvider implements SmsProvider {
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly from: string,
  ) {}

  async send(message: SmsMessage): Promise<void> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: message.to, From: this.from, Body: message.body }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`SMS send failed (${res.status}): ${detail.slice(0, 200)}`);
    }
  }
}

function createSmsProvider(): SmsProvider {
  const { accountSid, authToken, from } = env.sms.twilio;
  if (accountSid && authToken && from) {
    return new TwilioSmsProvider(accountSid, authToken, from);
  }
  return new ConsoleSmsProvider();
}

export const smsProvider: SmsProvider = createSmsProvider();
