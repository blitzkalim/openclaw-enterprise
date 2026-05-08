import { Hono } from 'hono';
import { createFile, findFileById, listFilesByUser, deleteFile } from '@openclaw/enterprise-shared/db/queries.js';
import { putObject, getObject, deleteObject } from '@openclaw/enterprise-shared/s3/client.js';
import type { TeamCtx } from '@openclaw/enterprise-shared/types/team-ctx.js';

const app = new Hono();

/**
 * POST /files
 * Multipart upload of a file. Stores to S3 and records metadata in DB.
 * Requires authMiddleware.
 */
app.post('/', async (c) => {
  const team = c.get('team') as TeamCtx | null;
  if (!team) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const contentType = c.req.header('content-type') ?? '';
  if (!contentType.startsWith('multipart/form-data')) {
    return c.json({ error: 'Expected multipart/form-data' }, 400);
  }

  const body = await c.req.parseBody();
  const file = body.file;
  if (!file || !(file instanceof File)) {
    return c.json({ error: 'Missing file field' }, 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const s3Key = `users/${team.userId}/${Date.now()}-${file.name}`;

  await putObject(s3Key, buffer, file.type || 'application/octet-stream');

  const stored = await createFile({
    userId: team.userId,
    name: file.name,
    s3Key,
    mimeType: file.type || 'application/octet-stream',
    size: buffer.length,
  });

  return c.json({ id: stored.id, name: stored.name, size: stored.size, createdAt: stored.createdAt }, 201);
});

/**
 * GET /files
 * Lists metadata for all files owned by the current user.
 * Requires authMiddleware.
 */
app.get('/', async (c) => {
  const team = c.get('team') as TeamCtx | null;
  if (!team) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const files = await listFilesByUser(team.userId);
  return c.json(files, 200);
});

/**
 * GET /files/:id
 * Downloads a file (streams from S3 through gateway).
 * Requires authMiddleware.
 */
app.get('/:id', async (c) => {
  const team = c.get('team') as TeamCtx | null;
  if (!team) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const id = c.req.param('id');
  const file = await findFileById(id, team.userId);
  if (!file) {
    return c.json({ error: 'Not found' }, 404);
  }

  const buffer = await getObject(file.s3Key);
  if (!buffer) {
    return c.json({ error: 'File data missing in storage' }, 404);
  }

  c.header('Content-Type', file.mimeType);
  c.header('Content-Disposition', `attachment; filename="${file.name}"`);
  return c.body(buffer);
});

/**
 * DELETE /files/:id
 * Deletes file metadata from DB and removes object from S3.
 * Requires authMiddleware.
 */
app.delete('/:id', async (c) => {
  const team = c.get('team') as TeamCtx | null;
  if (!team) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const id = c.req.param('id');
  const file = await findFileById(id, team.userId);
  if (!file) {
    return c.json({ error: 'Not found' }, 404);
  }

  await deleteObject(file.s3Key);
  await deleteFile(id, team.userId);

  return c.json({ ok: true }, 204);
});

export default app;
