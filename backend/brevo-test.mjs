// Reproduce the exact nodemailer send against Brevo to surface the real error.
import 'dotenv/config';
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
    : undefined,
});

console.log('Host:', process.env.SMTP_HOST, 'Port:', process.env.SMTP_PORT);
console.log('From:', process.env.MAIL_FROM, 'User:', process.env.SMTP_USER);

try {
  console.log('\nVerifying connection/auth...');
  await transporter.verify();
  console.log('✅ verify() OK — connection + auth good.');

  const to = process.argv[2] || process.env.SMTP_USER;
  console.log(`\nSending test email to ${to} ...`);
  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject: 'Tootica Brevo test',
    text: 'If you received this, Brevo SMTP is working.',
  });
  console.log('✅ sent:', info.messageId, info.response);
} catch (err) {
  console.error('\n❌ SEND FAILED — exact error below:');
  console.error('message:', err.message);
  console.error('code   :', err.code);
  console.error('responseCode:', err.responseCode);
  console.error('response:', err.response);
}
