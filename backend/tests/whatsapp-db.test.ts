import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { Client } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { createWhatsAppRepository } from '../src/modules/whatsapp/repository';
import type { NewMessage } from '../src/modules/whatsapp/ports';

// Each run owns a newly generated schema. It never migrates or clears application tables.
test('migrations and repository enforce tenant/branch access, concurrent dedupe, rate limits and deletion behavior', async () => {
  const url = process.env.WHATSAPP_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  assert(url, 'Set WHATSAPP_TEST_DATABASE_URL or DATABASE_URL to a local development Postgres');
  const schema = 'whatsapp_test_' + randomUUID().replace(/-/g, '');
  assert.match(schema, /^whatsapp_test_[a-f0-9]{32}$/);
  const admin = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
  const db = new PrismaClient({
    adapter: new PrismaPg(
      { connectionString: url, options: `-c search_path=${schema}`, connectionTimeoutMillis: 5000 },
      { schema },
    ),
  });
  let created = false;
  try {
    await admin.connect();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    await admin.query(`SET search_path TO "${schema}"`);
    for (const migration of [
      '20261006000000_init',
      '20261025000000_whatsapp_outbound',
      '20261031000000_whatsapp_account_access',
    ]) {
      const sql = (
        await readFile(resolve('prisma/migrations', migration, 'migration.sql'), 'utf8')
      ).replace('CREATE SCHEMA IF NOT EXISTS "public";', '');
      await admin.query(sql);
    }
    const a = await db.clinic.create({ data: { name: 'Test A', whatsAppEnabled: true } });
    const b = await db.clinic.create({ data: { name: 'Test B' } });
    const branch = await db.branch.create({
      data: { clinicId: a.id, code: 'TEST-B1', name: 'One' },
    });
    const otherBranch = await db.branch.create({
      data: { clinicId: a.id, code: 'TEST-B2', name: 'Two' },
    });
    const user = await db.user.create({
      data: {
        clinicId: a.id,
        branchId: branch.id,
        email: 'test@example.test',
        role: 'DOCTOR',
        mustResetPassword: false,
      },
    });
    const doctor = await db.doctor.create({
      data: { clinicId: a.id, userId: user.id, branchId: branch.id },
    });
    const appointment = await db.appointment.create({
      data: {
        clinicId: a.id,
        doctorId: doctor.id,
        startTime: new Date(),
        endTime: new Date(),
        contactPhone: '+919999999999',
      },
    });
    const connection = await db.whatsAppConnection.create({
      data: {
        clinicId: a.id,
        wabaId: '123',
        phoneNumberId: '456',
        displayNumber: '+919999999999',
        encryptedToken: 'encrypted',
        templateName: 'hello_world',
        templateLanguage: 'en_US',
        templateBody: 'Hello',
        templateParameters: 0,
      },
    });
    const repo = createWhatsAppRepository(db);
    assert.equal(await repo.usageEnabled(a.id), true);
    assert.equal(await repo.usageEnabled(b.id), false);
    await db.clinic.update({ where: { id: a.id }, data: { whatsAppEnabled: false } });
    assert.equal(await repo.usageEnabled(a.id), false);
    await db.clinic.update({ where: { id: a.id }, data: { whatsAppEnabled: true } });
    assert.equal(await repo.appointment(b.id, appointment.id), null);
    assert.equal(await repo.appointment(a.id, appointment.id, otherBranch.id), null);
    assert.equal((await repo.appointment(a.id, appointment.id, branch.id))?.id, appointment.id);
    assert.equal(await repo.actorAllowed(user.id, a.id), true);
    assert.equal(await repo.actorAllowed(user.id, b.id), false);
    await db.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });
    assert.equal(await repo.actorAllowed(user.id, a.id), false);
    await db.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } });
    await assert.rejects(
      db.whatsAppConnection.create({
        data: {
          clinicId: b.id,
          wabaId: '789',
          phoneNumberId: connection.phoneNumberId,
          displayNumber: 'duplicate',
          encryptedToken: 'encrypted',
          templateName: 'hello_world',
          templateLanguage: 'en_US',
          templateBody: 'Hello',
          templateParameters: 0,
        },
      }),
    );
    const input: NewMessage = {
      clinicId: a.id,
      appointmentId: appointment.id,
      sentByUserId: user.id,
      connectionId: connection.id,
      requestKey: randomUUID(),
      requestHash: 'hash',
      recipient: '919999999999',
      templateName: 'hello_world',
      templateLanguage: 'en_US',
      parameters: [],
      consentConfirmedAt: new Date(),
    };
    const attempts = await Promise.all(Array.from({ length: 5 }, () => repo.reserve(input)));
    assert.equal(attempts.filter((r) => r.created).length, 1);
    assert.equal(await db.whatsAppMessage.count(), 1);
    await repo.finish(b.id, attempts[0].message.id, 'SUBMITTED', 'wrong-tenant');
    assert.equal((await repo.recent(a.id, appointment.id))[0].status, 'PENDING');
    await repo.finish(a.id, attempts[0].message.id, 'SUBMITTED', 'wamid.test');
    assert.equal((await repo.recent(a.id, appointment.id))[0].status, 'SUBMITTED');
    for (let i = 0; i < 9; i++) await repo.reserve({ ...input, requestKey: randomUUID() });
    await assert.rejects(repo.reserve({ ...input, requestKey: randomUUID() }), /limit reached/);
    assert.equal((await repo.reserve(input)).created, false); // Retries remain readable even at rate limit.
    await db.appointment.delete({ where: { id: appointment.id } });
    assert.equal(await db.whatsAppMessage.count({ where: { appointmentId: null } }), 10);
    console.log('Isolated Postgres checks passed; application schema was not modified.');
  } finally {
    await db.$disconnect();
    if (created) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
});
