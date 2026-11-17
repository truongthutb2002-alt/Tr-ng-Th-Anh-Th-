import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CalendarViewMode } from '../types/planner';
import { addMonths, getMonthGrid, parseDateKey, toDateKey } from '../utils/schedule';
import { Calendar, ChevronLeft, ChevronRight, NotebookPen, Plus } from 'lucide-react';

interface WorkspaceToolbarProps {
  viewMode: CalendarViewMode;
  onChangeView: (mode: CalendarViewMode) => void;
  selectedDate: string;
  onSelectDate?: (dateKey: string) => void;
  onOpenAddTodo?: () => void;
  onOpenNotes?: () => void;
  dayNotesCount?: number;
  onPrevPeriod: () => void;
  onNextPeriod: () => void;
  onToday: () => void;
  completedCount: number;
  totalCount: number;
}

const MINI_WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function formatDateHeading(viewMode: CalendarViewMode, dateKey: string): string {
  if (viewMode === 'tuition') {
    return 'Quản lý thu nhập';
  }
  const date = parseDateKey(dateKey);
  if (viewMode === 'month') {
    return date.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
  }
  if (viewMode === 'week') {
    return `Tuần ngày ${date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
  }
  if (viewMode === 'todo') {
    return `To Do List · ${date.toLocaleDateString('vi-VN', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })}`;
  }
  return date.toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function WorkspaceToolbar({
  viewMode,
  onChangeView,
  selectedDate,
  onSelectDate,
  onOpenAddTodo,
  onOpenNotes,
  dayNotesCount = 0,
  onPrevPeriod,
  onNextPeriod,
  onToday,
  completedCount,
  totalCount,
}: WorkspaceToolbarProps) {
  const isTuitionMode = viewMode === 'tuition';
  const isTodoMode = viewMode === 'todo';

  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarMonthKey, setCalendarMonthKey] = useState(selectedDate);
  const calendarContainerRef = useRef<HTMLDivElement | null>(null);
  const calendarDialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCalendarMonthKey(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    if (!isTodoMode) {
      setIsCalendarOpen(false);
    }
  }, [isTodoMode]);

  useEffect(() => {
    if (!isCalendarOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        calendarContainerRef.current &&
        !calendarContainerRef.current.contains(target) &&
        (!calendarDialogRef.current || !calendarDialogRef.current.contains(target))
      ) {
        setIsCalendarOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsCalendarOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCalendarOpen]);

  const todayKey = toDateKey(new Date());
  const miniCalendarCells = useMemo(() => getMonthGrid(calendarMonthKey), [calendarMonthKey]);
  const calendarHeaderLabel = useMemo(() => {
    const d = parseDateKey(calendarMonthKey);
    return `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`;
  }, [calendarMonthKey]);

  return (
    <section
      aria-label="Thanh điều khiển lịch"
      className="border-b border-[#F5BDD6] bg-[#FFF0F6]"
    >
      <div className="mx-auto max-w-[1440px] px-4 py-3.5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold capitalize text-[#3D1A2B] text-balance">
              {formatDateHeading(viewMode, selectedDate)}
            </h1>
            {!isTuitionMode && (
              <div className="inline-flex items-center rounded-2xl border border-[#F5BDD6] bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={onPrevPeriod}
                  aria-label="Kỳ trước"
                  className="p-2 text-[#7C5266] hover:bg-[#FFE3EE] hover:text-[#3D1A2B] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D64]"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={onToday}
                  className="border-x border-[#F5BDD6] px-3 py-1.5 text-xs font-bold text-[#3D1A2B] hover:bg-[#FFE3EE] cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D64]"
                >
                  Hôm nay
                </button>
                <button
                  type="button"
                  onClick={onNextPeriod}
                  aria-label="Kỳ sau"
                  className="p-2 text-[#7C5266] hover:bg-[#FFE3EE] hover:text-[#3D1A2B] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D64]"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Segmented mode control: To Do List -> Ngày -> Tuần -> Tháng -> Thu nhập */}
            <div
              role="group"
              aria-label="Chọn chế độ lịch"
              className="inline-flex flex-wrap items-center rounded-2xl border border-[#F5BDD6] bg-white p-1"
            >
              {(['todo', 'day', 'week', 'month', 'tuition'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onChangeView(mode)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                    viewMode === mode
                      ? 'bg-[#FFD6E7] text-[#9D174D]'
                      : 'text-[#7C5266] hover:text-[#3D1A2B]'
                  }`}
                >
                  {mode === 'todo'
                    ? 'To Do List'
                    : mode === 'day'
                      ? 'Ngày'
                      : mode === 'week'
                        ? 'Tuần'
                        : mode === 'month'
                          ? 'Tháng'
                          : 'Thu nhập'}
                </button>
              ))}
            </div>
          </div>

          {!isTuitionMode && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {isTodoMode && onOpenAddTodo && (
                <button
                  type="button"
                  onClick={onOpenAddTodo}
                  className="inline-flex items-center gap-1.5 rounded-2xl bg-[#E11D64] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#BE185D] cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Thêm việc</span>
                </button>
              )}

              {isTodoMode && onSelectDate && (
                <div ref={calendarContainerRef} className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setCalendarMonthKey(selectedDate);
                      setIsCalendarOpen((prev) => !prev);
                    }}
                    aria-expanded={isCalendarOpen}
                    aria-label="Mở lịch chọn ngày"
                    title="Chọn ngày trên lịch"
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-2xl border transition-colors cursor-pointer ${
                      isCalendarOpen
                        ? 'border-[#E11D64] bg-[#E11D64] text-white'
                        : 'border-[#F5BDD6] bg-white text-[#9D174D] hover:bg-[#FFE3EE]'
                    }`}
                  >
                    <Calendar className="h-4 w-4" aria-hidden="true" />
                  </button>

                  {isCalendarOpen &&
                    typeof document !== 'undefined' &&
                    createPortal(
                      <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-[#3D1A2B]/40 p-4 backdrop-blur-[2px]"
                        onMouseDown={(e) => {
                          if (e.target === e.currentTarget) {
                            setIsCalendarOpen(false);
                          }
                        }}
                      >
                        <div
                          ref={calendarDialogRef}
                          role="dialog"
                          aria-modal="true"
                          aria-label="Lịch chọn ngày"
                          className="mx-auto w-full max-w-[320px] rounded-3xl border border-[#F5BDD6] bg-white p-4 shadow-xl space-y-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => setCalendarMonthKey((m) => addMonths(m, -1))}
                              aria-label="Tháng trước"
                              className="rounded-lg p-1.5 text-[#7C5266] hover:bg-[#FFE3EE] hover:text-[#3D1A2B] cursor-pointer"
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </button>
                            <span className="text-sm font-extrabold text-[#3D1A2B] whitespace-nowrap">
                              {calendarHeaderLabel}
                            </span>
                            <button
                              type="button"
                              onClick={() => setCalendarMonthKey((m) => addMonths(m, 1))}
                              aria-label="Tháng sau"
                              className="rounded-lg p-1.5 text-[#7C5266] hover:bg-[#FFE3EE] hover:text-[#3D1A2B] cursor-pointer"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-[#7C5266]">
                            {MINI_WEEKDAYS.map((dayLabel) => (
                              <div key={dayLabel} className="py-1">
                                {dayLabel}
                              </div>
                            ))}
                          </div>

                          <div className="grid grid-cols-7 gap-1">
                            {miniCalendarCells.map((cell) => {
                              const isSelectedCell = cell.dateKey === selectedDate;
                              const isTodayCell = cell.dateKey === todayKey;
                              return (
                                <button
                                  key={cell.dateKey}
                                  type="button"
                                  onClick={() => {
                                    onSelectDate(cell.dateKey);
                                    setIsCalendarOpen(false);
                                  }}
                                  className={`h-9 rounded-xl text-xs font-bold font-mono-tabular transition-colors cursor-pointer ${
                                    isSelectedCell
                                      ? 'bg-[#E11D64] text-white'
                                      : isTodayCell
                                        ? 'border border-[#E11D64] bg-[#FFE3EE] text-[#9D174D]'
                                        : cell.inCurrentMonth
                                          ? 'text-[#3D1A2B] hover:bg-[#FFF0F6]'
                                          : 'text-[#B48EA0] hover:bg-[#FFF8FB]'
                                  }`}
                                >
                                  {cell.dayOfMonth}
                                </button>
                              );
                            })}
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-[#F6C8DC]">
                            <button
                              type="button"
                              onClick={() => {
                                onSelectDate(todayKey);
                                setIsCalendarOpen(false);
                              }}
                              className="rounded-xl px-3 py-1.5 text-xs font-bold text-[#9D174D] hover:bg-[#FFE3EE] cursor-pointer"
                            >
                              Hôm nay
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsCalendarOpen(false)}
                              className="rounded-xl px-3 py-1.5 text-xs font-bold text-[#7C5266] hover:bg-[#FFF0F6] cursor-pointer"
                            >
                              Đóng
                            </button>
                          </div>
                        </div>
                      </div>,
                      document.body,
                    )}
                </div>
              )}

              {onOpenNotes && (
                <button
                  type="button"
                  onClick={onOpenNotes}
                  aria-label="Mở bảng ghi chú theo ngày"
                  title="Ghi chú theo ngày"
                  className="relative inline-flex h-8 w-8 items-center justify-center rounded-2xl border border-[#F5BDD6] bg-white text-[#9D174D] transition-colors hover:bg-[#FFE3EE] cursor-pointer"
                >
                  <NotebookPen className="h-4 w-4" aria-hidden="true" />
                  {dayNotesCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#E11D64] px-1 text-[9px] font-extrabold text-white font-mono-tabular">
                      {dayNotesCount > 9 ? '9+' : dayNotesCount}
                    </span>
                  )}
                </button>
              )}

              <div className="inline-flex items-center gap-2 rounded-2xl border border-[#F5BDD6] bg-white px-3.5 py-1.5 text-xs font-bold text-[#7C5266] whitespace-nowrap">
                <span>Tiến độ công việc:</span>
                <span className="text-[#3D1A2B] font-mono-tabular">
                  {completedCount}/{totalCount} {isTodoMode ? 'việc' : 'task'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
