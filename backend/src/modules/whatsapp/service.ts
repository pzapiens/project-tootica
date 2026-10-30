import { createHash } from 'node:crypto';
import { HttpError } from '../../common/utils/httpError';
import { decryptToken } from './crypto';
import type { Connection, MessageRecord, WhatsAppStore } from './ports';
import { MetaSendError, sendTemplate } from './provider';
import { normalizeRecipient, sendTemplateSchema, type SendTemplateInput } from './schema';

export function publicConnection(c: Connection | null) {
  return c
    ? {
        connected: c.status === 'CONNECTED',
        displayNumber: c.displayNumber,
        templateName: c.templateName,
        templateLanguage: c.templateLanguage,
        templateBody: c.templateBody,
        templateParameters: c.templateParameters,
      }
    : null;
}
export function publicMessage(m: MessageRecord) {
  return {
    id: m.id,
    requestKey: m.requestKey,
    status: m.status,
    metaMessageId: m.metaMessageId,
    errorCode: m.errorCode,
    createdAt: m.createdAt,
  };
}
export function createWhatsAppService(
  store: WhatsAppStore,
  transport: (
    connection: Connection,
    token: string,
    recipient: string,
    parameters: string[],
  ) => Promise<string> = sendTemplate,
  decrypt = decryptToken,
) {
  async function context(clinicId: string, appointmentId: string, branchId?: string) {
    if (!(await store.usageEnabled(clinicId)))
      throw new HttpError(
        403,
        'WhatsApp usage is disabled for this account. Contact your superadmin.',
      );
    const appointment = await store.appointment(clinicId, appointmentId, branchId);
    if (!appointment || (appointment.patient && appointment.patient.clinicId !== clinicId))
      throw new HttpError(404, 'Appointment not found');
    return appointment;
  }
  return {
    async bundle(clinicId: string, appointmentId: string, branchId?: string) {
      await context(clinicId, appointmentId, branchId);
      return {
        connection: publicConnection(await store.connection(clinicId)),
        messages: (await store.recent(clinicId, appointmentId)).map(publicMessage),
      };
    },
    async send(
      clinicId: string,
      appointmentId: string,
      userId: string,
      raw: SendTemplateInput,
      branchId?: string,
    ) {
      const input = sendTemplateSchema.parse(raw);
      if (!(await store.actorAllowed(userId, clinicId)))
        throw new HttpError(
          403,
          'An active account with completed onboarding and an active clinic is required',
        );
      const appointment = await context(clinicId, appointmentId, branchId);
      const connection = await store.connection(clinicId);
      if (!connection || connection.status !== 'CONNECTED')
        throw new HttpError(
          409,
          'WhatsApp is not configured for this clinic. Contact your clinic admin.',
        );
      if (input.parameters.length !== connection.templateParameters)
        throw new HttpError(400, 'Fill every configured template parameter');
      let recipient: string;
      try {
        recipient = normalizeRecipient(
          appointment.patient?.phone ?? appointment.contactPhone ?? '',
        );
      } catch {
        throw new HttpError(
          400,
          'Update the patient phone to an international number with country code before sending',
        );
      }
      let token: string;
      try {
        token = decrypt(connection.encryptedToken, clinicId);
      } catch {
        throw new HttpError(
          503,
          'WhatsApp credentials are unavailable. Contact your administrator.',
        );
      }
      const requestHash = createHash('sha256')
        .update(
          JSON.stringify({
            appointmentId,
            recipient,
            connectionId: connection.id,
            templateName: connection.templateName,
            templateLanguage: connection.templateLanguage,
            parameters: input.parameters,
          }),
        )
        .digest('hex');
      const reserved = await store.reserve({
        clinicId,
        appointmentId,
        sentByUserId: userId,
        connectionId: connection.id,
        requestKey: input.requestKey,
        requestHash,
        recipient,
        templateName: connection.templateName,
        templateLanguage: connection.templateLanguage,
        parameters: input.parameters,
        consentConfirmedAt: new Date(),
      });
      if (!reserved.created) {
        if (reserved.message.requestHash !== requestHash)
          throw new HttpError(409, 'This submission key was already used for a different message');
        return publicMessage(reserved.message);
      }
      let metaMessageId: string;
      try {
        metaMessageId = await transport(connection, token, recipient, input.parameters);
      } catch (error) {
        const uncertain = !(error instanceof MetaSendError) || error.uncertain;
        const code = error instanceof MetaSendError ? error.code : 'UNEXPECTED_TRANSPORT_ERROR';
        await store.finish(
          clinicId,
          reserved.message.id,
          uncertain ? 'UNKNOWN' : 'FAILED',
          undefined,
          code,
        );
        return publicMessage({
          ...reserved.message,
          status: uncertain ? 'UNKNOWN' : 'FAILED',
          errorCode: code,
        });
      }
      // If this update fails after Meta accepted the message, leave PENDING. Never resend automatically.
      await store.finish(clinicId, reserved.message.id, 'SUBMITTED', metaMessageId);
      return publicMessage({ ...reserved.message, status: 'SUBMITTED', metaMessageId });
    },
  };
}
