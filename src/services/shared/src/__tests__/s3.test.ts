import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getObject, putObject, deleteObject, listObjects } from '../s3/client.js';
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

const mockSend = vi.fn();

vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-s3')>();
  return {
    ...actual,
    S3Client: vi.fn().mockImplementation(function () {
      return { send: mockSend };
    }),
  };
});

describe('s3/client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENCLAW_S3_BUCKET = 'test-bucket';
    process.env.AWS_REGION = 'us-east-1';
    delete process.env.S3_ENDPOINT;
    // Reset singleton by clearing module cache is tricky; instead we mock S3Client constructor
    (S3Client as any).mockImplementation(function () {
      return { send: mockSend };
    });
  });

  it('getObject should return Buffer on success', async () => {
    const buffer = Buffer.from('hello');
    mockSend.mockResolvedValueOnce({
      Body: {
        transformToByteArray: async () => new Uint8Array(buffer),
      },
    });
    const result = await getObject('users/test/file.txt');
    expect(result).toEqual(buffer);
  });

  it('getObject should return null for NoSuchKey', async () => {
    const err = new Error('NoSuchKey');
    (err as any).name = 'NoSuchKey';
    mockSend.mockRejectedValueOnce(err);
    const result = await getObject('users/test/missing.txt');
    expect(result).toBeNull();
  });

  it('putObject should send PutObjectCommand', async () => {
    mockSend.mockResolvedValueOnce({});
    await putObject('users/test/file.txt', Buffer.from('data'), 'text/plain');
    expect(mockSend).toHaveBeenCalledWith(expect.any(PutObjectCommand));
  });

  it('deleteObject should send DeleteObjectCommand', async () => {
    mockSend.mockResolvedValueOnce({});
    await deleteObject('users/test/file.txt');
    expect(mockSend).toHaveBeenCalledWith(expect.any(DeleteObjectCommand));
  });

  it('listObjects should return keys', async () => {
    mockSend.mockResolvedValueOnce({
      Contents: [{ Key: 'a.txt' }, { Key: 'b.txt' }],
    });
    const keys = await listObjects('users/test/');
    expect(keys).toEqual(['a.txt', 'b.txt']);
  });
});
