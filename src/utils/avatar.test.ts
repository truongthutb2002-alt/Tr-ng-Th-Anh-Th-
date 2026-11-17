import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AVATAR_OUTPUT_SIZE,
  computeAvatarCropDimensions,
  isValidAvatarDataUrl,
  MAX_AVATAR_DATA_URL_LENGTH,
  MAX_AVATAR_RAW_FILE_BYTES,
  normalizeAvatarDataUrl,
  validateAvatarDataUrl,
  validateAvatarFileMeta,
} from './avatar';

test('validateAvatarFileMeta accepts valid image MIME types and rejects unsupported or oversized files', () => {
  assert.equal(validateAvatarFileMeta({ type: 'image/png', size: 1024 }), null);
  assert.equal(validateAvatarFileMeta({ type: 'image/jpeg', size: 2048 }), null);
  assert.equal(validateAvatarFileMeta({ type: 'image/webp', size: 500_000 }), null);
  assert.equal(validateAvatarFileMeta({ type: 'image/gif', size: 250_000 }), null);

  assert.ok(validateAvatarFileMeta({ type: 'image/svg+xml', size: 1024 }));
  assert.ok(validateAvatarFileMeta({ type: 'application/pdf', size: 1024 }));
  assert.ok(validateAvatarFileMeta({ type: 'image/png', size: 0 }));
  assert.ok(
    validateAvatarFileMeta({
      type: 'image/png',
      size: MAX_AVATAR_RAW_FILE_BYTES + 1,
    }),
  );
});

test('validateAvatarDataUrl and normalizeAvatarDataUrl enforce safe base64 image URLs and size limits', () => {
  const samplePng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

  assert.equal(isValidAvatarDataUrl(samplePng), true);
  assert.equal(validateAvatarDataUrl(samplePng), null);
  assert.equal(normalizeAvatarDataUrl(samplePng), samplePng);

  // Empty / null resets cleanly
  assert.equal(validateAvatarDataUrl(''), null);
  assert.equal(validateAvatarDataUrl(null), null);
  assert.equal(normalizeAvatarDataUrl(''), '');

  // Reject unsafe or non-data URLs
  assert.equal(isValidAvatarDataUrl('data:image/svg+xml;base64,PHN2Zz4='), false);
  assert.ok(validateAvatarDataUrl('data:image/svg+xml;base64,PHN2Zz4='));
  assert.ok(validateAvatarDataUrl('javascript:alert(1)'));
  assert.ok(validateAvatarDataUrl('https://example.com/avatar.png'));
  assert.equal(normalizeAvatarDataUrl('javascript:alert(1)'), '');

  // Reject oversized data URL
  const oversized = `data:image/jpeg;base64,${'A'.repeat(MAX_AVATAR_DATA_URL_LENGTH + 10)}`;
  assert.equal(isValidAvatarDataUrl(oversized), false);
  assert.ok(validateAvatarDataUrl(oversized));
});

test('computeAvatarCropDimensions center-crops landscape, portrait, and small images accurately', () => {
  const landscape = computeAvatarCropDimensions(1200, 800, AVATAR_OUTPUT_SIZE);
  assert.deepEqual(landscape, {
    sx: 200,
    sy: 0,
    sSize: 800,
    outSize: 256,
  });

  const portrait = computeAvatarCropDimensions(600, 1000, AVATAR_OUTPUT_SIZE);
  assert.deepEqual(portrait, {
    sx: 0,
    sy: 200,
    sSize: 600,
    outSize: 256,
  });

  const smallSquare = computeAvatarCropDimensions(128, 128, AVATAR_OUTPUT_SIZE);
  assert.deepEqual(smallSquare, {
    sx: 0,
    sy: 0,
    sSize: 128,
    outSize: 128,
  });
});
