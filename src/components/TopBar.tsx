import { useEffect, useState } from 'react';
import type { CalendarViewMode } from '../types/planner';
import { CalendarHeart, Download, User } from 'lucide-react';
import { PlanteaWordmark } from './PlanteaWordmark';
import { DEFAULT_AVATAR_SRC } from '../utils/avatar';
import { PWAInstallButton } from './PWAInstallButton';

interface TopBarProps {
  viewMode: CalendarViewMode;
  currentAccount: string;
  avatarDataUrl?: string;
  driveLinked?: boolean;
  hasDriveToken?: boolean;
  onChangeView: (mode: CalendarViewMode) => void;
  onExportCsv: () => void;
  onOpenAccountModal: () => void;
}

const PLANTEA_LOGO_SRC = '/assets/aistudio/M_y_Kawaii_v__Logo_Plantea_f1107575.png';

export function TopBar({
  viewMode,
  currentAccount,
  avatarDataUrl,
  driveLinked = false,
  hasDriveToken = false,
  onChangeView,
  onExportCsv,
  onOpenAccountModal,
}: TopBarProps) {
  const [imgError, setImgError] = useState(false);
  const [avatarImgError, setAvatarImgError] = useState(false);

  const resolvedAvatarSrc = avatarDataUrl || DEFAULT_AVATAR_SRC;

  useEffect(() => {
    setAvatarImgError(false);
  }, [resolvedAvatarSrc]);

  return (
    <header className="sticky top-0 z-30 border-b border-[#F5BDD6] bg-[#FFF8FB]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
        {/* Brand wordmark + Plantea Logo -> click để mở Tài khoản đăng nhập & Giao diện */}
        <button
          type="button"
          onClick={onOpenAccountModal}
          aria-label="Mở Tài khoản đăng nhập và Giao diện Plantea"
          title="Tài khoản đăng nhập & Giao diện"
          className="flex items-center gap-2.5 whitespace-nowrap shrink-0 text-2xl font-extrabold tracking-tight hover:opacity-90 transition-opacity cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D64] rounded-xl px-1 py-0.5"
        >
          {!imgError ? (
            <img
              src={PLANTEA_LOGO_SRC}
              alt="Biểu tượng Plantea"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="h-9 w-9 rounded-xl border border-[#F39EC1] object-cover shadow-xs"
            />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#F39EC1] bg-[#FFE3EE] text-[#E11D64]">
              <CalendarHeart className="h-5 w-5" aria-hidden="true" />
            </span>
          )}
          <PlanteaWordmark />
        </button>

        {/* Clean single-line navigation links */}
        <nav
          aria-label="Chế độ xem lịch"
          className="hidden md:flex items-center gap-6 text-sm font-bold text-[#7C5266]"
        >
          <button
            type="button"
            onClick={() => onChangeView('todo')}
            className={`whitespace-nowrap shrink-0 border-b-2 py-1 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D64] ${
              viewMode === 'todo'
                ? 'border-[#E11D64] text-[#3D1A2B]'
                : 'border-transparent hover:text-[#3D1A2B] hover:border-[#F39EC1]'
            }`}
          >
            To Do List
          </button>
          <button
            type="button"
            onClick={() => onChangeView('day')}
            className={`whitespace-nowrap shrink-0 border-b-2 py-1 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D64] ${
              viewMode === 'day'
                ? 'border-[#E11D64] text-[#3D1A2B]'
                : 'border-transparent hover:text-[#3D1A2B] hover:border-[#F39EC1]'
            }`}
          >
            Lịch Ngày
          </button>
          <button
            type="button"
            onClick={() => onChangeView('week')}
            className={`whitespace-nowrap shrink-0 border-b-2 py-1 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D64] ${
              viewMode === 'week'
                ? 'border-[#E11D64] text-[#3D1A2B]'
                : 'border-transparent hover:text-[#3D1A2B] hover:border-[#F39EC1]'
            }`}
          >
            Lịch Tuần
          </button>
          <button
            type="button"
            onClick={() => onChangeView('month')}
            className={`whitespace-nowrap shrink-0 border-b-2 py-1 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D64] ${
              viewMode === 'month'
                ? 'border-[#E11D64] text-[#3D1A2B]'
                : 'border-transparent hover:text-[#3D1A2B] hover:border-[#F39EC1]'
            }`}
          >
            Lịch Tháng
          </button>
          <button
            type="button"
            onClick={() => onChangeView('tuition')}
            className={`whitespace-nowrap shrink-0 border-b-2 py-1 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D64] ${
              viewMode === 'tuition'
                ? 'border-[#E11D64] text-[#3D1A2B]'
                : 'border-transparent hover:text-[#3D1A2B] hover:border-[#F39EC1]'
            }`}
          >
            Thu nhập
          </button>
        </nav>

        {/* Actions: Cài đặt PWA + Xuất Sheet + Ảnh đại diện tài khoản */}
        <div className="flex items-center gap-2 shrink-0">
          <PWAInstallButton />
          <button
            type="button"
            onClick={onExportCsv}
            className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-2xl border border-[#F5BDD6] bg-white px-3 sm:px-3.5 py-1.5 text-xs font-bold text-[#9D174D] hover:bg-[#FFE3EE] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D64]"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Xuất Sheet</span>
          </button>

          <button
            type="button"
            onClick={onOpenAccountModal}
            aria-label={`Tài khoản ${currentAccount}${
              hasDriveToken
                ? ' (Google Drive đã cấp phép)'
                : driveLinked
                  ? ' (Google Drive đã liên kết)'
                  : ''
            } — Đổi ảnh đại diện, Google Drive và giao diện`}
            title={`Tài khoản ${currentAccount} · Ảnh đại diện & Google Drive`}
            className="inline-flex items-center gap-2 rounded-2xl border border-[#F5BDD6] bg-white p-1 sm:pr-3 text-xs font-bold text-[#3D1A2B] hover:bg-[#FFE3EE] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D64]"
          >
            <span className="relative shrink-0">
              {!avatarImgError ? (
                <img
                  src={resolvedAvatarSrc}
                  alt={`Ảnh đại diện của ${currentAccount}`}
                  data-testid="topbar-avatar-img"
                  className="h-7 w-7 rounded-xl border border-[#F39EC1] object-cover shrink-0"
                  onError={() => setAvatarImgError(true)}
                />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-xl border border-[#F39EC1] bg-[#FFE3EE] text-[#E11D64] shrink-0">
                  <User className="h-4 w-4" aria-hidden="true" />
                </span>
              )}
              {(hasDriveToken || driveLinked) && (
                <span
                  aria-hidden="true"
                  className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${
                    hasDriveToken ? 'bg-[#16A34A]' : 'bg-[#F59E0B]'
                  }`}
                />
              )}
            </span>
            <span className="hidden sm:inline max-w-[110px] truncate">{currentAccount}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
