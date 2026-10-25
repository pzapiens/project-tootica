import { env } from '../../config/env';

export interface SmsMessage {
  /** Destination in E.164 form, e.g. "+14155550100". */
  to: string;
  /** Free-form message. Used verbatim by the console + Twilio providers. */
  body: string;
  /**
   * Structured fields for template-based gateways (MSG91 under India DLT, which
   * cannot send free-form text — it fills the variables of a DLT-approved
   * template). Ignored by the console + Twilio providers.
   */
  otp?: string;
  expiryMinutes?: number;
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

/**
 * MSG91 via the **OTP API v5** (no SDK — a single authenticated fetch). The
 * template is registered under MSG91's *OTP* section (not Flow/SMS), so it's
 * sent through `/api/v5/otp`, which fills the template's reserved `##OTP##`
 * variable. We generate the code ourselves (and verify it in otpStore), passing
 * it as `otp` so MSG91 is only the delivery channel; `otp_expiry` carries the
 * validity in minutes.
 *
 * Your MSG91 OTP template, e.g.:
 *   "Your Tootica login code is ##OTP##. It expires in 5 minutes. Do not share
 *    it with anyone. -TOOTICA"
 *
 * Selected when MSG91_AUTH_KEY + MSG91_TEMPLATE_ID are set.
 */
class Msg91SmsProvider implements SmsProvider {
  constructor(
    private readonly authKey: string,
    private readonly templateId: string,
  ) {}

  async send(message: SmsMessage): Promise<void> {
    // MSG91 wants the number with country code and no '+' or separators.
    const mobiles = message.to.replace(/\D/g, '');
    const url = new URL('https://control.msg91.com/api/v5/otp');
    url.searchParams.set('template_id', this.templateId);
    url.searchParams.set('mobile', mobiles);
    if (message.otp) url.searchParams.set('otp', message.otp);
    if (message.expiryMinutes != null) {
      url.searchParams.set('otp_expiry', String(message.expiryMinutes));
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authkey: this.authKey,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      // Any custom template variables (beyond the reserved ##OTP##) would go here.
      body: JSON.stringify({}),
    });
    // MSG91 can return HTTP 200 with an error envelope, so check both.
    const detail = await res.text().catch(() => '');
    if (!res.ok || /"type"\s*:\s*"error"/.test(detail)) {
      throw new Error(`SMS send failed (${res.status}): ${detail.slice(0, 200)}`);
    }
  }
}

function createSmsProvider(): SmsProvider {
  const { authKey, templateId } = env.sms.msg91;
  if (authKey && templateId) {
    return new Msg91SmsProvider(authKey, templateId);
  }
  const { accountSid, authToken, from } = env.sms.twilio;
  if (accountSid && authToken && from) {
    return new TwilioSmsProvider(accountSid, authToken, from);
  }
  return new ConsoleSmsProvider();
}

export const smsProvider: SmsProvider = createSmsProvider();
