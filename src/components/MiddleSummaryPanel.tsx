import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  calculateIncomeTargetProgress,
  formatCurrencyVnd,
  getMonthKey,
  parseDateKey,
} from '../utils/schedule';
import { CalendarDays, Check, Pencil, Target, TrendingUp, X } from 'lucide-react';

interface MiddleSummaryPanelProps {
  selectedDate: string;
  monthlyIncomeSummary: {
    monthTotal: number;
    taskMonthTotal: number;
    categoryMonthTotal: number;
  };
  dailyIncomeSummary: {
    dayTotal: number;
    taskCount: number;
    completedCount: number;
  };
  monthlyTarget: number;
  onSaveMonthlyTarget: (monthKey: string, amount: number) => Promise<void>;
}

export function MiddleSummaryPanel({
  selectedDate,
  monthlyIncomeSummary,
  dailyIncomeSummary,
  monthlyTarget,
  onSaveMonthlyTarget,
}: MiddleSummaryPanelProps) {
  const activeMonth = getMonthKey(selectedDate);
  const monthLabel = activeMonth.split('-').reverse().join('/');
  const dayDate = parseDateKey(selectedDate);
  const dayLabel = dayDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });

  const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);
  const [monthlyDraft, setMonthlyDraft] = useState<string>(
    monthlyTarget > 0 ? String(monthlyTarget) : '',
  );
  const [savingMonthly, setSavingMonthly] = useState(false);
  const [targetError, setTargetError] = useState('');

  useEffect(() => {
    if (!isTargetModalOpen) {
      setMonthlyDraft(monthlyTarget > 0 ? String(monthlyTarget) : '');
      setTargetError('');
    }
  }, [monthlyTarget, activeMonth, isTargetModalOpen]);

  useEffect(() => {
    if (!isTargetModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsTargetModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTargetModalOpen]);

  const monthlyProgress = useMemo(
    () => calculateIncomeTargetProgress(monthlyTarget, monthlyIncomeSummary.monthTotal),
    [monthlyTarget, monthlyIncomeSummary.monthTotal],
  );

  const openTargetModal = () => {
    setMonthlyDraft(monthlyTarget > 0 ? String(monthlyTarget) : '');
    setTargetError('');
    setIsTargetModalOpen(true);
  };

  const handleMonthlySubmit = async (e: FormEvent) => {
    e.preventDefault();
    const val = monthlyDraft.trim() === '' ? 0 : Number(monthlyDraft);
    if (!Number.isFinite(val) || val < 0) {
      setTargetError('Số tiền mục tiêu tháng không hợp lệ.');
      return;
    }
    setTargetError('');
    setSavingMonthly(true);
    try {
      await onSaveMonthlyTarget(activeMonth, Math.round(val));
      setIsTargetModalOpen(false);
    } catch (err) {
      setTargetError(err instanceof Error ? err.message : 'Không thể lưu mục tiêu tháng.');
    } finally {
      setSavingMonthly(false);
    }
  };

  return (
    <aside
      aria-label="Tổng hợp thu nhập"
      className="w-full lg:w-[340px] shrink-0 flex flex-col gap-3"
    >
      {/* Gom Thu nhập tháng & Thu nhập ngày thành 1 ô */}
      <div className="rounded-3xl border border-[#F39EC1] bg-[#FFE3EE] p-4 shadow-xs space-y-3.5">
        {/* Thu nhập tháng */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-[#9D174D]">Thu nhập tháng</span>
            <span className="inline-flex items-center gap-1 rounded-xl bg-white/85 px-2 py-0.5 text-[11px] font-bold text-[#9D174D] font-mono-tabular">
              <TrendingUp className="h-3 w-3" aria-hidden="true" />
              T{monthLabel}
            </span>
          </div>
          <div className="text-xl font-extrabold text-[#9D174D] font-mono-tabular">
            {formatCurrencyVnd(monthlyIncomeSummary.monthTotal)}
          </div>
          <div className="text-[11px] font-semibold text-[#7C5266] flex flex-wrap gap-x-2 gap-y-0.5">
            <span>Lịch: {formatCurrencyVnd(monthlyIncomeSummary.taskMonthTotal)}</span>
            <span aria-hidden="true">·</span>
            <span>Nguồn thu: {formatCurrencyVnd(monthlyIncomeSummary.categoryMonthTotal)}</span>
          </div>
        </div>

        <div className="border-t border-[#F5BDD6]" />

        {/* Thu nhập ngày */}
        <div className="rounded-2xl border border-[#F5BDD6] bg-white p-3 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-[#7C5266]">Thu nhập ngày</span>
            <span className="inline-flex items-center gap-1 rounded-xl bg-[#FFF0F6] px-2 py-0.5 text-[11px] font-bold text-[#9D174D] font-mono-tabular">
              <CalendarDays className="h-3 w-3" aria-hidden="true" />
              {dayLabel}
            </span>
          </div>
          <div className="text-lg font-extrabold text-[#15803D] font-mono-tabular">
            {formatCurrencyVnd(dailyIncomeSummary.dayTotal)}
          </div>
          <div className="text-[11px] font-semibold text-[#7C5266]">
            {dailyIncomeSummary.taskCount > 0
              ? `${dailyIncomeSummary.taskCount} task (${dailyIncomeSummary.completedCount} hoàn thành)`
              : 'Chưa có task trong ngày này'}
          </div>
        </div>
      </div>

      {/* Thu nhập mục tiêu tháng — bấm biểu tượng cây bút để nhập, tự động trừ dần khi thu nhập tăng */}
      <section
        aria-label={`Thu nhập mục tiêu tháng ${monthLabel}`}
        className="rounded-3xl border border-[#F5BDD6] bg-white p-4 shadow-xs space-y-3"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Target className="h-4 w-4 text-[#E11D64] shrink-0" aria-hidden="true" />
            <h2 className="text-sm font-extrabold text-[#3D1A2B] truncate">
              Thu nhập mục tiêu tháng {monthLabel}
            </h2>
            <button
              type="button"
              onClick={openTargetModal}
              aria-label={`Chỉnh sửa thu nhập mục tiêu tháng ${monthLabel}`}
              title="Nhập thu nhập mục tiêu tháng"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-[#F5BDD6] bg-[#FFF8FB] text-[#9D174D] hover:bg-[#FFE3EE] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D64]"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {monthlyProgress.target > 0 ? (
          <div className="space-y-2.5">
            {/* Thanh đo có biểu tượng phần trăm nằm bên trong, sát bên phải */}
            <div
              role="progressbar"
              aria-valuenow={monthlyProgress.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Tiến độ thu nhập mục tiêu tháng ${monthLabel}`}
              className="relative h-6 w-full overflow-hidden rounded-full border border-[#F5BDD6] bg-[#FFE3EE]"
            >
              <div
                className="h-full rounded-full bg-[#E11D64] transition-all duration-300"
                style={{ width: `${monthlyProgress.percent}%` }}
              />
              <span className="absolute inset-y-0.5 right-1 flex items-center rounded-full bg-white px-2 text-[11px] font-extrabold font-mono-tabular text-[#9D174D]">
                {monthlyProgress.percent}%
              </span>
            </div>

            <div className="rounded-2xl border border-[#F6C8DC] bg-[#FFF8FB] p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-xs text-[#7C5266]">
                <span>Mục tiêu:</span>
                <span className="font-bold font-mono-tabular text-[#3D1A2B]">
                  {formatCurrencyVnd(monthlyProgress.target)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-[#7C5266]">
                <span>Đã đạt:</span>
                <span className="font-bold font-mono-tabular text-[#15803D]">
                  −{formatCurrencyVnd(monthlyProgress.achieved)}
                </span>
              </div>
              <div className="border-t border-[#F6DCE7] pt-1.5 flex items-center justify-between gap-2 text-xs">
                <span className="font-bold text-[#7C5266]">
                  {monthlyProgress.exceeded > 0 ? 'Vượt mục tiêu:' : 'Còn lại:'}
                </span>
                <span
                  className={`font-extrabold font-mono-tabular ${
                    monthlyProgress.remaining === 0 ? 'text-[#15803D]' : 'text-[#9D174D]'
                  }`}
                >
                  {monthlyProgress.exceeded > 0
                    ? `+${formatCurrencyVnd(monthlyProgress.exceeded)}`
                    : formatCurrencyVnd(monthlyProgress.remaining)}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={openTargetModal}
            className="w-full rounded-2xl border border-dashed border-[#F5BDD6] bg-[#FFF8FB] px-3 py-3 text-left text-xs font-semibold text-[#7C5266] hover:border-[#E11D64] hover:text-[#9D174D] transition-colors cursor-pointer"
          >
            Chưa đặt mục tiêu. Bấm biểu tượng cây bút để nhập số tiền mục tiêu tháng này.
          </button>
        )}
      </section>

      {/* Bảng nhập Thu nhập mục tiêu tháng */}
      {isTargetModalOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#3D1A2B]/40 p-4 backdrop-blur-[2px]"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) {
                setIsTargetModalOpen(false);
              }
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="monthly-target-modal-title"
              className="mx-auto w-full max-w-sm rounded-3xl border border-[#F5BDD6] bg-white shadow-xl overflow-hidden"
            >
              <div className="flex items-center justify-between border-b border-[#F5BDD6] bg-[#FFE3EE] px-5 py-3.5">
                <h3
                  id="monthly-target-modal-title"
                  className="text-base font-bold text-[#3D1A2B]"
                >
                  Thu nhập mục tiêu tháng {monthLabel}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsTargetModalOpen(false)}
                  aria-label="Đóng bảng nhập mục tiêu tháng"
                  className="rounded-xl p-1.5 text-[#7C5266] hover:bg-[#FFD6E7] hover:text-[#3D1A2B] cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleMonthlySubmit} className="p-5 space-y-4">
                <div>
                  <label
                    htmlFor="monthly-income-target-input"
                    className="block text-xs font-bold text-[#3D1A2B] mb-1.5"
                  >
                    Số tiền mục tiêu (VNĐ)
                  </label>
                  <input
                    id="monthly-income-target-input"
                    type="number"
                    min={0}
                    step={50000}
                    autoFocus
                    value={monthlyDraft}
                    onChange={(e) => {
                      setMonthlyDraft(e.target.value);
                      if (targetError) setTargetError('');
                    }}
                    placeholder="Ví dụ: 10000000"
                    className="w-full rounded-2xl border border-[#F0C6D8] bg-[#FFFDFD] px-3.5 py-2.5 text-sm font-bold text-[#3D1A2B] font-mono-tabular focus:border-[#E11D64] focus:outline-none"
                  />
                  {monthlyDraft.trim() !== '' &&
                    Number.isFinite(Number(monthlyDraft)) &&
                    Number(monthlyDraft) >= 0 && (
                      <p className="mt-1.5 text-xs font-semibold text-[#7C5266] font-mono-tabular">
                        = {formatCurrencyVnd(Number(monthlyDraft))}
                      </p>
                    )}
                  {targetError && (
                    <p className="mt-1.5 text-xs font-semibold text-[#BE123C]">{targetError}</p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#F6C8DC]">
                  <button
                    type="button"
                    onClick={() => setIsTargetModalOpen(false)}
                    className="rounded-2xl border border-[#F5BDD6] bg-white px-4 py-2 text-xs font-bold text-[#7C5266] hover:bg-[#FFE3EE] cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={savingMonthly}
                    className="inline-flex items-center gap-1.5 rounded-2xl bg-[#E11D64] px-4 py-2 text-xs font-bold text-white hover:bg-[#BE185D] disabled:opacity-50 cursor-pointer"
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{savingMonthly ? 'Đang lưu...' : 'Lưu mục tiêu'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}
    </aside>
  );
}
