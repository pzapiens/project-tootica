import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { rmdir } from 'node:fs/promises';
import type { Server } from 'node:http';
import { test } from 'node:test';
import sharp from 'sharp';
import { createApp } from '../src/app';
import { prisma } from '../src/common/db/prisma';
import { avatarStorage } from '../src/common/storage/avatarStorage';
import * as files from '../src/common/storage/fileStorage';
import {
  createAvatarService,
  MAX_AVATAR_BYTES,
  normalizeAvatar,
} from '../src/modules/auth/avatar.service';
import { signAccessToken } from '../src/modules/auth/jwt.util';

async function image(format: 'png' | 'jpeg' | 'webp' = 'png') {
  return sharp({ create: { width: 600, height: 400, channels: 3, background: '#0077c0' } })
    .toFormat(format)
    .toBuffer();
}

test('normalizes JPG/PNG/WebP to 256px WebP, rejects forged images, SVG and oversized content', async () => {
  for (const format of ['png', 'jpeg', 'webp'] as const) {
    const output = await normalizeAvatar(await image(format));
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, 256);
    assert.equal(metadata.height, 256);
    assert.equal(metadata.exif, undefined);
  }
  await assert.rejects(
    () => normalizeAvatar(Buffer.from('not an image')),
    (e: { statusCode: number }) => e.statusCode === 400,
  );
  await assert.rejects(
    () =>
      normalizeAvatar(
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'),
      ),
    (e: { statusCode: number }) => e.statusCode === 415,
  );
  await assert.rejects(
    () => normalizeAvatar(Buffer.alloc(MAX_AVATAR_BYTES + 1)),
    (e: { statusCode: number }) => e.statusCode === 413,
  );
});

test('failed or concurrent database updates remove only the new file and preserve the current photo', async () => {
  const validImage = await image();
  for (const failure of ['database', 'conflict']) {
    const removed: string[] = [];
    const service = createAvatarService(
      {
        findById: async () => ({ id: 'user', status: 'ACTIVE', avatarKey: 'old.webp' }),
        replaceAvatar: async () => {
          if (failure === 'database') throw Error('database unavailable');
          return { count: 0 };
        },
      },
      {
        save: async () => 'new.webp',
        read: async () => Buffer.alloc(0),
        remove: async (key) => {
          removed.push(key);
        },
      },
    );
    await assert.rejects(
      () => service.upload('user', validImage),
      failure === 'database' ? /database unavailable/ : /photo changed/,
    );
    assert.deepEqual(removed, ['new.webp']);
  }
});

test(
  'authenticated photo API persists files and DB keys, isolates users, replaces and deletes photos',
  { skip: process.env.NODE_ENV === 'production' },
  async (t) => {
    const ids = [randomUUID(), randomUUID()];
    const servers: Server[] = [];
    // Only test-owned users and their avatar paths are touched; no seeds or data resets.
    t.after(async () => {
      for (const server of servers)
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      for (const id of ids) {
        const user = await prisma.user.findUnique({ where: { id }, select: { avatarKey: true } });
        if (user?.avatarKey) await avatarStorage.remove(user.avatarKey);
        await prisma.user.deleteMany({ where: { id } });
        // Non-recursive deletion removes only an empty test-user directory.
        await rmdir(files.resolvePath('avatars/' + id)).catch(() => {});
      }
      await prisma.$disconnect();
    });
    for (const id of ids)
      await prisma.user.create({
        data: {
          id,
          email: 'avatar-test-' + id + '@example.com',
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
        },
      });
    async function start() {
      const server = createApp().listen(0, '127.0.0.1');
      servers.push(server);
      await once(server, 'listening');
      const address = server.address();
      assert(address && typeof address !== 'string');
      return 'http://127.0.0.1:' + address.port;
    }
    const base = await start();
    const cookies = ids.map(
      (id) =>
        'access_token=' +
        signAccessToken({
          sub: id,
          email: 'test@example.com',
          role: 'SUPER_ADMIN',
          clinicId: null,
          branchId: null,
        }),
    );
    async function upload(
      bytes: Buffer,
      cookie = cookies[0],
      filename = 'photo.png',
      mime = 'image/png',
    ) {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(bytes)], { type: mime }), filename);
      return fetch(base + '/api/auth/avatar', {
        method: 'POST',
        headers: { Cookie: cookie },
        body: form,
      });
    }
    for (const method of ['GET', 'POST', 'DELETE'])
      assert.equal((await fetch(base + '/api/auth/avatar', { method })).status, 401);
    assert.equal(
      (await fetch(base + '/api/auth/avatar', { method: 'POST', headers: { Cookie: cookies[0] } }))
        .status,
      400,
    );
    assert.equal((await upload(Buffer.alloc(MAX_AVATAR_BYTES + 1))).status, 413);
    assert.equal((await upload(Buffer.from('fake PNG'))).status, 400);
    assert.equal(
      (await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>')))
        .status,
      415,
    );
    const response = await upload(await image());
    assert.equal(response.status, 200);
    const saved = await response.json();
    assert.match(saved.user.avatarUrl, /^\/api\/auth\/avatar\?v=/);
    const first = (await prisma.user.findUniqueOrThrow({ where: { id: ids[0] } })).avatarKey!;
    assert(first.startsWith('avatars/' + ids[0] + '/'));
    assert(files.exists(first));
    // A separate app instance and a fresh /me request use the persisted file, not browser state.
    const secondBase = await start();
    const me = await (
      await fetch(secondBase + '/api/auth/me', { headers: { Cookie: cookies[0] } })
    ).json();
    assert.equal(me.user.avatarUrl, saved.user.avatarUrl);
    const photo = await fetch(secondBase + me.user.avatarUrl, { headers: { Cookie: cookies[0] } });
    assert.equal(photo.status, 200);
    assert.equal(photo.headers.get('content-type'), 'image/webp');
    assert.match(photo.headers.get('cache-control')!, /private/);
    assert.equal((await sharp(Buffer.from(await photo.arrayBuffer())).metadata()).width, 256);
    assert.equal(
      (
        await fetch(secondBase + me.user.avatarUrl + '&userId=' + ids[0], {
          headers: { Cookie: cookies[1] },
        })
      ).status,
      404,
    );
    const replacement = await upload(await image('jpeg'));
    assert.equal(replacement.status, 200);
    const changed = await replacement.json();
    assert.notEqual(changed.user.avatarUrl, saved.user.avatarUrl);
    assert(!files.exists(first));
    const current = (await prisma.user.findUniqueOrThrow({ where: { id: ids[0] } })).avatarKey!;
    assert(files.exists(current));
    const deletion = await fetch(base + '/api/auth/avatar', {
      method: 'DELETE',
      headers: { Cookie: cookies[0] },
    });
    assert.equal(deletion.status, 200);
    assert.equal((await deletion.json()).user.avatarUrl, null);
    assert(!files.exists(current));
    assert.equal(
      (await fetch(base + '/api/auth/avatar', { headers: { Cookie: cookies[0] } })).status,
      404,
    );
    assert.equal(
      (
        await fetch(base + '/api/auth/avatar', {
          method: 'DELETE',
          headers: { Cookie: cookies[0] },
        })
      ).status,
      200,
    );
  },
);
