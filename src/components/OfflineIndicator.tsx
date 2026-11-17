import { CloudCheck, CloudOff, RefreshCw, ShieldAlert, X } from 'lucide-react';

interface OfflineIndicatorProps {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  needsDriveReauth: boolean;
  syncNotice: string;
  onSyncNowWithGoogle?: () => void;
  onDismissNotice?: () => void;
}

export function OfflineIndicator({
  isOnline,
  isSyncing,
  pendingCount,
  needsDriveReauth,
  syncNotice,
  onSyncNowWithGoogle,
  onDismissNotice,
}: OfflineIndicatorProps) {
  if (!isOnline) {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="offline-indicator"
        className="fixed bottom-4 left-4 z-40 max-w-sm rounded-2xl border border-[#F59E0B] bg-[#FFFBEB] px-3.5 py-2.5 text-xs font-bold text-[#92400E] shadow-lg flex items-start gap-2.5"
      >
        <CloudOff className="h-4 w-4 shrink-0 text-[#D97706] mt-0.5" aria-hidden="true" />
        <div className="space-y-0.5">
          <div>Đang sử dụng ngoại tuyến</div>
          <div className="text-[11px] font-semibold text-[#B45309]">
            {pendingCount > 0
              ? `Có ${pendingCount} thay đổi đang chờ — sẽ tự động sao lưu lên Drive khi có mạng.`
              : 'Mọi dữ liệu bạn nhập đều được lưu cục bộ và tự sao lưu khi có mạng.'}
          </div>
        </div>
      </div>
    );
  }

  if (isSyncing) {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="syncing-indicator"
        className="fixed bottom-4 left-4 z-40 max-w-sm rounded-2xl border border-[#F39EC1] bg-white px-3.5 py-2.5 text-xs font-bold text-[#9D174D] shadow-lg flex items-center gap-2.5"
      >
        <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-[#E11D64]" aria-hidden="true" />
        <span>Đang đồng bộ dữ liệu ngoại tuyến lên máy chủ &amp; Google Drive...</span>
      </div>
    );
  }

  if (needsDriveReauth && pendingCount > 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="drive-reauth-sync-banner"
        className="fixed bottom-4 left-4 z-40 max-w-sm rounded-2xl border border-[#F39EC1] bg-white px-3.5 py-2.5 text-xs font-bold text-[#3D1A2B] shadow-lg space-y-2"
      >
        <div className="flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0 text-[#E11D64] mt-0.5" aria-hidden="true" />
          <span>
            Đã kết nối mạng! Dữ liệu đã lưu lên máy chủ, cần cấp phép Google Drive để tự động sao lưu ngay.
          </span>
        </div>
        {onSyncNowWithGoogle && (
          <button
            type="button"
            onClick={onSyncNowWithGoogle}
            className="w-full rounded-xl bg-[#E11D64] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#BE185D] transition-colors cursor-pointer"
          >
            Cấp phép &amp; sao lưu Drive ngay
          </button>
        )}
      </div>
    );
  }

  if (syncNotice) {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="sync-success-indicator"
        className="fixed bottom-4 left-4 z-40 max-w-sm rounded-2xl border border-[#86EFAC] bg-[#F0FDF4] px-3.5 py-2.5 text-xs font-bold text-[#15803D] shadow-lg flex items-center justify-between gap-2.5"
      >
        <div className="flex items-center gap-2">
          <CloudCheck className="h-4 w-4 shrink-0 text-[#16A34A]" aria-hidden="true" />
          <span>{syncNotice}</span>
        </div>
        {onDismissNotice && (
          <button
            type="button"
            onClick={onDismissNotice}
            aria-label="Đóng thông báo đồng bộ"
            className="rounded-lg p-0.5 text-[#15803D] hover:bg-[#DCFCE7] cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  return null;
}
