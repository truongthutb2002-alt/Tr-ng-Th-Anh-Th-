import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { AppearanceSettings, DriveSyncMetadata, ThemeMode } from '../types/planner';
import {
  DEFAULT_APP_BACKGROUND_COLOR,
  normalizeHexColor,
  PASTEL_60_COLORS,
} from '../utils/schedule';
import { DEFAULT_AVATAR_SRC, processAvatarImageFile } from '../utils/avatar';
import { validateEmailInput } from '../utils/snapshotSync';
import { GoogleSignInButton } from './GoogleSignInButton';
import {
  Camera,
  Check,
  Cloud,
  CloudUpload,
  DownloadCloud,
  FolderOpen,
  LogOut,
  Mail,
  Moon,
  Palette,
  Pencil,
  Phone,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sun,
  Upload,
  User,
  UserCheck,
  X,
} from 'lucide-react';

interface AccountAppearanceModalProps {
  isOpen: boolean;
  currentAccount: string;
  currentPhone?: string;
  linkedEmail?: string;
  avatarDataUrl?: string;
  saveStatus: 'saved' | 'saving' | 'error';
  lastSavedAt: string;
  appearance: AppearanceSettings;
  hasDriveToken: boolean;
  driveSyncMeta: DriveSyncMetadata | null;
  isDriveBusy: boolean;
  driveStatusMessage?: string;
  driveError?: string;
  onAuthorizeDrive: (emailHint?: string) => Promise<void>;
  onRequestSaveToDrive: () => Promise<void>;
  onRequestLoadFromDrive: () => Promise<void>;
  onUpdateLinkedEmail?: (email: string) => void;
  onUpdateProfile?: (params: {
    newUsername: string;
    newPhone: string;
    newEmail: string;
  }) => Promise<void>;
  onUpdateAppearance: (next: AppearanceSettings) => void;
  onUpdateAvatar: (nextAvatarDataUrl: string) => Promise<void>;
  onLogout: () => void;
  onClose: () => void;
}

function formatSavedTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function AccountAppearanceModal({
  isOpen,
  currentAccount,
  currentPhone,
  linkedEmail = '',
  avatarDataUrl = '',
  saveStatus,
  lastSavedAt,
  appearance,
  hasDriveToken,
  driveSyncMeta,
  isDriveBusy,
  driveStatusMessage = '',
  driveError = '',
  onAuthorizeDrive,
  onRequestSaveToDrive,
  onRequestLoadFromDrive,
  onUpdateLinkedEmail,
  onUpdateProfile,
  onUpdateAppearance,
  onUpdateAvatar,
  onLogout,
  onClose,
}: AccountAppearanceModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUpdatingAvatar, setIsUpdatingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [avatarImgError, setAvatarImgError] = useState(false);
  const [driveEmailInput, setDriveEmailInput] = useState(linkedEmail);
  const [localDriveEmailError, setLocalDriveEmailError] = useState('');

  // Account profile editing state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileUsername, setProfileUsername] = useState(currentAccount);
  const [profilePhone, setProfilePhone] = useState(currentPhone || '');
  const [profileEmail, setProfileEmail] = useState(linkedEmail || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSavedNotice, setProfileSavedNotice] = useState('');

  const hasCustomAvatar = Boolean(avatarDataUrl);
  const resolvedAvatarSrc = avatarDataUrl || DEFAULT_AVATAR_SRC;

  useEffect(() => {
    setAvatarImgError(false);
  }, [resolvedAvatarSrc]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (isOpen) {
      const resolvedEmail = linkedEmail || driveSyncMeta?.linkedEmail || '';
      setDriveEmailInput(resolvedEmail);
      setProfileUsername(currentAccount);
      setProfilePhone(currentPhone || '');
      setProfileEmail(resolvedEmail);
    }
  }, [isOpen, currentAccount, currentPhone, linkedEmail, driveSyncMeta?.linkedEmail]);

  useEffect(() => {
    if (!isOpen) {
      setAvatarError('');
      setLocalDriveEmailError('');
      setIsEditingProfile(false);
      setProfileError('');
      setProfileSavedNotice('');
      return;
    }
    setLocalDriveEmailError('');
    setIsEditingProfile(false);
    setProfileError('');
    setProfileSavedNotice('');

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const savedTimeText = formatSavedTime(lastSavedAt);
  const currentBgHex =
    normalizeHexColor(appearance.backgroundColor) || DEFAULT_APP_BACKGROUND_COLOR;
  const matchedTone = PASTEL_60_COLORS.find((t) => t.hex === currentBgHex);

  const handleModeChange = (themeMode: ThemeMode) => {
    onUpdateAppearance({
      ...appearance,
      themeMode,
    });
  };

  const handleColorChange = (rawHex: string) => {
    const normalized = normalizeHexColor(rawHex) || DEFAULT_APP_BACKGROUND_COLOR;
    onUpdateAppearance({
      ...appearance,
      backgroundColor: normalized,
    });
  };

  const handleTriggerFilePicker = () => {
    if (isUpdatingAvatar) return;
    setAvatarError('');
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setAvatarError('');
    setIsUpdatingAvatar(true);
    try {
      const processedDataUrl = await processAvatarImageFile(file);
      await onUpdateAvatar(processedDataUrl);
    } catch (err) {
      setAvatarError(
        err instanceof Error ? err.message : 'Không thể cập nhật ảnh đại diện lúc này.',
      );
    } finally {
      setIsUpdatingAvatar(false);
    }
  };

  const handleResetAvatar = async () => {
    if (isUpdatingAvatar || !hasCustomAvatar) return;
    setAvatarError('');
    setIsUpdatingAvatar(true);
    try {
      await onUpdateAvatar('');
    } catch (err) {
      setAvatarError(
        err instanceof Error ? err.message : 'Không thể khôi phục ảnh đại diện mặc định.',
      );
    } finally {
      setIsUpdatingAvatar(false);
    }
  };

  const handleAuthorizeDriveClick = async () => {
    const trimmed = driveEmailInput.trim();
    const err = validateEmailInput(trimmed);
    if (err) {
      setLocalDriveEmailError(err);
      return;
    }
    setLocalDriveEmailError('');
    if (trimmed && trimmed !== linkedEmail) {
      onUpdateLinkedEmail?.(trimmed);
    }
    await onAuthorizeDrive(trimmed || undefined);
  };

  const handleSaveProfileClick = async () => {
    if (!onUpdateProfile) return;
    const trimmedUser = profileUsername.trim();
    const trimmedPhone = profilePhone.trim();
    const trimmedEmail = profileEmail.trim();

    if (!trimmedUser || trimmedUser.length < 2) {
      setProfileError('Tên đăng nhập phải có ít nhất 2 ký tự.');
      return;
    }
    const emailErr = validateEmailInput(trimmedEmail);
    if (emailErr) {
      setProfileError(emailErr);
      return;
    }

    setIsSavingProfile(true);
    setProfileError('');
    setProfileSavedNotice('');
    try {
      await onUpdateProfile({
        newUsername: trimmedUser,
        newPhone: trimmedPhone,
        newEmail: trimmedEmail,
      });
      if (trimmedEmail) {
        setDriveEmailInput(trimmedEmail);
      }
      setIsEditingProfile(false);
      setProfileSavedNotice('Đã cập nhật thông tin tài khoản và giữ nguyên toàn bộ dữ liệu.');
    } catch (err) {
      setProfileError(
        err instanceof Error ? err.message : 'Không thể cập nhật thông tin tài khoản.',
      );
    } finally {
      setIsSavingProfile(false);
    }
  };

  const resolvedLinkedEmail = (driveSyncMeta?.linkedEmail || linkedEmail || '').trim();
  const driveLastSyncedText = driveSyncMeta?.lastSyncedAt
    ? new Date(driveSyncMeta.lastSyncedAt).toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#3D1A2B]/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-appearance-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-lg rounded-3xl border border-[#F5BDD6] bg-white shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#F5BDD6] bg-[#FFE3EE] px-5 py-4">
          <h2 id="account-appearance-modal-title" className="text-lg font-bold text-[#3D1A2B]">
            Tài khoản đăng nhập
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng bảng tài khoản đăng nhập"
            className="rounded-xl p-1.5 text-[#7C5266] hover:bg-[#FFD6E7] hover:text-[#3D1A2B] cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[82vh] overflow-y-auto">
          {/* Thông tin tài khoản & Ảnh đại diện */}
          <section
            aria-label="Thông tin tài khoản"
            className="rounded-2xl border border-[#F5BDD6] bg-[#FFF8FB] p-4 space-y-3"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleFileChange}
              aria-label="Chọn ảnh đại diện từ máy"
              className="sr-only"
            />

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={handleTriggerFilePicker}
                    disabled={isUpdatingAvatar}
                    aria-label="Thay đổi ảnh đại diện từ máy"
                    title="Nhấn để chọn ảnh đại diện từ máy"
                    className="group relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border-2 border-[#F39EC1] bg-[#FFE3EE] text-[#E11D64] shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D64] disabled:opacity-60"
                  >
                    {!avatarImgError ? (
                      <img
                        src={resolvedAvatarSrc}
                        alt={`Ảnh đại diện của ${currentAccount}`}
                        data-testid="modal-avatar-img"
                        className="h-full w-full object-cover"
                        onError={() => setAvatarImgError(true)}
                      />
                    ) : (
                      <UserCheck className="h-6 w-6" aria-hidden="true" />
                    )}
                    <span className="absolute inset-0 flex items-center justify-center bg-[#3D1A2B]/45 text-white opacity-0 transition-opacity group-hover:opacity-100">
                      <Camera className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </button>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-extrabold text-[#3D1A2B]">
                    {currentAccount}
                  </div>
                  {currentPhone && (
                    <div className="truncate text-xs font-semibold text-[#7C5266] font-mono-tabular">
                      {currentPhone}
                    </div>
                  )}
                  <div className="mt-0.5 text-[11px] font-semibold text-[#7C5266]">
                    {hasCustomAvatar ? 'Đang dùng ảnh đại diện riêng' : 'Đang dùng ảnh mặc định'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onLogout}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#F5BDD6] bg-white px-3 py-1.5 text-xs font-bold text-[#9D174D] whitespace-nowrap shrink-0 transition-colors hover:bg-[#FFE3EE] cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Đăng xuất</span>
              </button>
            </div>

            {/* Điều khiển tải ảnh đại diện từ máy */}
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={handleTriggerFilePicker}
                disabled={isUpdatingAvatar}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#F39EC1] bg-white px-3 py-1.5 text-xs font-bold text-[#9D174D] transition-colors hover:bg-[#FFE3EE] disabled:opacity-60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D64]"
              >
                {isUpdatingAvatar ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>
                  {isUpdatingAvatar
                    ? 'Đang tải ảnh...'
                    : hasCustomAvatar
                      ? 'Đổi ảnh từ máy'
                      : 'Tải ảnh từ máy'}
                </span>
              </button>

              {hasCustomAvatar && (
                <button
                  type="button"
                  onClick={handleResetAvatar}
                  disabled={isUpdatingAvatar}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#F0C6D8] bg-white px-3 py-1.5 text-xs font-bold text-[#7C5266] transition-colors hover:bg-[#FFF0F6] hover:text-[#3D1A2B] disabled:opacity-60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D64]"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Khôi phục mặc định</span>
                </button>
              )}

              {onUpdateProfile && (
                <button
                  type="button"
                  onClick={() => {
                    setProfileError('');
                    setProfileSavedNotice('');
                    setProfileUsername(currentAccount);
                    setProfilePhone(currentPhone || '');
                    setProfileEmail(linkedEmail || driveSyncMeta?.linkedEmail || '');
                    setIsEditingProfile((prev) => !prev);
                  }}
                  aria-expanded={isEditingProfile}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#F39EC1] bg-white px-3 py-1.5 text-xs font-bold text-[#9D174D] transition-colors hover:bg-[#FFE3EE] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D64]"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{isEditingProfile ? 'Đóng sửa thông tin' : 'Đổi thông tin đăng nhập'}</span>
                </button>
              )}
            </div>

            {isEditingProfile && onUpdateProfile && (
              <div className="rounded-2xl border border-[#F0C6D8] bg-white p-3.5 space-y-3">
                <div className="text-xs font-extrabold text-[#3D1A2B]">
                  Cập nhật thông tin đăng nhập &amp; liên kết Google Drive
                </div>

                <div className="space-y-2.5">
                  <div>
                    <label
                      htmlFor="profile-edit-username"
                      className="block text-[11px] font-bold text-[#7C5266] mb-1"
                    >
                      Tên đăng nhập
                    </label>
                    <div className="relative">
                      <User
                        className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#B48EA0]"
                        aria-hidden="true"
                      />
                      <input
                        id="profile-edit-username"
                        type="text"
                        value={profileUsername}
                        onChange={(e) => {
                          setProfileUsername(e.target.value);
                          if (profileError) setProfileError('');
                        }}
                        placeholder="Nhập tên đăng nhập mới"
                        className="w-full rounded-xl border border-[#F5BDD6] bg-[#FFFDFD] py-1.5 pl-9 pr-3 text-xs font-semibold text-[#3D1A2B] focus:border-[#E11D64] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="profile-edit-phone"
                      className="block text-[11px] font-bold text-[#7C5266] mb-1"
                    >
                      Số điện thoại
                    </label>
                    <div className="relative">
                      <Phone
                        className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#B48EA0]"
                        aria-hidden="true"
                      />
                      <input
                        id="profile-edit-phone"
                        type="tel"
                        value={profilePhone}
                        onChange={(e) => {
                          setProfilePhone(e.target.value);
                          if (profileError) setProfileError('');
                        }}
                        placeholder="Ví dụ: 0912345678"
                        className="w-full rounded-xl border border-[#F5BDD6] bg-[#FFFDFD] py-1.5 pl-9 pr-3 text-xs font-semibold text-[#3D1A2B] font-mono-tabular focus:border-[#E11D64] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="profile-edit-email"
                      className="block text-[11px] font-bold text-[#7C5266] mb-1"
                    >
                      Email liên kết Google Drive
                    </label>
                    <div className="relative">
                      <Mail
                        className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#B48EA0]"
                        aria-hidden="true"
                      />
                      <input
                        id="profile-edit-email"
                        type="email"
                        value={profileEmail}
                        onChange={(e) => {
                          setProfileEmail(e.target.value);
                          if (profileError) setProfileError('');
                        }}
                        placeholder="Ví dụ: tenban@gmail.com"
                        className="w-full rounded-xl border border-[#F5BDD6] bg-[#FFFDFD] py-1.5 pl-9 pr-3 text-xs font-semibold text-[#3D1A2B] focus:border-[#E11D64] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {profileError && (
                  <p
                    role="alert"
                    className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3 py-1.5 text-xs font-semibold text-[#BE123C]"
                  >
                    {profileError}
                  </p>
                )}

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={isSavingProfile}
                    onClick={() => {
                      setIsEditingProfile(false);
                      setProfileError('');
                    }}
                    className="rounded-xl border border-[#F0C6D8] bg-white px-3 py-1.5 text-xs font-bold text-[#7C5266] hover:bg-[#FFF0F6] cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    disabled={isSavingProfile}
                    onClick={() => void handleSaveProfileClick()}
                    className="inline-flex items-center gap-1 rounded-xl bg-[#E11D64] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#BE185D] disabled:opacity-60 cursor-pointer"
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{isSavingProfile ? 'Đang lưu...' : 'Lưu thông tin'}</span>
                  </button>
                </div>
              </div>
            )}

            {profileSavedNotice && !profileError && (
              <p
                role="status"
                className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-3 py-2 text-xs font-semibold text-[#15803D]"
              >
                {profileSavedNotice}
              </p>
            )}

            {avatarError && (
              <p
                role="alert"
                className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3 py-2 text-xs font-semibold text-[#BE123C]"
              >
                {avatarError}
              </p>
            )}

            <div
              className="flex items-center gap-1.5 text-xs font-semibold text-[#7C5266]"
              aria-live="polite"
            >
              {saveStatus === 'saving' ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-[#E11D64] shrink-0" aria-hidden="true" />
              ) : (
                <Cloud
                  className={`h-3.5 w-3.5 shrink-0 ${
                    saveStatus === 'saved' ? 'text-[#15803D]' : 'text-[#B45309]'
                  }`}
                  aria-hidden="true"
                />
              )}
              <span className="truncate">
                {saveStatus === 'saving'
                  ? 'Đang lưu...'
                  : saveStatus === 'saved'
                    ? savedTimeText
                      ? `Đã lưu · ${savedTimeText}`
                      : 'Đã lưu cho tài khoản'
                    : 'Lỗi lưu dữ liệu'}
              </span>
            </div>
          </section>

          {/* Mục Lưu trữ Google Drive (Thư mục Plantea) */}
          <section
            aria-label="Lưu trữ Google Drive"
            className="rounded-2xl border border-[#F5BDD6] bg-[#FFF8FB] p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="inline-flex items-center gap-2 text-sm font-extrabold text-[#3D1A2B]">
                <FolderOpen className="h-4 w-4 text-[#E11D64]" aria-hidden="true" />
                <span>Lưu trữ Google Drive</span>
              </h3>

              <span
                className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-0.5 text-[11px] font-bold ${
                  hasDriveToken
                    ? 'border-[#86EFAC] bg-[#F0FDF4] text-[#15803D]'
                    : resolvedLinkedEmail
                      ? 'border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]'
                      : 'border-[#F0C6D8] bg-white text-[#7C5266]'
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  {hasDriveToken
                    ? 'Đã cấp phép'
                    : resolvedLinkedEmail
                      ? 'Cần cấp phép lại'
                      : 'Chưa liên kết'}
                </span>
              </span>
            </div>

            <div className="space-y-1 text-xs font-semibold text-[#5C4B54]">
              <div>
                Thư mục lưu trữ:{' '}
                <span className="font-extrabold text-[#9D174D]">
                  Google Drive / {driveSyncMeta?.folderName || 'Plantea'}
                </span>{' '}
                <span className="text-[#7C5266]">
                  {driveSyncMeta?.folderId
                    ? `(Đã tạo thư mục · ${driveSyncMeta.monthFolderCount || 12} thư mục tháng)`
                    : '(Tự tạo thư mục chính & từng tháng sau khi cấp phép)'}
                </span>
              </div>
              {resolvedLinkedEmail && (
                <div>
                  Email liên kết:{' '}
                  <span className="font-bold text-[#3D1A2B]">{resolvedLinkedEmail}</span>
                </div>
              )}
              {driveLastSyncedText && (
                <div className="text-[11px] text-[#7C5266]">
                  Đồng bộ gần nhất: {driveLastSyncedText}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="drive-linked-email-input"
                className="block text-xs font-bold text-[#7C5266]"
              >
                Email Google Drive
              </label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#B48EA0]"
                  aria-hidden="true"
                />
                <input
                  id="drive-linked-email-input"
                  type="email"
                  value={driveEmailInput}
                  onChange={(e) => {
                    setDriveEmailInput(e.target.value);
                    if (localDriveEmailError) setLocalDriveEmailError('');
                  }}
                  placeholder="Ví dụ: tenban@gmail.com"
                  className="w-full rounded-xl border border-[#F5BDD6] bg-white py-2 pl-9 pr-3 text-xs font-semibold text-[#3D1A2B] placeholder:font-normal placeholder:text-[#B48EA0] focus:border-[#E11D64] focus:outline-none"
                />
              </div>
            </div>

            {(localDriveEmailError || driveError) && (
              <p
                role="alert"
                className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3 py-2 text-xs font-semibold text-[#BE123C]"
              >
                {localDriveEmailError || driveError}
              </p>
            )}

            {driveStatusMessage && !driveError && !localDriveEmailError && (
              <p
                role="status"
                className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-3 py-2 text-xs font-semibold text-[#15803D]"
              >
                {driveStatusMessage}
              </p>
            )}

            {!hasDriveToken ? (
              <div className="space-y-2">
                <GoogleSignInButton
                  label={
                    isDriveBusy
                      ? 'Đang xin cấp phép Google Drive...'
                      : 'Sign in with Google'
                  }
                  disabled={isDriveBusy}
                  onClick={handleAuthorizeDriveClick}
                  className="w-full"
                />
                <p className="text-[11px] font-medium text-[#7C5266]">
                  Dữ liệu hiện tại của bạn được giữ nguyên. Sau khi bạn cấp phép, Plantea sẽ tạo thư mục{' '}
                  <strong className="text-[#9D174D]">Plantea</strong> trên Google Drive để sao lưu và khôi phục an toàn.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isDriveBusy}
                    onClick={onRequestSaveToDrive}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#E11D64] px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-[#BE185D] disabled:opacity-60 cursor-pointer"
                  >
                    {isDriveBusy ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <CloudUpload className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span>Lưu dữ liệu lên Drive</span>
                  </button>

                  <button
                    type="button"
                    disabled={isDriveBusy}
                    onClick={onRequestLoadFromDrive}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#F39EC1] bg-white px-3 py-2 text-xs font-bold text-[#9D174D] transition-colors hover:bg-[#FFE3EE] disabled:opacity-60 cursor-pointer"
                  >
                    <DownloadCloud className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Tải dữ liệu từ Drive</span>
                  </button>
                </div>

                <button
                  type="button"
                  disabled={isDriveBusy}
                  onClick={handleAuthorizeDriveClick}
                  className="text-[11px] font-bold text-[#7C5266] underline decoration-[#F39EC1] underline-offset-2 hover:text-[#9D174D] disabled:opacity-50 cursor-pointer"
                >
                  Đổi tài khoản Google / Cấp phép lại
                </button>
              </div>
            )}
          </section>

          {/* Mục Giao diện */}
          <section aria-label="Giao diện" className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="inline-flex items-center gap-2 text-sm font-extrabold text-[#3D1A2B]">
                <Palette className="h-4 w-4 text-[#E11D64]" aria-hidden="true" />
                <span>Giao diện</span>
              </h3>
            </div>

            {/* Chế độ Sáng / Tối */}
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-[#3D1A2B]">Chế độ hiển thị</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleModeChange('light')}
                  aria-pressed={appearance.themeMode === 'light'}
                  className={`flex items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-xs font-bold transition-colors cursor-pointer ${
                    appearance.themeMode === 'light'
                      ? 'border-[#E11D64] bg-[#FFE3EE] text-[#9D174D]'
                      : 'border-[#F0C6D8] bg-white text-[#7C5266] hover:bg-[#FFF4F8]'
                  }`}
                >
                  <Sun className="h-4 w-4" aria-hidden="true" />
                  <span>Chế độ sáng</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleModeChange('dark')}
                  aria-pressed={appearance.themeMode === 'dark'}
                  className={`flex items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-xs font-bold transition-colors cursor-pointer ${
                    appearance.themeMode === 'dark'
                      ? 'border-[#E11D64] bg-[#FFE3EE] text-[#9D174D]'
                      : 'border-[#F0C6D8] bg-white text-[#7C5266] hover:bg-[#FFF4F8]'
                  }`}
                >
                  <Moon className="h-4 w-4" aria-hidden="true" />
                  <span>Chế độ tối</span>
                </button>
              </div>
            </div>

            {/* Chọn màu nền tùy thích + bảng màu giống bảng thêm task */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#3D1A2B]">
                  Màu nền (Bảng pastel 60 màu &amp; màu tùy chọn)
                </span>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#3D1A2B]">
                    <span
                      aria-hidden="true"
                      className="h-4 w-4 rounded-md border border-[#F0C6D8]"
                      style={{ backgroundColor: currentBgHex }}
                    />
                    <span className="font-mono-tabular">
                      {matchedTone ? matchedTone.name : currentBgHex}
                    </span>
                  </span>
                </div>
              </div>

              {/* Chọn màu tùy thích */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#F0C6D8] bg-[#FFF8FB] px-3 py-2">
                <label
                  htmlFor="custom-bg-color-picker"
                  className="text-xs font-bold text-[#3D1A2B] cursor-pointer"
                >
                  Chọn màu tùy thích:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="custom-bg-color-picker"
                    type="color"
                    value={currentBgHex}
                    onChange={(e) => handleColorChange(e.target.value)}
                    aria-label="Chọn màu nền tùy thích"
                    className="h-7 w-10 rounded-lg border border-[#F0C6D8] bg-transparent p-0.5 cursor-pointer"
                  />
                  <span className="text-xs font-bold font-mono-tabular text-[#7C5266]">
                    {currentBgHex}
                  </span>
                </div>
              </div>

              {/* Bảng màu 60 màu giống trong bảng thêm task */}
              <div
                role="radiogroup"
                aria-label="Chọn màu nền từ bảng pastel 60 màu"
                className="grid grid-cols-6 sm:grid-cols-10 gap-1.5 rounded-2xl border border-[#F0C6D8] bg-[#FFFDFD] p-2.5"
              >
                {PASTEL_60_COLORS.map((tone) => {
                  const isSelected = currentBgHex === tone.hex;
                  return (
                    <button
                      key={tone.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => handleColorChange(tone.hex)}
                      title={tone.name}
                      aria-label={`Chọn màu nền ${tone.name}`}
                      className={`relative flex h-8 w-full items-center justify-center rounded-lg border transition-transform hover:scale-105 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D64] ${
                        isSelected ? 'ring-2 ring-[#3D1A2B] ring-offset-1 scale-105' : ''
                      }`}
                      style={{
                        backgroundColor: tone.hex,
                        borderColor: isSelected ? '#3D1A2B' : tone.border,
                      }}
                    >
                      {isSelected && <Check className="h-4 w-4 text-[#3D1A2B]" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>

              <p className="text-[11px] text-[#7C5266]">
                Khi tạo hoặc sửa task, màu trùng với màu nền giao diện sẽ tự động bị khóa để thẻ task luôn nổi bật.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
