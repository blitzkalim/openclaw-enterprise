import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client, getBucket } from './client.js';

/**
 * Get object content as UTF-8 string.
 */
export async function getObject(key: string): Promise<string> {
  const response = await getS3Client().send(
    new GetObjectCommand({ Bucket: getBucket(), Key: key }),
  );
  if (!response.Body) throw new Error('No body in response');
  return await response.Body.transformToString('utf-8');
}

/**
 * Put object with content.
 */
export async function putObject(key: string, content: string, contentType = 'text/plain'): Promise<void> {
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: content,
      ContentType: contentType,
    }),
  );
}

/**
 * Check if object exists.
 */
export async function headObject(key: string): Promise<boolean> {
  try {
    await getS3Client().send(
      new HeadObjectCommand({ Bucket: getBucket(), Key: key }),
    );
    return true;
  } catch (err: any) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw err;
  }
}

/**
 * Copy object within the same bucket.
 */
export async function copyObject(srcKey: string, dstKey: string): Promise<void> {
  await getS3Client().send(
    new CopyObjectCommand({
      Bucket: getBucket(),
      CopySource: `${getBucket()}/${srcKey}`,
      Key: dstKey,
    }),
  );
}
