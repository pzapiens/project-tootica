import 'dotenv/config';
import { prisma } from '../src/common/db/prisma';
import { HttpError } from '../src/common/utils/httpError';
import { encryptToken } from '../src/modules/whatsapp/crypto';
import { MetaSendError, verifyConnection } from '../src/modules/whatsapp/provider';
import { provisionSchema } from '../src/modules/whatsapp/schema';

async function main() {
  const input = provisionSchema.safeParse({
    clinicId: process.env.WHATSAPP_PROVISION_CLINIC_ID,
    wabaId: process.env.WHATSAPP_PROVISION_WABA_ID,
    phoneNumberId: process.env.WHATSAPP_PROVISION_PHONE_NUMBER_ID,
    accessToken: process.env.WHATSAPP_PROVISION_ACCESS_TOKEN,
    templateName: process.env.WHATSAPP_PROVISION_TEMPLATE_NAME,
    templateLanguage: process.env.WHATSAPP_PROVISION_TEMPLATE_LANGUAGE,
  });
  if (!input.success)
    throw new HttpError(
      400,
      'Set every WHATSAPP_PROVISION_* variable with valid values in the backend environment',
    );
  const clinic = await prisma.clinic.findFirst({
    where: { id: input.data.clinicId, status: 'ACTIVE' },
    select: { id: true },
  });
  if (!clinic) throw new HttpError(404, 'Active clinic not found');
  // Validate the encryption key before making network calls.
  const encryptedToken = encryptToken(input.data.accessToken, clinic.id);
  const verified = await verifyConnection(input.data);
  const owner = await prisma.whatsAppConnection.findUnique({
    where: { phoneNumberId: input.data.phoneNumberId },
    select: { clinicId: true },
  });
  if (owner && owner.clinicId !== clinic.id)
    throw new HttpError(409, 'This phone number is already linked to another clinic');
  const data = {
    wabaId: input.data.wabaId,
    phoneNumberId: input.data.phoneNumberId,
    displayNumber: verified.displayNumber,
    encryptedToken,
    status: 'CONNECTED',
    templateName: input.data.templateName,
    templateLanguage: input.data.templateLanguage,
    templateBody: verified.body,
    templateParameters: verified.parameterCount,
  };
  await prisma.whatsAppConnection.upsert({
    where: { clinicId: clinic.id },
    create: { clinicId: clinic.id, ...data },
    update: data,
  });
  console.log('WhatsApp connection verified and provisioned. No messages were sent.');
}
main()
  .catch((error: unknown) => {
    if (error instanceof HttpError) console.error(error.message);
    else if (error instanceof MetaSendError)
      console.error(
        `Meta verification failed (code ${error.code}). Check account access, token and API version.`,
      );
    else
      console.error(
        'Provisioning failed. Check encryption key, database migrations and unique phone-number ownership. Credentials were not printed.',
      );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
