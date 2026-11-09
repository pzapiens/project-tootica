import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app';
import { prisma } from '../src/common/db/prisma';
import { signAccessToken } from '../src/modules/auth/jwt.util';
import type { Role } from '../src/generated/prisma/enums';
import { CONSULTATION_TYPES, LEGACY_CONSULTATION_TYPES, searchTreatments, TREATMENT_CATEGORIES, treatmentLabel } from '../../frontend/src/lib/treatments';

test('full catalogue preserves supplied entries, historical values, and comma-separated booking compatibility', () => {
  assert.equal(TREATMENT_CATEGORIES.length, 14);
  assert.equal(TREATMENT_CATEGORIES.reduce((n, c) => n + c.treatments.length, 0), 196);
  for (const category of TREATMENT_CATEGORIES) {
    const labels = category.treatments.map(t => t.label);
    assert.deepEqual(labels, [...labels].sort((a,b) => a.localeCompare(b)));
    for (const treatment of category.treatments) {
      assert(!treatment.value.includes(','), 'Values must round-trip through appointment storage');
      assert.equal(treatmentLabel(treatment.value), treatment.label);
    }
  }
  for (const legacy of LEGACY_CONSULTATION_TYPES) assert(CONSULTATION_TYPES.includes(legacy));
});

test('search understands abbreviations and aliases, ignores punctuation, and deduplicates cross-category entries', () => {
  assert(searchTreatments('RCT molar').some(t => t.value === 'ROOT CANAL TREATMENT - MOLAR'));
  assert(searchTreatments('cleaning').some(t => t.value === 'SCALING / PROPHYLAXIS'));
  assert(!searchTreatments('cleaning').some(t => t.value === 'SECOND OPINION'));
  assert(searchTreatments('x-ray').some(t => t.value === 'CBCT SCAN'));
  assert(searchTreatments('braces ceramic').some(t => t.value === 'FIXED ORTHODONTIC TREATMENT - CERAMIC BRACES'));
  assert.equal(searchTreatments('space maintainer').length, 1);
  assert.equal(searchTreatments('no-such-procedure-xyz').length, 0);
  assert.equal(searchTreatments('treatment to be decided').length, 1);
});

test('preferences routes enforce login, admin writes, clinic isolation, ordered persistence, and validation', async t => {
  const a='11111111-1111-4111-8111-111111111111', b='22222222-2222-4222-8222-222222222222';
  const clinics = new Map([[a, ['SCALING / PROPHYLAXIS']], [b, ['CBCT SCAN']]]);
  const originalFind = prisma.clinic.findUnique;
  const originalUpdate = prisma.clinic.update;
  prisma.clinic.findUnique = (async ({where}: {where: {id: string}}) =>
    clinics.has(where.id) ? {id: where.id, treatmentFavourites: [...clinics.get(where.id)!]} : null) as typeof originalFind;
  prisma.clinic.update = (async ({where, data}: {where: {id: string}; data: {treatmentFavourites: string[]}}) => {
    clinics.set(where.id, [...data.treatmentFavourites]);
    return {treatmentFavourites: [...data.treatmentFavourites]};
  }) as typeof originalUpdate;
  const server=createApp().listen(0, '127.0.0.1');
  t.after(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); prisma.clinic.findUnique = originalFind; prisma.clinic.update = originalUpdate; await prisma.$disconnect(); });
  await once(server, 'listening');
  const address=server.address();
  assert(address && typeof address !== 'string');
  const url='http://127.0.0.1:'+address.port+'/api/treatments/preferences';
  async function request(role: Role, clinicId: string | null, method='GET', favourites?: string[], target?: string) {
    const token=signAccessToken({sub: 'test-user', email:'test@example.com', role, clinicId, branchId:null});
    return fetch(url, {method, headers: {'Content-Type':'application/json', Cookie:'access_token='+token, ...(target ? {'X-Clinic-Id':target} : {})}, ...(favourites ? {body: JSON.stringify({favourites})} : {})});
  }
  assert.equal((await fetch(url)).status, 401);
  const staff=await request('RECEPTIONIST',a);assert.equal(staff.status,200);assert.equal((await staff.json()).canManage,false);
  assert.equal((await request('RECEPTIONIST',a,'PATCH',['CBCT SCAN'])).status,403);
  const ordered=['ROOT CANAL TREATMENT - MOLAR','SCALING / PROPHYLAXIS','CBCT SCAN','COMPOSITE FILLING - POSTERIOR','REVIEW CONSULTATION / FOLLOW-UP'];
  assert.equal((await request('CLIENT_ADMIN',a,'PATCH',ordered)).status,200);
  assert.deepEqual((await (await request('CLIENT_ADMIN',a)).json()).favourites,ordered);
  assert.deepEqual((await (await request('CLIENT_ADMIN',b)).json()).favourites,['CBCT SCAN']);
  assert.equal((await request('CLIENT_ADMIN',a,'PATCH',Array.from({length:6},(_,i)=>'Treatment '+i))).status,400);
  assert.equal((await request('CLIENT_ADMIN',a,'PATCH',['CBCT SCAN','CBCT SCAN'])).status,400);
  assert.equal((await request('CLIENT_ADMIN',a,'PATCH',[''])).status,400);
  assert.equal((await request('SUPER_ADMIN',null)).status,400);
  assert.equal((await request('SUPER_ADMIN',null,'PATCH',[],b)).status,200);
  assert.deepEqual((await (await request('CLIENT_ADMIN',b)).json()).favourites,[]);
});
