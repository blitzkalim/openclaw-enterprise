export interface AttachmentRef {
  s3Key: string;
  mimeType: string;
  originalName?: string;
}

/**
 * Download attachment from WhatsApp Meta Cloud API and upload to S3.
 */
export async function downloadWhatsAppAttachment(
  userId: string,
  mediaId: string,
  mimeType: string,
  accessToken: string
): Promise<AttachmentRef | null> {
  try {
    // Step 1: Get download URL from Meta API
    const urlResponse = await fetch(
      `https://graph.facebook.com/v18.0/${mediaId}?access_token=${accessToken}`
    );
    if (!urlResponse.ok) {
      console.error('[attachment] Failed to get download URL from Meta API');
      return null;
    }
    const urlData = await urlResponse.json();
    const downloadUrl = urlData.url;

    // Step 2: Download file
    const fileResponse = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!fileResponse.ok) {
      console.error('[attachment] Failed to download file from Meta CDN');
      return null;
    }

    // Check file size limit (50MB)
    const contentLength = fileResponse.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 50 * 1024 * 1024) {
      console.error('[attachment] File too large (>50MB)');
      return null;
    }

    const buffer = await fileResponse.arrayBuffer();

    // Step 3: Compute S3 key
    const ext = mimeType.split('/')[1] || 'bin';
    const s3Key = `users/user_${userId}/uploads/${Date.now()}_${mediaId}.${ext}`;

    // Step 4: Upload to S3 (using shared helpers)
    const { putObject } = await import('@openclaw/enterprise-shared/s3/helpers.js');
    await putObject(s3Key, Buffer.from(buffer).toString('binary'), mimeType);

    return { s3Key, mimeType };
  } catch (err) {
    console.error('[attachment] Error downloading WhatsApp attachment:', err);
    return null;
  }
}

/**
 * Download attachment from Telegram Bot API and upload to S3.
 */
export async function downloadTelegramAttachment(
  userId: string,
  fileId: string,
  mimeType: string,
  botToken: string
): Promise<AttachmentRef | null> {
  try {
    // Step 1: Get file path from Telegram API
    const pathResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`
    );
    if (!pathResponse.ok) {
      console.error('[attachment] Failed to get file path from Telegram API');
      return null;
    }
    const pathData = await pathResponse.json();
    const filePath = pathData.result?.file_path;
    if (!filePath) {
      console.error('[attachment] No file_path in Telegram response');
      return null;
    }

    // Step 2: Download file
    const fileResponse = await fetch(
      `https://api.telegram.org/file/bot${botToken}/${filePath}`
    );
    if (!fileResponse.ok) {
      console.error('[attachment] Failed to download file from Telegram CDN');
      return null;
    }

    // Check file size limit (50MB)
    const contentLength = fileResponse.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 50 * 1024 * 1024) {
      console.error('[attachment] File too large (>50MB)');
      return null;
    }

    const buffer = await fileResponse.arrayBuffer();

    // Step 3: Compute S3 key
    const s3Key = `users/user_${userId}/uploads/${Date.now()}_${fileId}.bin`;

    // Step 4: Upload to S3
    const { putObject } = await import('@openclaw/enterprise-shared/s3/helpers.js');
    await putObject(s3Key, Buffer.from(buffer).toString('binary'), mimeType);

    return { s3Key, mimeType };
  } catch (err) {
    console.error('[attachment] Error downloading Telegram attachment:', err);
    return null;
  }
}
