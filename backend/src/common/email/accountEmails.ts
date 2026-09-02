import { emailProvider } from './emailProvider';

/**
 * Emails a newly-created user their temporary password. They sign in with it
 * and are forced to set a new password + accept the Terms on first login.
 */
export async function sendTemporaryPasswordEmail(params: {
  to: string;
  firstName?: string | null;
  temporaryPassword: string;
  clinicName?: string | null;
}): Promise<void> {
  const { to, firstName, temporaryPassword, clinicName } = params;
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
  const forClinic = clinicName ? ` for ${clinicName}` : '';

  await emailProvider.send({
    to,
    subject: 'Your Tootica account is ready',
    text: [
      greeting,
      '',
      `An account has been created for you on Tootica${forClinic}.`,
      'Use the credentials below to sign in:',
      '',
      `    Email:              ${to}`,
      `    Temporary password: ${temporaryPassword}`,
      '',
      'For your security, you will be asked to set a new password and accept the',
      'Terms & Conditions the first time you sign in.',
      '',
      "If you weren't expecting this email, you can safely ignore it.",
      '',
      'Thanks,',
      'The Tootica Team',
    ].join('\n'),
    html: `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a;line-height:1.6;">
    <h2 style="margin:0 0 16px;font-size:20px;">Your Tootica account is ready</h2>
    <p style="margin:0 0 12px;">${greeting}</p>
    <p style="margin:0 0 12px;">
      An account has been created for you on Tootica${forClinic}. Use the
      credentials below to sign in:
    </p>
    <div style="background:#f2f5f9;border-radius:10px;padding:16px 18px;margin:18px 0;">
      <p style="margin:0 0 6px;font-size:13px;color:#666;">EMAIL</p>
      <p style="margin:0 0 14px;font-size:15px;font-weight:600;">${to}</p>
      <p style="margin:0 0 6px;font-size:13px;color:#666;">TEMPORARY PASSWORD</p>
      <p style="margin:0;font-size:20px;font-weight:700;letter-spacing:1px;color:#00478d;">${temporaryPassword}</p>
    </div>
    <p style="margin:0 0 12px;">
      For your security, you'll be asked to set a new password and accept the
      Terms &amp; Conditions the first time you sign in.
    </p>
    <p style="margin:0 0 12px;color:#666;">
      If you weren't expecting this email, you can safely ignore it.
    </p>
    <p style="margin:24px 0 0;">Thanks,<br/>The Tootica Team</p>
  </div>`,
  });
}
