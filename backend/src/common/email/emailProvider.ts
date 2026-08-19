import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

import { env } from '../../config/env';

export interface EmailMessage {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

/** Abstraction over outbound email so the transport can be swapped per env. */
export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

// Local dev points at MailHog (see docker-compose.yml); no auth unless SMTP_USER
// is set. Swap the env values for a real SMTP provider in production.
class NodemailerEmailProvider implements EmailProvider {
  private readonly transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: false,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.password } : undefined,
    });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: env.smtp.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}

export const emailProvider: EmailProvider = new NodemailerEmailProvider();
