import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  listAppointmentsQuerySchema,
} from '../src/modules/appointments/schema';

const booking = {
  patientId: 'patient-a',
  startTime: new Date(2026, 10, 8, 20, 0),
  endTime: new Date(2026, 10, 8, 20, 30),
  nonMandatory: true,
};

test('create and edit accept both checkbox states; partial edits leave it absent', () => {
  for (const nonMandatory of [true, false]) {
    assert.equal(
      createAppointmentSchema.parse({ ...booking, nonMandatory }).nonMandatory,
      nonMandatory,
    );
    assert.equal(updateAppointmentSchema.parse({ nonMandatory }).nonMandatory, nonMandatory);
  }
  assert.equal('nonMandatory' in updateAppointmentSchema.parse({ notes: 'Updated' }), false);
  assert.equal(updateAppointmentSchema.safeParse({ nonMandatory: 'true' }).success, false);
});

test('a no-time booking requires the skip option at creation', () => {
  const noTime = { ...booking, endTime: booking.startTime };
  assert.equal(createAppointmentSchema.safeParse(noTime).success, true);
  assert.equal(
    createAppointmentSchema.safeParse({ ...noTime, nonMandatory: false }).success,
    false,
  );
});

test('skip choice reaches storage, list/detail responses and subsequent edits', async (t) => {
  // The repository is mocked: this regression test never connects to a database.
  process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_ACCESS_SECRET ||= 'test-access';
  process.env.JWT_REFRESH_SECRET ||= 'test-refresh';
  process.env.JWT_ACTION_SECRET ||= 'test-action';
  const { appointmentRepository } = await import('../src/modules/appointments/repository');
  const { appointmentService } = await import('../src/modules/appointments/service');
  type Stored = NonNullable<Awaited<ReturnType<typeof appointmentRepository.findById>>>;
  let stored: Stored;
  t.mock.method(appointmentRepository, 'create', async (clinicId, data) => {
    stored = {
      id: 'appointment-a',
      code: 'TEST-A000001',
      clinicId,
      patientId: null,
      doctorId: null,
      status: 'CONFIRMED',
      bookingChannel: 'WEB',
      consultationType: null,
      sourceOfEnquiry: null,
      notes: null,
      contactName: null,
      contactPhone: null,
      contactEmail: null,
      contactGender: null,
      contactDob: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      nonMandatory: false,
      ...data,
    };
    return stored;
  });
  t.mock.method(appointmentRepository, 'findById', async () => stored);
  t.mock.method(appointmentRepository, 'findMany', async () => [
    { ...stored, patient: null, doctor: null, payments: [] },
  ]);
  t.mock.method(appointmentRepository, 'update', async (_clinicId, _id, patch) => {
    stored = { ...stored, ...patch };
    return { count: 1 };
  });

  // A timed, outside-hours booking is the case that previously lost the flag.
  const created = await appointmentService.create(
    'clinic-a',
    createAppointmentSchema.parse(booking),
  );
  assert.equal(created.nonMandatory, true);
  assert.equal((await appointmentService.list('clinic-a'))[0].nonMandatory, true);
  assert.equal((await appointmentService.get('clinic-a', created.id)).nonMandatory, true);

  await appointmentService.update(
    'clinic-a',
    created.id,
    updateAppointmentSchema.parse({ notes: 'Updated' }),
  );
  assert.equal((await appointmentService.get('clinic-a', created.id)).nonMandatory, true);
  for (const nonMandatory of [false, true]) {
    const updated = await appointmentService.update(
      'clinic-a',
      created.id,
      updateAppointmentSchema.parse({ nonMandatory }),
    );
    assert.equal(updated.nonMandatory, nonMandatory);
    assert.equal((await appointmentService.list('clinic-a'))[0].nonMandatory, nonMandatory);
  }
});

test('appointment create, edit and list filters accept only supported statuses', () => {
  for (const status of ['SCHEDULED', 'CONFIRMED', 'ONGOING', 'COMPLETED', 'CANCELLED']) {
    assert.equal(createAppointmentSchema.safeParse({ ...booking, status }).success, true);
    assert.equal(updateAppointmentSchema.safeParse({ status }).success, true);
    assert.equal(listAppointmentsQuerySchema.safeParse({ status }).success, true);
  }
  const status = 'NO_SHOW';
  assert.equal(createAppointmentSchema.safeParse({ ...booking, status }).success, false);
  assert.equal(updateAppointmentSchema.safeParse({ status }).success, false);
  assert.equal(listAppointmentsQuerySchema.safeParse({ status }).success, false);
  assert.equal(listAppointmentsQuerySchema.safeParse({ status: ['CANCELLED', status] }).success, false);
});
