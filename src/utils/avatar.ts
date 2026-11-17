export const DEFAULT_AVATAR_SRC = '/assets/aistudio/Plantea_avatar_under_1MB_9e00096d.jpg';

export const ALLOWED_AVATAR_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
] as const;

export const MAX_AVATAR_RAW_FILE_BYTES = 10 * 1024 * 1024; // 10 MB raw upload cap
export const MAX_AVATAR_DATA_URL_LENGTH = 600_000; // ~450 KB encoded image cap
export const AVATAR_OUTPUT_SIZE = 256;

const SAFE_AVATAR_DATA_URL_REGEX =
  /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/]+=*$/i;

export function isValidAvatarDataUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.length > MAX_AVATAR_DATA_URL_LENGTH) return false;
  return SAFE_AVATAR_DATA_URL_REGEX.test(trimmed);
}

export function normalizeAvatarDataUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return isValidAvatarDataUrl(trimmed) ? trimmed : '';
}

export function validateAvatarDataUrl(value: unknown): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    return 'Dữ liệu ảnh đại diện không hợp lệ.';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > MAX_AVATAR_DATA_URL_LENGTH) {
    return 'Ảnh đại diện sau khi nén vẫn quá lớn. Vui lòng chọn ảnh khác nhỏ hơn.';
  }
  if (!SAFE_AVATAR_DATA_URL_REGEX.test(trimmed)) {
    return 'Định dạng ảnh đại diện không hợp lệ (chỉ hỗ trợ PNG, JPG, WEBP, GIF).';
  }
  return null;
}

export function validateAvatarFileMeta(meta: { type: string; size: number }): string | null {
  const mime = (meta.type || '').trim().toLowerCase();
  if (!ALLOWED_AVATAR_MIME_TYPES.includes(mime as (typeof ALLOWED_AVATAR_MIME_TYPES)[number])) {
    return 'Vui lòng chọn tệp ảnh hợp lệ (PNG, JPG, WEBP hoặc GIF).';
  }
  if (!Number.isFinite(meta.size) || meta.size <= 0) {
    return 'Tệp ảnh trống hoặc không hợp lệ.';
  }
  if (meta.size > MAX_AVATAR_RAW_FILE_BYTES) {
    return 'Ảnh tải lên tối đa 10 MB. Vui lòng chọn ảnh nhẹ hơn.';
  }
  return null;
}

export interface AvatarCropRect {
  sx: number;
  sy: number;
  sSize: number;
  outSize: number;
}

export function computeAvatarCropDimensions(
  width: number,
  height: number,
  targetSize = AVATAR_OUTPUT_SIZE,
): AvatarCropRect {
  const safeW = Math.max(1, Math.round(width));
  const safeH = Math.max(1, Math.round(height));
  const sSize = Math.min(safeW, safeH);
  const sx = Math.floor((safeW - sSize) / 2);
  const sy = Math.floor((safeH - sSize) / 2);
  const outSize = Math.max(64, Math.min(targetSize, sSize));
  return { sx, sy, sSize, outSize };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Không thể đọc dữ liệu tệp ảnh.'));
      }
    };
    reader.onerror = () => reject(new Error('Không thể đọc tệp ảnh từ thiết bị.'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Không thể giải mã tệp ảnh này.'));
    img.src = src;
  });
}

export async function processAvatarImageFile(file: File): Promise<string> {
  const metaError = validateAvatarFileMeta({
    type: file.type,
    size: file.size,
  });
  if (metaError) {
    throw new Error(metaError);
  }

  const rawDataUrl = await readFileAsDataUrl(file);

  // Giữ nguyên GIF động nhỏ để không mất chuyển động nếu đã nằm trong giới hạn
  if (file.type.toLowerCase() === 'image/gif' && isValidAvatarDataUrl(rawDataUrl)) {
    return rawDataUrl;
  }

  const img = await loadImageElement(rawDataUrl);
  const { sx, sy, sSize, outSize } = computeAvatarCropDimensions(
    img.naturalWidth || img.width,
    img.naturalHeight || img.height,
    AVATAR_OUTPUT_SIZE,
  );

  const canvas = document.createElement('canvas');
  canvas.width = outSize;
  canvas.height = outSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    if (isValidAvatarDataUrl(rawDataUrl)) return rawDataUrl;
    throw new Error('Trình duyệt không hỗ trợ xử lý ảnh.');
  }

  ctx.clearRect(0, 0, outSize, outSize);
  ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, outSize, outSize);

  const preferPng = file.type.toLowerCase() === 'image/png';
  let candidate = canvas.toDataURL('image/webp', 0.88);
  if (!candidate.startsWith('data:image/webp')) {
    candidate = canvas.toDataURL(preferPng ? 'image/png' : 'image/jpeg', 0.88);
  }

  if (!isValidAvatarDataUrl(candidate)) {
    candidate = canvas.toDataURL('image/jpeg', 0.78);
  }

  const validationErr = validateAvatarDataUrl(candidate);
  if (validationErr) {
    throw new Error(validationErr);
  }

  return candidate;
}
