import { useMemo, useState } from 'react';
import type { IncomeEntry, IncomeInput, IncomeReceivedStatus, PlannerTask } from '../types/planner';
import {
  formatCurrencyVnd,
  getIncomesForMonth,
  getMatchingTaskIncomeForMonth,
  getMonthKey,
  INCOME_STATUS_LABELS,
  syncWorkspaceIncomesWithTasks,
  validateIncomeInput,
} from '../utils/schedule';
import { CheckCircle2, Circle, Plus, RefreshCw, Trash2 } from 'lucide-react';

interface IncomeCategoriesBoxProps {
  selectedDate: string;
  tasks: PlannerTask[];
  incomes: IncomeEntry[];
  onAddIncome: (input: IncomeInput) => Promise<void>;
  onToggleIncomeStatus: (entry: IncomeEntry, nextStatus: IncomeReceivedStatus) => Promise<void>;
  onDeleteIncome: (incomeId: string) => Promise<void>;
}

export function IncomeCategoriesBox({
  selectedDate,
  tasks,
  incomes,
  onAddIncome,
  onToggleIncomeStatus,
  onDeleteIncome,
}: IncomeCategoriesBoxProps) {
  const activeMonth = getMonthKey(selectedDate);
  const syncedIncomes = useMemo(
    () => syncWorkspaceIncomesWithTasks(tasks, incomes),
    [tasks, incomes],
  );
  const monthIncomes = getIncomesForMonth(syncedIncomes, selectedDate);

  const [isAdding, setIsAdding] = useState(false);
  const [sourceName, setSourceName] = useState('');
  const [amount, setAmount] = useState('');
  const [receivedStatus, setReceivedStatus] = useState<IncomeReceivedStatus>('unreceived');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const matchingTaskInfo = useMemo(
    () => getMatchingTaskIncomeForMonth(tasks, activeMonth, sourceName),
    [tasks, activeMonth, sourceName],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: IncomeInput = {
      month: activeMonth,
      sourceName: sourceName.trim(),
      amount: matchingTaskInfo.hasMatch
        ? matchingTaskInfo.completedTotal
        : amount.trim() === ''
          ? 0
          : Number(amount),
      receivedStatus,
    };

    const validation = validateIncomeInput(payload);
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }

    setIsSubmitting(true);
    setErrors({});
    try {
      await onAddIncome(payload);
      setSourceName('');
      setAmount('');
      setReceivedStatus('unreceived');
      setIsAdding(false);
    } catch (err) {
      setErrors({
        submit: err instanceof Error ? err.message : 'Không thể lưu nguồn thu.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section
      aria-label="Danh mục thu nhập"
      className="rounded-3xl border border-[#F5BDD6] bg-[#FFF8FB] overflow-hidden shadow-xs"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-[#F5BDD6] bg-[#FFE3EE] px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-[#3D1A2B]">Danh mục thu nhập</h2>
          <p className="text-xs text-[#7C5266]">Tháng {activeMonth.split('-').reverse().join('/')}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setIsAdding((prev) => !prev);
            setErrors({});
          }}
          className="inline-flex items-center gap-1 rounded-xl bg-[#E11D64] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#BE185D] transition-colors cursor-pointer whitespace-nowrap"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{isAdding ? 'Đóng' : 'Thêm nguồn thu'}</span>
        </button>
      </div>

      {/* Inline Add Form */}
      {isAdding && (
        <form
          onSubmit={handleSubmit}
          className="border-b border-[#F5BDD6] bg-white p-3.5 space-y-2.5"
        >
          {errors.submit && (
            <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3 py-1.5 text-xs text-[#BE123C]">
              {errors.submit}
            </div>
          )}
          <div>
            <label htmlFor="income-source-name" className="block text-xs font-bold text-[#3D1A2B] mb-1">
              Tên nguồn thu <span className="text-[#E11D64]">*</span>
            </label>
            <input
              id="income-source-name"
              type="text"
              value={sourceName}
              onChange={(e) => {
                setSourceName(e.target.value);
                if (errors.sourceName) setErrors((p) => ({ ...p, sourceName: '' }));
              }}
              placeholder="Ví dụ: Lương, Bán hàng, Thưởng..."
              className="w-full rounded-xl border border-[#F5BDD6] bg-[#FFFDFD] px-3 py-1.5 text-sm text-[#3D1A2B] focus:border-[#E11D64] focus:outline-none"
            />
            {errors.sourceName && <p className="mt-1 text-xs text-[#BE123C]">{errors.sourceName}</p>}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label htmlFor="income-amount" className="block text-xs font-bold text-[#3D1A2B] mb-1">
                Số tiền (VNĐ)
              </label>
              <input
                id="income-amount"
                type="number"
                min={0}
                step={1000}
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  if (errors.amount) setErrors((p) => ({ ...p, amount: '' }));
                }}
                placeholder="500000"
                className="w-full rounded-xl border border-[#F5BDD6] bg-[#FFFDFD] px-3 py-1.5 text-sm text-[#3D1A2B] font-mono-tabular focus:border-[#E11D64] focus:outline-none"
              />
              {errors.amount && <p className="mt-1 text-xs text-[#BE123C]">{errors.amount}</p>}
            </div>

            <div>
              <label htmlFor="income-status" className="block text-xs font-bold text-[#3D1A2B] mb-1">
                Tình trạng thu
              </label>
              <select
                id="income-status"
                value={receivedStatus}
                onChange={(e) => setReceivedStatus(e.target.value as IncomeReceivedStatus)}
                className="w-full rounded-xl border border-[#F5BDD6] bg-[#FFFDFD] px-2.5 py-1.5 text-sm text-[#3D1A2B] focus:border-[#E11D64] focus:outline-none"
              >
                <option value="unreceived">Chưa thu</option>
                <option value="received">Đã thu</option>
              </select>
            </div>
          </div>

          {matchingTaskInfo.hasMatch && (
            <div className="rounded-xl border border-[#F5BDD6] bg-[#FFF4F8] px-3 py-1.5 text-[11px] font-semibold text-[#9D174D] flex items-center gap-1.5">
              <RefreshCw className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span>
                Trùng tên task trong tháng — tự động đồng bộ{' '}
                <strong className="font-mono-tabular">
                  {formatCurrencyVnd(matchingTaskInfo.completedTotal)}
                </strong>{' '}
                ({matchingTaskInfo.taskCount} task).
              </span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="rounded-xl border border-[#F5BDD6] px-3 py-1.5 text-xs font-semibold text-[#7C5266] hover:bg-[#FFE3EE] cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-[#E11D64] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#BE185D] cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'Đang lưu...' : 'Lưu nguồn thu'}
            </button>
          </div>
        </form>
      )}

      {/* List */}
      <div className="max-h-[480px] overflow-y-auto p-3 space-y-2">
        {monthIncomes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#F5BDD6] bg-white p-4 text-center text-xs text-[#7C5266]">
            Chưa có nguồn thu nào trong tháng này. Bấm &ldquo;Thêm nguồn thu&rdquo; để lưu lại nhé!
          </div>
        ) : (
          monthIncomes.map((entry) => {
            const isReceived = entry.receivedStatus === 'received';
            const nextStatus: IncomeReceivedStatus = isReceived ? 'unreceived' : 'received';

            return (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-2 rounded-2xl border border-[#F6C8DC] bg-white px-3 py-2.5"
              >
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => onToggleIncomeStatus(entry, nextStatus)}
                    aria-label={
                      isReceived
                        ? `Đánh dấu chưa thu ${entry.sourceName}`
                        : `Đánh dấu đã thu ${entry.sourceName}`
                    }
                    className="mt-0.5 shrink-0 cursor-pointer"
                  >
                    {isReceived ? (
                      <CheckCircle2 className="h-4 w-4 text-[#15803D]" />
                    ) : (
                      <Circle className="h-4 w-4 text-[#E11D64]" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs sm:text-sm font-bold text-[#3D1A2B]">
                      {entry.sourceName}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="font-bold font-mono-tabular text-[#3D1A2B]">
                        {formatCurrencyVnd(entry.amount)}
                      </span>
                      <span aria-hidden="true" className="text-[#C7A1B3]">·</span>
                      <button
                        type="button"
                        onClick={() => onToggleIncomeStatus(entry, nextStatus)}
                        className={`font-bold cursor-pointer hover:underline ${
                          isReceived ? 'text-[#15803D]' : 'text-[#B45309]'
                        }`}
                      >
                        {INCOME_STATUS_LABELS[entry.receivedStatus]}
                      </button>
                      {entry.syncedFromTasks && (
                        <>
                          <span aria-hidden="true" className="text-[#C7A1B3]">·</span>
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#9D174D]">
                            <RefreshCw className="h-2.5 w-2.5" aria-hidden="true" />
                            Đồng bộ từ lịch
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onDeleteIncome(entry.id)}
                  aria-label={`Xóa nguồn thu ${entry.sourceName}`}
                  className="rounded-xl p-1.5 text-[#B48EA0] hover:bg-[#FFF1F2] hover:text-[#BE123C] cursor-pointer shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
