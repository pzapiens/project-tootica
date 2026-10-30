import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { encryptToken, decryptToken } from '../src/modules/whatsapp/crypto';
import {
  graphRequest,
  MetaSendError,
  sendTemplate,
  templateDetails,
  verifyConnection,
} from '../src/modules/whatsapp/provider';
import type { ApprovedTemplate } from '../src/modules/whatsapp/provider';
import type {
  AppointmentContact,
  Connection,
  MessageRecord,
  WhatsAppStore,
} from '../src/modules/whatsapp/ports';
import { normalizeRecipient, sendTemplateSchema } from '../src/modules/whatsapp/schema';
import { createWhatsAppService, publicConnection } from '../src/modules/whatsapp/service';

const template: ApprovedTemplate = {
  name: 'appointment_update',
  language: 'en_US',
  status: 'APPROVED',
  components: [{ type: 'BODY', text: 'Hi {{1}}, your request is with {{2}}.' }],
};
function fixture() {
  let connection: Connection | null = {
    id: 'connection-a',
    clinicId: 'clinic-a',
    wabaId: '123',
    phoneNumberId: '456',
    displayNumber: '+91 9999999999',
    encryptedToken: 'encrypted-secret',
    status: 'CONNECTED',
    templateName: 'appointment_update',
    templateLanguage: 'en_US',
    templateBody: template.components[0].text!,
    templateParameters: 2,
  };
  let appointment: AppointmentContact | null = {
    id: 'appointment-a',
    patient: { phone: '+91 99999 99999', clinicId: 'clinic-a' },
    contactPhone: null,
  };
  let allowed = true;
  let calls = 0;
  let failure: Error | null = null;
  const messages = new Map<string, MessageRecord>();
  const store: WhatsAppStore = {
    usageEnabled: async () => true,
    connection: async (clinicId) => (clinicId === 'clinic-a' ? connection : null),
    appointment: async (clinicId, id, branchId) =>
      clinicId === 'clinic-a' && id === 'appointment-a' && branchId !== 'other-branch'
        ? appointment
        : null,
    actorAllowed: async () => allowed,
    recent: async () => [...messages.values()],
    reserve: async (data) => {
      const existing = messages.get(data.requestKey);
      if (existing) return { created: false, message: existing };
      const message: MessageRecord = {
        id: randomUUID(),
        requestKey: data.requestKey,
        requestHash: data.requestHash,
        appointmentId: data.appointmentId,
        status: 'PENDING',
        metaMessageId: null,
        errorCode: null,
        createdAt: new Date(),
      };
      messages.set(data.requestKey, message);
      return { created: true, message };
    },
    finish: async (_clinicId, id, status, metaMessageId, errorCode) => {
      const message = [...messages.values()].find((m) => m.id === id)!;
      Object.assign(message, {
        status,
        metaMessageId: metaMessageId ?? null,
        errorCode: errorCode ?? null,
      });
    },
  };
  const transport = async (
    c: Connection,
    token: string,
    recipient: string,
    parameters: string[],
  ) => {
    calls++;
    assert.equal(c.clinicId, 'clinic-a');
    assert.equal(token, 'decrypted');
    assert.equal(recipient, '919999999999');
    assert.deepEqual(parameters, ['Jane', 'Clinic A']);
    if (failure) throw failure;
    return 'wamid.test';
  };
  const service = createWhatsAppService(store, transport, () => 'decrypted');
  const input = {
    requestKey: randomUUID(),
    parameters: ['Jane', 'Clinic A'],
    consentConfirmed: true as const,
  };
  return {
    service,
    input,
    store,
    messages,
    get calls() {
      return calls;
    },
    setConnection(c: Connection | null) {
      connection = c;
    },
    get connection() {
      return connection;
    },
    setAppointment(a: AppointmentContact | null) {
      appointment = a;
    },
    setAllowed(v: boolean) {
      allowed = v;
    },
    fail(e: Error) {
      failure = e;
    },
  };
}

test('tokens are encrypted with clinic-bound authentication; tampering and wrong keys fail', () => {
  process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  const encrypted = encryptToken('private-token', 'clinic-a');
  assert(!encrypted.includes('private-token'));
  assert.equal(decryptToken(encrypted, 'clinic-a'), 'private-token');
  assert.throws(() => decryptToken(encrypted, 'clinic-b'));
  const parts = encrypted.split('.');
  parts[3] = Buffer.from('tampered').toString('base64');
  assert.throws(() => decryptToken(parts.join('.'), 'clinic-a'));
  process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  assert.throws(() => decryptToken(encrypted, 'clinic-a'));
});
test('template validation rejects media, named, unapproved and nonconsecutive parameters', () => {
  assert.deepEqual(templateDetails(template), {
    body: template.components[0].text,
    parameterCount: 2,
  });
  assert.throws(() => templateDetails({ ...template, status: 'PENDING' }));
  assert.throws(() => templateDetails({ ...template, parameter_format: 'NAMED' }));
  assert.throws(() =>
    templateDetails({ ...template, components: [{ type: 'BODY', text: 'Hi {{2}}' }] }),
  );
  assert.throws(() =>
    templateDetails({
      ...template,
      components: [...template.components, { type: 'HEADER', format: 'IMAGE' }],
    }),
  );
  assert.throws(() =>
    templateDetails({ ...template, components: [...template.components, { type: 'BUTTONS' }] }),
  );
});
test('recipient and body validation reject invalid phones, missing consent and arbitrary recipients', () => {
  assert.equal(normalizeRecipient('+91 (99999) 99999'), '919999999999');
  assert.throws(() => normalizeRecipient('not-a-phone'));
  assert.throws(() =>
    sendTemplateSchema.parse({ requestKey: randomUUID(), parameters: [], consentConfirmed: false }),
  );
  assert.throws(() =>
    sendTemplateSchema.parse({
      requestKey: randomUUID(),
      parameters: [],
      consentConfirmed: true,
      to: 'arbitrary',
    }),
  );
});
test('tenant and branch boundaries reject before calling Meta; no credentials returned', async () => {
  const f = fixture();
  await assert.rejects(
    f.service.send('clinic-b', 'appointment-a', 'staff', f.input),
    /Appointment not found/,
  );
  await assert.rejects(
    f.service.send('clinic-a', 'appointment-a', 'staff', f.input, 'other-branch'),
    /Appointment not found/,
  );
  f.setAppointment({
    id: 'appointment-a',
    contactPhone: null,
    patient: { phone: '+919999999999', clinicId: 'clinic-b' },
  });
  await assert.rejects(
    f.service.send('clinic-a', 'appointment-a', 'staff', f.input),
    /Appointment not found/,
  );
  assert.equal(f.calls, 0);
  assert(!JSON.stringify(publicConnection(f.connection)).includes('encrypted-secret'));
});
test('inactive actor, missing connection and unavailable encryption block sending', async () => {
  const f = fixture();
  f.setAllowed(false);
  await assert.rejects(
    f.service.send('clinic-a', 'appointment-a', 'staff', f.input),
    /active account/,
  );
  f.setAllowed(true);
  f.setConnection(null);
  await assert.rejects(
    f.service.send('clinic-a', 'appointment-a', 'staff', f.input),
    /not configured/,
  );
  const g = fixture();
  const service = createWhatsAppService(g.store, undefined, () => {
    throw new Error('secret-error');
  });
  await assert.rejects(
    service.send('clinic-a', 'appointment-a', 'staff', g.input),
    /credentials are unavailable/,
  );
  assert.equal(f.calls, 0);
});
test('duplicate and concurrent submissions only call Meta once; changed key payload conflicts', async () => {
  const f = fixture();
  await Promise.all([
    f.service.send('clinic-a', 'appointment-a', 'staff', f.input),
    f.service.send('clinic-a', 'appointment-a', 'staff', f.input),
  ]);
  const result = await f.service.send('clinic-a', 'appointment-a', 'staff', f.input);
  assert.equal(result.status, 'SUBMITTED');
  assert.equal(result.metaMessageId, 'wamid.test');
  assert.equal(f.calls, 1);
  await assert.rejects(
    f.service.send('clinic-a', 'appointment-a', 'staff', {
      ...f.input,
      parameters: ['Different', 'Clinic A'],
    }),
    /different message/,
  );
  assert.equal(f.calls, 1);
});
test('network uncertainty is recorded and never automatically resent', async () => {
  const f = fixture();
  f.fail(new MetaSendError('NETWORK_OR_TIMEOUT', true));
  const result = await f.service.send('clinic-a', 'appointment-a', 'staff', f.input);
  assert.equal(result.status, 'UNKNOWN');
  await f.service.send('clinic-a', 'appointment-a', 'staff', f.input);
  assert.equal(f.calls, 1);
});
test('definite Meta rejection records a sanitized code without marking submitted', async () => {
  const f = fixture();
  f.fail(new MetaSendError('190', false));
  const result = await f.service.send('clinic-a', 'appointment-a', 'staff', f.input);
  assert.equal(result.status, 'FAILED');
  assert.equal(result.errorCode, '190');
  assert.equal(result.metaMessageId, null);
});
test('parameter mismatch prevents reservation and sending', async () => {
  const f = fixture();
  await assert.rejects(
    f.service.send('clinic-a', 'appointment-a', 'staff', { ...f.input, parameters: [] }),
    /every configured/,
  );
  assert.equal(f.messages.size, 0);
  assert.equal(f.calls, 0);
});
test('Graph errors do not expose provider error text and timeout is uncertain', async () => {
  const rejected = (async () =>
    new Response(JSON.stringify({ error: { code: 190, message: 'secret-token-and-phone' } }), {
      status: 401,
    })) as typeof fetch;
  await assert.rejects(
    graphRequest('123/messages', 'secret-token', {}, rejected),
    (e: unknown) =>
      e instanceof MetaSendError &&
      e.code === '190' &&
      !e.uncertain &&
      !e.message.includes('secret-token'),
  );
  const network = (async () => {
    throw new Error('secret-token');
  }) as typeof fetch;
  await assert.rejects(
    graphRequest('123/messages', 'secret-token', {}, network),
    (e: unknown) => e instanceof MetaSendError && e.uncertain,
  );
});
test('real provider adapter verifies membership and approved template, then builds a template send', async () => {
  const original = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/phone_numbers'))
      return new Response(
        JSON.stringify({ data: [{ id: '456', display_phone_number: '+919999999999' }] }),
      );
    if (String(url).includes('/message_templates'))
      return new Response(JSON.stringify({ data: [template] }));
    return new Response(JSON.stringify({ messages: [{ id: 'wamid.adapter' }] }));
  }) as typeof fetch;
  try {
    const verified = await verifyConnection({
      wabaId: '123',
      phoneNumberId: '456',
      accessToken: 'token',
      templateName: template.name,
      templateLanguage: template.language,
    });
    assert.equal(verified.parameterCount, 2);
    await assert.rejects(
      verifyConnection({
        wabaId: '123',
        phoneNumberId: '999',
        accessToken: 'token',
        templateName: template.name,
        templateLanguage: template.language,
      }),
      /not accessible/,
    );
    assert.equal(
      await sendTemplate(
        { phoneNumberId: '456', templateName: template.name, templateLanguage: template.language },
        'token',
        '919999999999',
        ['Jane', 'Clinic A'],
      ),
      'wamid.adapter',
    );
    const sent = JSON.parse(calls.at(-1)!.init!.body as string);
    assert.equal(sent.to, '919999999999');
    assert.equal(sent.type, 'template');
    assert.deepEqual(sent.template.components[0].parameters, [
      { type: 'text', text: 'Jane' },
      { type: 'text', text: 'Clinic A' },
    ]);
  } finally {
    globalThis.fetch = original;
  }
});

test('disabled account blocks reads and sends without contacting Meta or reserving a message', async () => {
  const f = fixture();
  f.store.usageEnabled = async () => false;
  await assert.rejects(f.service.bundle('clinic-a', 'appointment-a'), /WhatsApp usage is disabled/);
  await assert.rejects(
    f.service.send('clinic-a', 'appointment-a', 'user-a', f.input),
    /WhatsApp usage is disabled/,
  );
  assert.equal(f.calls, 0);
  assert.equal(f.messages.size, 0);
  f.store.usageEnabled = async () => true;
  await f.service.send('clinic-a', 'appointment-a', 'user-a', f.input);
  assert.equal(f.calls, 1);
});
