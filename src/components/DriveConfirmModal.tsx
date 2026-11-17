import { AlertTriangle, CloudUpload, DownloadCloud, FolderOpen, X } from 'lucide-react';

export interface DriveConfirmPayload {
  mode: 'save_to_drive' | 'restore_from_drive';
  linkedEmail: string;
  folderName: string;
  fileName: string;
  fileAlreadyExists: boolean;
  localSummary: { tasks: number; incomes: number; students: number; todos: number };
  remoteSummary?: { tasks: number; incomes: number; students: number; todos: number } | null;
  remoteModifiedTime?: string;
}

interface DriveConfirmModalProps {
  payload: DriveConfirmPayload | null;
  isSubmitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function formatSummaryLine(s: {
  tasks: number;
  incomes: number;
  students: number;
  todos: number;
}): string {
  return `${s.tasks} lịch/task · ${s.incomes} nguồn thu · ${s.students} học sinh · ${s.todos} To Do`;
}

export function DriveConfirmModal({
  payload,
  isSubmitting,
  onConfirm,
  onCancel,
}: DriveConfirmModalProps) {
  if (!payload) return null;

  const isSave = payload.mode === 'save_to_drive';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#3D1A2B]/50 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drive-confirm-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onCancel();
        }
      }}
    >
      <div className="w-full max-w-md rounded-3xl border border-[#F5BDD6] bg-white shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#F5BDD6] bg-[#FFE3EE] px-5 py-4">
          <div className="flex items-center gap-2">
            {isSave ? (
              <CloudUpload className="h-5 w-5 text-[#E11D64]" aria-hidden="true" />
            ) : (
              <DownloadCloud className="h-5 w-5 text-[#E11D64]" aria-hidden="true" />
            )}
            <h2 id="drive-confirm-modal-title" className="text-base font-extrabold text-[#3D1A2B]">
              {isSave
                ? payload.fileAlreadyExists
                  ? 'Xác nhận cập nhật tệp trên Google Drive'
                  : 'Xác nhận lưu dữ liệu vào Google Drive'
                : 'Xác nhận khôi phục dữ liệu từ Google Drive'}
            </h2>
          </div>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={onCancel}
            aria-label="Đóng hộp thoại xác nhận Google Drive"
            className="rounded-xl p-1.5 text-[#7C5266] hover:bg-[#FFD6E7] hover:text-[#3D1A2B] disabled:opacity-50 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-sm text-[#3D1A2B]">
          <div className="rounded-2xl border border-[#F5BDD6] bg-[#FFF8FB] p-3.5 space-y-1.5 text-xs">
            <div className="flex items-center gap-1.5 font-extrabold text-[#9D174D]">
              <FolderOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Google Drive / {payload.folderName} / {payload.fileName}
              </span>
            </div>
            <div className="font-semibold text-[#7C5266]">
              Tài khoản liên kết: <span className="text-[#3D1A2B]">{payload.linkedEmail}</span>
            </div>
          </div>

          <p className="text-xs sm:text-sm font-semibold text-[#5C4B54] leading-relaxed">
            {isSave
              ? payload.fileAlreadyExists
                ? `Thao tác này sẽ ghi đè nội dung mới lên tệp "${payload.fileName}" và đồng bộ vào các thư mục con theo từng tháng trong "${payload.folderName}" trên Google Drive của bạn.`
                : `Thao tác này sẽ tạo tệp "${payload.fileName}" cùng các thư mục con theo từng tháng trong "${payload.folderName}" trên Google Drive để lưu trữ toàn bộ dữ liệu hiện tại của bạn.`
              : `Thao tác này sẽ thay thế dữ liệu hiện tại trên thiết bị bằng bản sao lưu đã lưu trong thư mục "${payload.folderName}" trên Google Drive.`}
          </p>

          <div className="space-y-2 rounded-2xl border border-[#F0C6D8] bg-[#FFFDFD] p-3 text-xs">
            <div>
              <div className="font-extrabold text-[#3D1A2B]">Dữ liệu hiện tại trên app:</div>
              <div className="mt-0.5 font-semibold text-[#7C5266]">
                {formatSummaryLine(payload.localSummary)}
              </div>
            </div>

            {payload.remoteSummary && (
              <div className="border-t border-[#F6DCE7] pt-2">
                <div className="font-extrabold text-[#3D1A2B]">
                  Dữ liệu hiện có trên Google Drive:
                </div>
                <div className="mt-0.5 font-semibold text-[#7C5266]">
                  {formatSummaryLine(payload.remoteSummary)}
                </div>
              </div>
            )}
          </div>

          {((isSave && payload.fileAlreadyExists) || !isSave) && (
            <div className="flex items-start gap-2 rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] p-3 text-xs font-semibold text-[#92400E]">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                {isSave
                  ? 'Hãy kiểm tra số lượng mục ở trên trước khi ghi đè bản lưu trên Google Drive.'
                  : 'Dữ liệu chưa lưu lên Drive trên thiết bị hiện tại sẽ bị thay thế bởi bản trên Google Drive.'}
              </span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onCancel}
              className="rounded-2xl border border-[#F0C6D8] bg-white px-4 py-2 text-xs font-bold text-[#7C5266] hover:bg-[#FFF0F6] disabled:opacity-50 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onConfirm}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-[#E11D64] px-4 py-2 text-xs font-bold text-white hover:bg-[#BE185D] disabled:opacity-60 cursor-pointer"
            >
              {isSave ? (
                <CloudUpload className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <DownloadCloud className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>
                {isSubmitting
                  ? 'Đang xử lý...'
                  : isSave
                    ? 'Xác nhận lưu lên Drive'
                    : 'Xác nhận khôi phục'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
