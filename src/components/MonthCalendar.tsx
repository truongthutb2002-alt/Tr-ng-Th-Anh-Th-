import { useEffect, useState } from 'react';
import { formatLunarDdMm, getLunarFromDateKey } from '../utils/lunar';
import { getMonthGrid, getMonthKey, parseDateKey, toDateKey } from '../utils/schedule';
import { formatMonthKeyLabel } from '../utils/offlineWorkspace';
import { AlertTriangle, CalendarDays, Trash2, X } from 'lucide-react';

interface MonthCalendarProps {
  selectedDate: string;
  onSelectDay: (dateKey: string) => void;
  onDeleteMonth?: (monthKey: string) => Promise<void>;
  driveLinked?: boolean;
}

const WEEKDAYS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

export function MonthCalendar({
  selectedDate,
  onSelectDay,
  onDeleteMonth,
  driveLinked = false,
}: MonthCalendarProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const allCells = getMonthGrid(selectedDate);
  // Keep 5 rows if the 6th row contains no days from the current month; otherwise show all 6 rows
  const sixthRowHasCurrentMonth = allCells.slice(35, 42).some((c) => c.inCurrentMonth);
  const cells = sixthRowHasCurrentMonth ? allCells : allCells.slice(0, 35);
  const todayKey = toDateKey(new Date());
  const todayDate = parseDateKey(todayKey);
  const todayLunar = getLunarFromDateKey(todayKey);
  const todayLunarDdMm = formatLunarDdMm(todayLunar);
  const todayDisplay = todayDate.toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const activeMonthKey = getMonthKey(selectedDate);
  const activeMonthLabel = formatMonthKeyLabel(activeMonthKey);

  useEffect(() => {
    if (!confirmOpen) return;
    setDeleteError('');
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        setConfirmOpen(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [confirmOpen, isDeleting]);

  const handleConfirmDeleteMonth = async () => {
    if (!onDeleteMonth || isDeleting) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      await onDeleteMonth(activeMonthKey);
      setConfirmOpen(false);
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : `Không thể xóa dữ liệu ${activeMonthLabel}.`,
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Ưu tiên hiển thị Hôm nay đầu tiên, không cần vuốt tìm */}
      <div className="w-full flex flex-wrap items-center justify-between gap-3 rounded-3xl border-2 border-[#E11D64] bg-[#FFE3EE] px-4 py-3 shadow-xs">
        <button
          type="button"
          onClick={() => onSelectDay(todayKey)}
          className="flex items-center gap-3 min-w-0 text-left hover:opacity-90 transition-opacity cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D64] rounded-2xl"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#E11D64] text-white shadow-xs">
            <CalendarDays className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wide text-[#E11D64]">
                Hôm nay
              </span>
              <span className="text-xs font-medium font-mono-tabular text-[#8A6274]">
                Âm lịch {todayLunarDdMm}
              </span>
            </div>
            <div className="text-sm sm:text-base font-extrabold capitalize text-[#3D1A2B]">
              {todayDisplay}
            </div>
          </div>
        </button>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onSelectDay(todayKey)}
            className="rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-[#9D174D] border border-[#F39EC1] hover:bg-[#FFD6E7] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D64]"
          >
            Mở lịch hôm nay
          </button>

          {onDeleteMonth && (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              aria-label={`Xóa tháng ${activeMonthLabel}`}
              title={`Xóa toàn bộ thông tin ${activeMonthLabel} trên ứng dụng và Google Drive`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-[#BE123C] border border-[#FDA4AF] hover:bg-[#FFE4E6] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BE123C]"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Xóa tháng</span>
            </button>
          )}
        </div>
      </div>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#3D1A2B]/45 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-month-confirm-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !isDeleting) {
              setConfirmOpen(false);
            }
          }}
        >
          <div className="w-full max-w-md rounded-3xl border border-[#F5BDD6] bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#FECDD3] bg-[#FFF1F2] px-5 py-3.5">
              <div className="flex items-center gap-2 text-base font-extrabold text-[#BE123C]">
                <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
                <h2 id="delete-month-confirm-title">Xóa dữ liệu {activeMonthLabel}</h2>
              </div>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setConfirmOpen(false)}
                aria-label="Đóng hộp thoại xóa tháng"
                className="rounded-xl p-1 text-[#9D174D] hover:bg-[#FFE4E6] disabled:opacity-50 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs sm:text-sm font-semibold text-[#5C4B54]">
              <p className="leading-relaxed">
                Bạn có chắc muốn xóa <strong className="text-[#BE123C]">toàn bộ thông tin</strong>{' '}
                của <strong className="text-[#3D1A2B]">{activeMonthLabel}</strong> trên ứng dụng
                {driveLinked ? ' và trên Google Drive (bao gồm thư mục tháng đó)' : ''} không?
              </p>
              <p className="rounded-2xl border border-[#F5BDD6] bg-[#FFF8FB] px-3.5 py-2.5 text-xs text-[#7C5266]">
                Thao tác này xóa hết lịch task, nguồn thu, buổi học phí, việc cần làm, ghi chú và mục
                tiêu trong <strong>{activeMonthLabel}</strong>. Các tháng khác vẫn được giữ nguyên.
              </p>

              {deleteError && (
                <p
                  role="alert"
                  className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3 py-2 text-xs font-semibold text-[#BE123C]"
                >
                  {deleteError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setConfirmOpen(false)}
                  className="rounded-2xl border border-[#F5BDD6] bg-white px-4 py-2 text-xs font-bold text-[#7C5266] hover:bg-[#FFF0F6] disabled:opacity-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => void handleConfirmDeleteMonth()}
                  className="inline-flex items-center gap-1.5 rounded-2xl bg-[#BE123C] px-4 py-2 text-xs font-bold text-white hover:bg-[#9F1239] disabled:opacity-60 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{isDeleting ? 'Đang xóa...' : `Xóa ${activeMonthLabel}`}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-3xl border border-[#F5BDD6] bg-[#FFF8FB] overflow-hidden shadow-xs">
        {/* Weekday header (fits viewport without horizontal swipe) */}
        <div className="grid grid-cols-7 border-b border-[#F5BDD6]">
          {WEEKDAYS.map((day, idx) => {
            const isSaturday = idx === 5;
            const isSunday = idx === 6;
            const shortDay =
              idx === 6 ? 'CN' : `T${idx + 2}`;
            return (
              <div
                key={day}
                className={`px-1 py-2.5 text-center text-[11px] sm:text-xs font-bold border-r last:border-r-0 border-[#F5BDD6] ${
                  isSaturday
                    ? 'bg-[#DBEAFE] text-[#1D4ED8]'
                    : isSunday
                      ? 'bg-[#FFE8F1] text-[#BE185D]'
                      : 'bg-[#FFE3EE] text-[#7C5266]'
                }`}
              >
                <span className="hidden sm:inline">{day}</span>
                <span className="sm:hidden">{shortDay}</span>
              </div>
            );
          })}
        </div>

        {/* Clean 5-or-6-week grid showing only Solar date and smaller/lighter Lunar dd/mm date */}
        <div className="grid grid-cols-7 divide-x divide-y divide-[#F6C8DC]">
          {cells.map((cell, index) => {
            const colIdx = index % 7;
            const isSaturday = colIdx === 5;
            const isSunday = colIdx === 6;
            const isSelected = cell.dateKey === selectedDate;
            const isToday = cell.dateKey === todayKey;
            const lunar = getLunarFromDateKey(cell.dateKey);
            const lunarDdMm = formatLunarDdMm(lunar);

            const cellBgClass = isToday
              ? 'ring-2 ring-inset ring-[#E11D64] bg-[#FFE3EE] hover:bg-[#FFD6E7]'
              : isSelected
                ? 'ring-2 ring-inset ring-[#9D174D]/70 bg-[#FFF0F6]'
                : isSaturday
                  ? cell.inCurrentMonth
                    ? 'bg-[#F0F7FF] hover:bg-[#E5F0FF]'
                    : 'bg-[#F4F8FD]/75 hover:bg-[#EBF3FE]'
                  : isSunday
                    ? cell.inCurrentMonth
                      ? 'bg-[#FFF3F8] hover:bg-[#FFE8F1]'
                      : 'bg-[#FFF7FA]/75 hover:bg-[#FFEFF5]'
                    : cell.inCurrentMonth
                      ? 'bg-white hover:bg-[#FFF5F9]'
                      : 'bg-[#FFF8FB] hover:bg-[#FFF0F6]';

            const solarColorClass = isToday
              ? 'bg-[#E11D64] text-white shadow-xs'
              : isSelected
                ? 'bg-[#FFD6E7] text-[#9D174D]'
                : isSaturday
                  ? cell.inCurrentMonth
                    ? 'text-[#1D4ED8]'
                    : 'text-[#89A5CC]'
                  : isSunday
                    ? cell.inCurrentMonth
                      ? 'text-[#BE185D]'
                      : 'text-[#D692B0]'
                    : cell.inCurrentMonth
                      ? 'text-[#3D1A2B]'
                      : 'text-[#B48EA0]';

            // Lunar date strictly smaller and lighter in color than the solar date
            const lunarColorClass = isSaturday
              ? cell.inCurrentMonth
                ? 'text-[#789BC9]'
                : 'text-[#B3C8E2]'
              : isSunday
                ? cell.inCurrentMonth
                  ? 'text-[#D48DA9]'
                  : 'text-[#E3B5C8]'
                : cell.inCurrentMonth
                  ? 'text-[#A68092]'
                  : 'text-[#D1B5C2]';

            return (
              <button
                key={cell.dateKey}
                type="button"
                onClick={() => onSelectDay(cell.dateKey)}
                aria-label={isToday ? `Hôm nay, mở lịch ngày ${cell.dateKey}` : `Mở lịch ngày ${cell.dateKey}`}
                title={`Dương lịch: ${cell.dayOfMonth} · Âm lịch: ${lunarDdMm}${isToday ? ' (Hôm nay)' : ''}`}
                className={`min-h-[64px] sm:min-h-[78px] lg:min-h-[84px] p-1.5 sm:p-2.5 flex flex-col justify-between text-left transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D64] ${cellBgClass}`}
              >
                <div className="w-full flex items-center justify-between gap-1">
                  <span
                    className={`inline-flex h-6 sm:h-7 min-w-6 sm:min-w-7 items-center justify-center rounded-xl px-1 sm:px-1.5 text-xs sm:text-base font-extrabold font-mono-tabular ${solarColorClass}`}
                  >
                    {cell.dayOfMonth}
                  </span>

                  {isToday && (
                    <span className="hidden sm:inline text-[10px] font-extrabold uppercase tracking-tight text-[#E11D64] whitespace-nowrap">
                      Hôm nay
                    </span>
                  )}
                </div>

                <span
                  className={`self-end text-[10px] sm:text-[11px] font-medium font-mono-tabular leading-none ${lunarColorClass}`}
                >
                  {lunarDdMm}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
