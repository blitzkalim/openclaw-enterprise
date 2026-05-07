import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

let client: S3Client | null = null;

function getS3Client(): S3Client {
  if (client) return client;

  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.AWS_REGION ?? 'us-east-1';

  client = new S3Client({
    region,
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          },
        }
      : {}),
  });

  return client;
}

function getBucket(): string {
  const bucket = process.env.OPENCLAW_S3_BUCKET;
  if (!bucket) throw new Error('OPENCLAW_S3_BUCKET environment variable is not set');
  return bucket;
}

export async function getObject(key: string): Promise<Buffer | null> {
  try {
    const response = await getS3Client().send(
      new GetObjectCommand({ Bucket: getBucket(), Key: key }),
    );
    if (!response.Body) return null;
    return Buffer.from(await response.Body.transformToByteArray());
  } catch (err: any) {
    if (err.name === 'NoSuchKey' || err.Code === 'NoSuchKey') return null;
    throw err;
  }
}

export async function putObject(key: string, body: Buffer | string, contentType?: string): Promise<void> {
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: body,
      ContentType: contentType ?? 'application/octet-stream',
    }),
  );
}

export async function deleteObject(key: string): Promise<void> {
  await getS3Client().send(
    new DeleteObjectCommand({ Bucket: getBucket(), Key: key }),
  );
}

export async function listObjects(prefix: string): Promise<string[]> {
  const response = await getS3Client().send(
    new ListObjectsV2Command({ Bucket: getBucket(), Prefix: prefix }),
  );
  return (response.Contents ?? []).map((obj) => obj.Key!).filter(Boolean);
}
