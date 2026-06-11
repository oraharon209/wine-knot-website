const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const logger = require('./logger');

const STORAGE = process.env.IMAGE_STORAGE || 'local';
const IMG_DIR = process.env.IMAGE_DIR || path.join(__dirname, '..', 'uploads', 'images', 'wines');
const S3_BUCKET = process.env.S3_BUCKET || '';
const S3_PREFIX = 'wines';
const PUBLIC_BASE = (process.env.S3_PUBLIC_BASE_URL || '').replace(/\/$/, '');

let s3Client;

function useS3() {
  return STORAGE === 's3' && S3_BUCKET;
}

function getS3() {
  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.AWS_REGION || process.env.S3_REGION || 'eu-north-1',
    });
  }
  return s3Client;
}

function publicUrl(filename) {
  if (useS3()) {
    return `${PUBLIC_BASE}/${S3_PREFIX}/${filename}`;
  }
  return `/images/wines/${filename}`;
}

function resolveImageUrl(url, imageVersion) {
  if (!url) return '';
  let resolved = url;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    if (useS3() && PUBLIC_BASE) {
      resolved = `${PUBLIC_BASE}/${S3_PREFIX}/${path.basename(url)}`;
    }
  }
  const version = Number(imageVersion);
  if (version > 0) {
    const sep = resolved.includes('?') ? '&' : '?';
    resolved += `${sep}v=${version}`;
  }
  return resolved;
}

async function saveImage(filename, buffer, mimetype) {
  const dest = useS3() ? `s3://${S3_BUCKET}/${S3_PREFIX}/${filename}` : path.join(IMG_DIR, filename);
  try {
    if (useS3()) {
      await getS3().send(new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: `${S3_PREFIX}/${filename}`,
        Body: buffer,
        ContentType: mimetype || 'image/jpeg',
        CacheControl: 'public, max-age=3600, must-revalidate',
      }));
      logger.info('image_save', { status: 'ok', storage: 's3', dest, size: buffer.length });
      return publicUrl(filename);
    }

    fs.mkdirSync(IMG_DIR, { recursive: true });
    fs.writeFileSync(path.join(IMG_DIR, filename), buffer);
    logger.info('image_save', { status: 'ok', storage: 'local', dest, size: buffer.length });
    return publicUrl(filename);
  } catch (err) {
    logger.error('image_save', { status: 'failed', dest, size: buffer.length, error: err.message });
    throw err;
  }
}

async function deleteImage(imageUrl) {
  if (!imageUrl) return;
  const filename = path.basename(imageUrl);
  if (!filename) return;

  if (useS3()) {
    await getS3().send(new DeleteObjectCommand({
      Bucket: S3_BUCKET,
      Key: `${S3_PREFIX}/${filename}`,
    }));
    return;
  }

  if (imageUrl.startsWith('/images/wines/')) {
    fs.unlink(path.join(IMG_DIR, filename), () => {});
  }
}

module.exports = {
  useS3,
  publicUrl,
  resolveImageUrl,
  saveImage,
  deleteImage,
};
