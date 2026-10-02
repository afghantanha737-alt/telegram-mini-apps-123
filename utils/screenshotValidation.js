'use strict';

const SCREENSHOT_MIME_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);

function detectScreenshotMime(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

function isValidScreenshot(buffer, declaredMime) {
  return SCREENSHOT_MIME_TYPES.includes(declaredMime) && detectScreenshotMime(buffer) === declaredMime;
}

module.exports = { SCREENSHOT_MIME_TYPES, detectScreenshotMime, isValidScreenshot };
