const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const MEDIA_ROOT = path.resolve(__dirname, '../../public/media');
const DEFAULTS_DIR = path.join(MEDIA_ROOT, 'defaults');
const PROFILES_DIR = path.join(MEDIA_ROOT, 'profiles');
const BANNERS_DIR = path.join(MEDIA_ROOT, 'banners');

const DEFAULT_PROFILE_PICTURE_PATH = '/media/defaults/default-profile.png';
const DEFAULT_BANNER_PATH = '/media/defaults/default-banner.jpeg';
const MAX_ACCOUNT_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;
const ACCOUNT_IMAGE_MIME_TYPES = Object.freeze({
  'image/jpeg': '.jpeg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif'
});

function getDefaultAccountImages() {
  return {
    profilePicture: DEFAULT_PROFILE_PICTURE_PATH,
    banner: DEFAULT_BANNER_PATH
  };
}

function getImageDirectory(kind) {
  return kind === 'banner' ? BANNERS_DIR : PROFILES_DIR;
}

function getImageFilenamePrefix(kind) {
  return kind === 'banner' ? 'banner' : 'profile';
}

async function ensureAccountImageDirectories() {
  await Promise.all([
    fs.mkdir(DEFAULTS_DIR, { recursive: true }),
    fs.mkdir(PROFILES_DIR, { recursive: true }),
    fs.mkdir(BANNERS_DIR, { recursive: true })
  ]);
}

function parseUploadedImage(upload, fieldName) {
  if (!upload) {
    return null;
  }

  if (typeof upload !== 'object') {
    throw new Error(`${fieldName} upload is invalid`);
  }

  const mimeType = String(upload.type || '').trim().toLowerCase();
  const extension = ACCOUNT_IMAGE_MIME_TYPES[mimeType];
  if (!extension) {
    throw new Error(`${fieldName} must be a PNG, JPEG, WebP, or GIF image`);
  }

  const dataUrl = String(upload.data || '').trim();
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) {
    throw new Error(`${fieldName} upload is invalid`);
  }

  if (match[1].toLowerCase() !== mimeType) {
    throw new Error(`${fieldName} upload type does not match the file data`);
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) {
    throw new Error(`${fieldName} upload is empty`);
  }

  if (buffer.length > MAX_ACCOUNT_IMAGE_SIZE_BYTES) {
    throw new Error(`${fieldName} must be 2 MB or smaller`);
  }

  return {
    buffer,
    extension
  };
}

async function saveUploadedAccountImage(upload, kind, fieldName) {
  const parsedUpload = parseUploadedImage(upload, fieldName);
  if (!parsedUpload) {
    return null;
  }

  await ensureAccountImageDirectories();
  const filename = `${getImageFilenamePrefix(kind)}-${Date.now()}-${crypto.randomUUID()}${parsedUpload.extension}`;
  const relativeDirectory = kind === 'banner' ? 'banners' : 'profiles';
  const absolutePath = path.join(getImageDirectory(kind), filename);
  await fs.writeFile(absolutePath, parsedUpload.buffer);
  return `/media/${relativeDirectory}/${filename}`;
}

module.exports = {
  DEFAULT_BANNER_PATH,
  DEFAULT_PROFILE_PICTURE_PATH,
  MAX_ACCOUNT_IMAGE_SIZE_BYTES,
  getDefaultAccountImages,
  saveUploadedAccountImage
};
