import { useEffect, useMemo, useState } from 'react';
import type { CompletionStatus, PlannerTask } from '../types/planner';
import {
  computeTaskLayoutLanes,
  formatCurrencyVnd,
  formatDurationLabel,
  formatSlotLabel,
  generateTimeSlots,
  getAvailableTimeRanges,
  getTaskColorTheme,
  getTasksForDate,
  getUpcomingDayTasks,
  STATUS_LABELS,
  summarizeIncome,
  timeToMinutes,
} from '../utils/schedule';
import {
  CalendarCheck2,
  CalendarOff,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  LayoutGrid,
  ListTodo,
  Pencil,
  Plus,
  X,
  XCircle,
} from 'lucide-react';

interface DayScheduleTableProps {
  selectedDate: string;
  tasks: PlannerTask[];
  onAddTaskAtSlot: (startTime: string, endTime?: string) => void;
  onEditTask: (task: PlannerTask) => void;
  onToggleTaskStatus: (task: PlannerTask, nextStatus: CompletionStatus) => void;
  onUpdateTaskIncome: (task: PlannerTask, nextIncome: number) => Promise<void>;
}

const SLOT_HEIGHT = 44; // px per 15-minute slot (176px / hour)

export function DayScheduleTable({
  selectedDate,
  tasks,
  onAddTaskAtSlot,
  onEditTask,
  onToggleTaskStatus,
  onUpdateTaskIncome,
}: DayScheduleTableProps) {
  const dayTasks = getTasksForDate(tasks, selectedDate);
  const summary = summarizeIncome(dayTasks);

  const [editingIncomeTaskId, setEditingIncomeTaskId] = useState<string | null>(null);
  const [incomeDraft, setIncomeDraft] = useState<string>('');
  const [savingIncomeTaskId, setSavingIncomeTaskId] = useState<string | null>(null);
  const [showAvailable, setShowAvailable] = useState<boolean>(false);
  const [dayViewMode, setDayViewMode] = useState<'task' | 'full'>('task');
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 15000);
    return () => window.clearInterval(timer);
  }, []);

  const upcomingState = useMemo(
    () => getUpcomingDayTasks(tasks, selectedDate, now),
    [tasks, selectedDate, now],
  );

  const availableRanges = useMemo(
    () => getAvailableTimeRanges(tasks, selectedDate),
    [tasks, selectedDate],
  );
  const totalAvailableMinutes = useMemo(
    () => availableRanges.reduce((sum, item) => sum + item.durationMinutes, 0),
    [availableRanges],
  );

  const timeSlots = useMemo(() => {
    const earliestMin = dayTasks.reduce((min, task) => {
      const m = timeToMinutes(task.startTime);
      return m >= 0 && m < min ? m : min;
    }, 6 * 60);
    const startHour = Math.max(0, Math.floor(earliestMin / 60));
    return generateTimeSlots(startHour, 24, 15);
  }, [dayTasks]);

  const gridStartMin = timeSlots[0]?.minutes ?? 360;
  const gridEndMin = (timeSlots[timeSlots.length - 1]?.minutes ?? 1425) + 15;
  const totalTimelineHeight = timeSlots.length * SLOT_HEIGHT;

  const positionedTasks = useMemo(
    () => computeTaskLayoutLanes(dayTasks, gridStartMin, gridEndMin),
    [dayTasks, gridStartMin, gridEndMin],
  );

  const incomeRows = useMemo(() => {
    let lastBottom = 0;
    return positionedTasks.map((item) => {
      const desiredTop = ((item.startMin - gridStartMin) / 15) * SLOT_HEIGHT + 4;
      const top = Math.max(desiredTop, lastBottom);
      lastBottom = top + 36;
      return {
        ...item,
        top,
      };
    });
  }, [positionedTasks, gridStartMin]);

  const startEditingIncome = (task: PlannerTask) => {
    setEditingIncomeTaskId(task.id);
    setIncomeDraft(String(task.income || 0));
  };

  const cancelEditingIncome = () => {
    setEditingIncomeTaskId(null);
    setIncomeDraft('');
  };

  const commitIncomeEdit = async (task: PlannerTask) => {
    if (editingIncomeTaskId !== task.id) return;
    const raw = incomeDraft.trim();
    const parsed = raw === '' ? 0 : Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      cancelEditingIncome();
      return;
    }
    const rounded = Math.round(parsed);
    setEditingIncomeTaskId(null);
    setIncomeDraft('');
    if (rounded === Math.round(task.income || 0)) {
      return;
    }
    setSavingIncomeTaskId(task.id);
    try {
      await onUpdateTaskIncome(task, rounded);
    } finally {
      setSavingIncomeTaskId(null);
    }
  };

  return (
    <div className="rounded-3xl border border-[#F5BDD6] bg-[#FFF8FB] overflow-hidden shadow-xs">
      {/* Top action bar */}
      <div className="flex flex-wrap items-center justify-end gap-2 border-b border-[#F5BDD6] bg-[#FFE3EE] px-4 py-3">
        <button
          type="button"
          onClick={() => setShowAvailable((prev) => !prev)}
          aria-expanded={showAvailable}
          className={`inline-flex items-center gap-1.5 rounded-2xl border px-3.5 py-1.5 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            showAvailable
              ? 'border-[#15803D] bg-[#15803D] text-white'
              : 'border-[#BBF7D0] bg-white text-[#15803D] hover:bg-[#F0FDF4]'
          }`}
        >
          <CalendarCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Available</span>
          <span className="font-mono-tabular opacity-85">({availableRanges.length})</span>
        </button>

        <button
          type="button"
          onClick={() => onAddTaskAtSlot('06:00')}
          className="inline-flex items-center gap-1.5 rounded-2xl bg-[#E11D64] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#BE185D] cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Thêm task nhanh</span>
        </button>

        <button
          type="button"
          onClick={() => setDayViewMode((prev) => (prev === 'task' ? 'full' : 'task'))}
          className="inline-flex items-center gap-1.5 rounded-2xl border border-[#F39EC1] bg-white px-3.5 py-1.5 text-xs font-bold text-[#9D174D] hover:bg-[#FFE3EE] transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          {dayViewMode === 'task' ? (
            <>
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Full view</span>
            </>
          ) : (
            <>
              <ListTodo className="h-3.5 w-3.5" aria-hidden="true" />
              <span>View task</span>
            </>
          )}
        </button>
      </div>

      {showAvailable && (
        <div
          aria-label="Khung giờ còn trống trong ngày"
          className="border-b border-[#F5BDD6] bg-[#F7FDF9] px-4 py-3.5 space-y-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold text-[#14532D]">
              Khung giờ còn trống (6h–24h):{' '}
              <span className="font-mono-tabular text-[#15803D]">
                {availableRanges.length} khoảng · {formatDurationLabel(totalAvailableMinutes)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowAvailable(false)}
              className="inline-flex items-center gap-1 rounded-xl border border-[#DCFCE7] bg-white px-2.5 py-1 text-[11px] font-bold text-[#166534] hover:bg-[#F0FDF4] cursor-pointer"
            >
              <X className="h-3 w-3" aria-hidden="true" />
              <span>Ẩn</span>
            </button>
          </div>

          {availableRanges.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#BBF7D0] bg-white px-3.5 py-3 text-xs font-semibold text-[#166534]">
              Không còn khung giờ trống nào trong ngày này (06:00–24:00 đã kín lịch).
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {availableRanges.map((range) => (
                <button
                  key={`${range.startTime}-${range.endTime}`}
                  type="button"
                  onClick={() => onAddTaskAtSlot(range.startTime, range.endTime)}
                  className="flex items-center justify-between gap-2 rounded-2xl border border-[#BBF7D0] bg-white px-3 py-2 text-left transition-colors hover:border-[#15803D] hover:bg-[#F0FDF4] cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-extrabold text-[#14532D] font-mono-tabular">
                      {range.startLabel} – {range.endLabel}
                    </div>
                    <div className="text-[11px] font-medium text-[#166534]">
                      Trống {range.durationLabel}
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#15803D] whitespace-nowrap shrink-0">
                    <Plus className="h-3 w-3" aria-hidden="true" />
                    <span>Đặt lịch</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {dayViewMode === 'task' ? (
        /* Mặc định: Hiển thị theo task tuần tự, qua khung giờ tự ẩn task cũ và đẩy task mới lên */
        <div className="bg-white p-4 sm:p-5 space-y-3">
          {upcomingState.visibleTasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#F5BDD6] bg-[#FFFDFD] px-4 py-10 text-center space-y-3">
              <p className="text-sm font-semibold text-[#7C5266]">
                {upcomingState.expiredCount > 0
                  ? `Tất cả ${upcomingState.expiredCount} task trong ngày này đã qua khung giờ.`
                  : 'Chưa có task nào trong ngày này.'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => onAddTaskAtSlot('06:00')}
                  className="inline-flex items-center gap-1.5 rounded-2xl bg-[#E11D64] px-4 py-2 text-xs font-bold text-white hover:bg-[#BE185D] cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Thêm task nhanh</span>
                </button>
                {upcomingState.expiredCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setDayViewMode('full')}
                    className="inline-flex items-center gap-1.5 rounded-2xl border border-[#F39EC1] bg-white px-4 py-2 text-xs font-bold text-[#9D174D] hover:bg-[#FFE3EE] cursor-pointer"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Mở Full view</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {upcomingState.visibleTasks.map((task, idx) => {
                const isOffTask = Boolean(task.isOff);
                const isAllDayTask =
                  Boolean(task.isAllDay) ||
                  (task.startTime === '06:00' && task.endTime === '24:00');
                const isDone = !isOffTask && task.status === 'completed';
                const nextStatus: CompletionStatus = isDone ? 'pending' : 'completed';
                const colorTheme = getTaskColorTheme(task.color, isOffTask);
                const timeRangeLabel = isAllDayTask
                  ? 'Cả ngày (6h–24h)'
                  : `${formatSlotLabel(task.startTime)}–${formatSlotLabel(task.endTime)}`;
                const isCurrentActive = task.id === upcomingState.activeTaskId;
                const isFirstItem = idx === 0;
                const isEditingIncome = !isOffTask && editingIncomeTaskId === task.id;
                const isSavingThis = savingIncomeTaskId === task.id;

                return (
                  <div
                    key={task.id}
                    data-task-card="true"
                    onClick={() => onEditTask(task)}
                    style={{
                      backgroundColor: colorTheme.hex,
                      border: `1.5px solid ${colorTheme.border}`,
                      color: colorTheme.text,
                    }}
                    className={`rounded-2xl px-4 py-3.5 transition-shadow hover:shadow-md cursor-pointer ${
                      isFirstItem ? 'shadow-sm' : ''
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        {isOffTask ? (
                          <CalendarOff
                            className="mt-0.5 h-5 w-5 shrink-0 text-[#18181B]"
                            aria-hidden="true"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleTaskStatus(task, nextStatus);
                            }}
                            aria-label={
                              isDone
                                ? `Đánh dấu chưa hoàn thành ${task.title}`
                                : `Đánh dấu hoàn thành ${task.title}`
                            }
                            className="mt-0.5 shrink-0 rounded-full p-0.5 hover:bg-white/60 cursor-pointer"
                          >
                            {isDone ? (
                              <CheckCircle2 className="h-5 w-5 text-[#15803D]" />
                            ) : task.status === 'in_progress' ? (
                              <Clock className="h-5 w-5 text-[#B45309]" />
                            ) : task.status === 'absent' ? (
                              <XCircle className="h-5 w-5 text-[#BE123C]" />
                            ) : (
                              <Circle className="h-5 w-5 text-[#7C5266]" />
                            )}
                          </button>
                        )}

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs opacity-85">
                            <span className="font-mono-tabular font-extrabold">
                              {timeRangeLabel}
                            </span>
                            {isFirstItem && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-bold text-[#9D174D]">
                                  {isCurrentActive ? 'Đang diễn ra' : 'Task tiếp theo'}
                                </span>
                              </>
                            )}
                            {!isOffTask && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span
                                  className={`font-bold ${
                                    task.status === 'completed'
                                      ? 'text-[#15803D]'
                                      : task.status === 'in_progress'
                                        ? 'text-[#B45309]'
                                        : task.status === 'absent'
                                          ? 'text-[#BE123C]'
                                          : 'text-[#5C4B54]'
                                  }`}
                                >
                                  {STATUS_LABELS[task.status]}
                                </span>
                              </>
                            )}
                          </div>

                          <div
                            className={`text-sm sm:text-base font-extrabold break-words ${
                              isDone ? 'line-through opacity-75' : ''
                            }`}
                          >
                            {isOffTask ? 'Off' : task.title}
                          </div>

                          {(task.lessonName || task.notes || task.link) && (
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs opacity-90">
                              {task.lessonName && (
                                <span className="font-bold text-[#5C4B54] break-words">
                                  Bài học: {task.lessonName}
                                </span>
                              )}
                              {task.notes && <span className="break-words">{task.notes}</span>}
                              {task.link && (
                                <a
                                  href={task.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 font-bold text-[#9D174D] hover:underline whitespace-nowrap"
                                >
                                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                                  <span>Mở link</span>
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div
                        className="flex items-center gap-2 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {!isOffTask && (
                          isEditingIncome ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min={0}
                                step={1000}
                                autoFocus
                                aria-label={`Nhập thu nhập cho ${task.title}`}
                                value={incomeDraft}
                                onChange={(e) => setIncomeDraft(e.target.value)}
                                onBlur={() => void commitIncomeEdit(task)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    void commitIncomeEdit(task);
                                  } else if (e.key === 'Escape') {
                                    e.preventDefault();
                                    cancelEditingIncome();
                                  }
                                }}
                                className="w-24 rounded-lg border border-[#E11D64] bg-white px-2 py-1 text-right text-xs font-bold text-[#3D1A2B] font-mono-tabular focus:outline-none"
                              />
                              <button
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  void commitIncomeEdit(task);
                                }}
                                aria-label={`Lưu thu nhập ${task.title}`}
                                className="rounded-lg bg-[#15803D] p-1 text-white hover:bg-[#166534] cursor-pointer"
                              >
                                <Check className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={isSavingThis}
                              onClick={() => startEditingIncome(task)}
                              className={`inline-flex items-center gap-1 rounded-xl bg-white/75 border border-black/10 px-2.5 py-1 text-xs font-bold font-mono-tabular hover:bg-white cursor-pointer ${
                                isDone ? 'text-[#15803D]' : 'text-[#5C4B54]'
                              }`}
                            >
                              <span>{isDone ? formatCurrencyVnd(task.income) : '—'}</span>
                            </button>
                          )
                        )}

                        <button
                          type="button"
                          onClick={() => onEditTask(task)}
                          aria-label={`Chỉnh sửa ${task.title}`}
                          className="inline-flex items-center gap-1 rounded-xl bg-white/80 border border-black/10 px-2.5 py-1 text-xs font-bold text-[#3D1A2B] hover:bg-white cursor-pointer"
                        >
                          <Pencil className="h-3 w-3" aria-hidden="true" />
                          <span>Sửa</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {upcomingState.expiredCount > 0 && (
                <div className="pt-1 text-xs font-medium text-[#7C5266] flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Đã ẩn <span className="font-mono-tabular font-bold">{upcomingState.expiredCount}</span> task đã qua khung giờ
                  </span>
                  <button
                    type="button"
                    onClick={() => setDayViewMode('full')}
                    className="font-bold text-[#9D174D] hover:underline cursor-pointer"
                  >
                    Xem giờ chi tiết (Full view)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Footer tổng hợp ngày */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#F5BDD6] bg-[#FFE3EE] px-4 py-2.5 text-xs sm:text-sm font-bold text-[#3D1A2B]">
            <span className="text-[#7C5266]">
              Tổng ngày: <span className="font-mono-tabular text-[#3D1A2B]">{dayTasks.length}</span> task · Xong{' '}
              <span className="font-mono-tabular text-[#3D1A2B]">
                {summary.completedCount}/{summary.totalCount}
              </span>
            </span>
            <span className="font-mono-tabular text-[#15803D]">
              {formatCurrencyVnd(summary.completed)}
            </span>
          </div>
        </div>
      ) : (
        /* Full view: Bảng giờ chi tiết từng 15 phút như Google Lịch */
        <div className="max-h-[680px] overflow-x-auto overflow-y-auto bg-white">
        <div className="min-w-[560px]">
          {/* Sticky column headers */}
          <div className="sticky top-0 z-20 grid grid-cols-[64px_1fr_132px] sm:grid-cols-[96px_1fr_176px] border-b border-[#F5BDD6] bg-[#FFDCEB] text-xs font-bold text-[#3D1A2B]">
            <div className="px-2 sm:px-4 py-3 border-r border-[#F5BDD6]">Giờ</div>
            <div className="px-2.5 sm:px-4 py-3 border-r border-[#F5BDD6]">Tasks &amp; Ghi chú</div>
            <div className="px-2 sm:px-4 py-3 text-right">Thu nhập</div>
          </div>

          {/* Synchronized 3-column timeline grid */}
          <div className="grid grid-cols-[64px_1fr_132px] sm:grid-cols-[96px_1fr_176px]">
            {/* Column 1: Giờ */}
            <div className="border-r border-[#F6C8DC]">
              {timeSlots.map((slot) => {
                const isHourMark = slot.minutes % 60 === 0;
                return (
                  <div
                    key={slot.time}
                    style={{ height: `${SLOT_HEIGHT}px` }}
                    className={`px-2 sm:px-4 flex items-center border-b font-mono-tabular text-xs whitespace-nowrap ${
                      isHourMark
                        ? 'border-[#F0C6D8] font-bold text-[#3D1A2B] bg-white'
                        : 'border-[#F6DCE7] font-medium text-[#7C5266] bg-[#FFFDFD]'
                    }`}
                  >
                    {slot.label}
                  </div>
                );
              })}
            </div>

            {/* Column 2: Spanning task blocks (Google Calendar style) */}
            <div
              className="relative border-r border-[#F6C8DC] min-w-0"
              style={{ height: `${totalTimelineHeight}px` }}
            >
              {/* Background 15-min clickable slot grid */}
              {timeSlots.map((slot) => {
                const isHourMark = slot.minutes % 60 === 0;
                return (
                  <button
                    key={slot.time}
                    type="button"
                    onClick={() => onAddTaskAtSlot(slot.time)}
                    aria-label={`Thêm task lúc ${slot.label}`}
                    style={{ height: `${SLOT_HEIGHT}px` }}
                    className={`group w-full px-2 sm:px-4 flex items-center gap-1 border-b text-left text-xs transition-colors cursor-pointer ${
                      isHourMark
                        ? 'border-[#F0C6D8] bg-white hover:bg-[#FFF4F8]'
                        : 'border-[#F6DCE7] bg-[#FFFDFD] hover:bg-[#FFF4F8]'
                    }`}
                  >
                    <Plus
                      className="h-3.5 w-3.5 shrink-0 text-transparent group-hover:text-[#9D174D] group-focus:text-[#9D174D] transition-colors"
                      aria-hidden="true"
                    />
                    <span className="truncate text-transparent group-hover:text-[#9D174D] group-focus:text-[#9D174D] transition-colors">
                      Thêm task lúc {slot.label}
                    </span>
                  </button>
                );
              })}

              {/* Spanning pastel task cards */}
              <div className="pointer-events-none absolute inset-0 z-10">
                {positionedTasks.map(({ task, startMin, endMin, lane, totalLanes }) => {
                  const durationMinutes = endMin - startMin;
                  const topPx = ((startMin - gridStartMin) / 15) * SLOT_HEIGHT + 2;
                  const heightPx = Math.max(
                    SLOT_HEIGHT - 4,
                    (durationMinutes / 15) * SLOT_HEIGHT - 4,
                  );
                  const isCompact = heightPx < 66;
                  const isMedium = heightPx >= 66 && heightPx < 104;
                  const isOffTask = Boolean(task.isOff);
                  const isAllDayTask =
                    Boolean(task.isAllDay) ||
                    (task.startTime === '06:00' && task.endTime === '24:00');
                  const isDone = !isOffTask && task.status === 'completed';
                  const nextStatus: CompletionStatus = isDone ? 'pending' : 'completed';
                  const colorTheme = getTaskColorTheme(task.color, isOffTask);
                  const timeRangeLabel = isAllDayTask
                    ? 'Cả ngày (6h–24h)'
                    : `${formatSlotLabel(task.startTime)}–${formatSlotLabel(task.endTime)}`;

                  const leftExpr = `calc(${(lane / totalLanes) * 100}% + 4px)`;
                  const widthExpr = `calc(${(1 / totalLanes) * 100}% - 8px)`;

                  return (
                    <div
                      key={task.id}
                      data-task-card="true"
                      onClick={() => onEditTask(task)}
                      style={{
                        top: `${topPx}px`,
                        height: `${heightPx}px`,
                        left: leftExpr,
                        width: widthExpr,
                        backgroundColor: colorTheme.hex,
                        border: `1.5px solid ${colorTheme.border}`,
                        color: colorTheme.text,
                      }}
                      className="pointer-events-auto absolute rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition-shadow cursor-pointer"
                    >
                      {isCompact ? (
                        /* Single-slot (<=15m) compact layout */
                        <div className="flex h-full items-center justify-between gap-2 px-2.5">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            {isOffTask ? (
                              <CalendarOff className="h-4 w-4 shrink-0 text-[#18181B]" aria-hidden="true" />
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleTaskStatus(task, nextStatus);
                                }}
                                aria-label={
                                  isDone
                                    ? `Đánh dấu chưa hoàn thành ${task.title}`
                                    : `Đánh dấu hoàn thành ${task.title}`
                                }
                                className="shrink-0 rounded-full p-0.5 hover:bg-white/50 cursor-pointer"
                              >
                                {isDone ? (
                                  <CheckCircle2 className="h-4 w-4 text-[#15803D]" />
                                ) : task.status === 'in_progress' ? (
                                  <Clock className="h-4 w-4 text-[#B45309]" />
                                ) : task.status === 'absent' ? (
                                  <XCircle className="h-4 w-4 text-[#BE123C]" />
                                ) : (
                                  <Circle className="h-4 w-4 text-[#7C5266]" />
                                )}
                              </button>
                            )}

                            <span
                              className={`font-bold text-xs truncate ${
                                isDone ? 'line-through opacity-75' : ''
                              }`}
                            >
                              {isOffTask ? 'Off' : task.title}
                            </span>

                            <span className="text-[11px] opacity-80 font-mono-tabular whitespace-nowrap shrink-0">
                              {timeRangeLabel}
                            </span>

                            {!isOffTask && (
                              <span
                                className={`hidden sm:inline text-[11px] font-bold whitespace-nowrap shrink-0 ${
                                  task.status === 'completed'
                                    ? 'text-[#15803D]'
                                    : task.status === 'in_progress'
                                      ? 'text-[#B45309]'
                                      : task.status === 'absent'
                                        ? 'text-[#BE123C]'
                                        : 'text-[#5C4B54]'
                                }`}
                              >
                                · {STATUS_LABELS[task.status]}
                              </span>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditTask(task);
                            }}
                            aria-label={`Chỉnh sửa ${task.title}`}
                            className="inline-flex items-center gap-1 rounded-lg bg-white/75 border border-black/10 px-2 py-0.5 text-[11px] font-bold text-[#3D1A2B] hover:bg-white cursor-pointer shrink-0"
                          >
                            <Pencil className="h-3 w-3" aria-hidden="true" />
                            <span>Sửa</span>
                          </button>
                        </div>
                      ) : (
                        /* Multi-slot (>=30m) Google Calendar spanning card */
                        <div className="flex h-full flex-col justify-between px-3 py-2 overflow-hidden">
                          <div className="flex items-start justify-between gap-2 min-h-0">
                            <div className="flex items-start gap-2 min-w-0 flex-1">
                              {isOffTask ? (
                                <CalendarOff className="mt-0.5 h-4 w-4 shrink-0 text-[#18181B]" aria-hidden="true" />
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleTaskStatus(task, nextStatus);
                                  }}
                                  aria-label={
                                    isDone
                                      ? `Đánh dấu chưa hoàn thành ${task.title}`
                                      : `Đánh dấu hoàn thành ${task.title}`
                                  }
                                  className="mt-0.5 shrink-0 rounded-full p-0.5 hover:bg-white/50 cursor-pointer"
                                >
                                  {isDone ? (
                                    <CheckCircle2 className="h-4 w-4 text-[#15803D]" />
                                  ) : task.status === 'in_progress' ? (
                                    <Clock className="h-4 w-4 text-[#B45309]" />
                                  ) : task.status === 'absent' ? (
                                    <XCircle className="h-4 w-4 text-[#BE123C]" />
                                  ) : (
                                    <Circle className="h-4 w-4 text-[#7C5266]" />
                                  )}
                                </button>
                              )}

                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                  <span
                                    className={`font-bold text-xs sm:text-sm break-words ${
                                      isDone ? 'line-through opacity-75' : ''
                                    }`}
                                  >
                                    {isOffTask ? 'Off' : task.title}
                                  </span>
                                  <span className="text-[11px] sm:text-xs opacity-85 font-mono-tabular whitespace-nowrap">
                                    {timeRangeLabel}
                                  </span>
                                  {!isOffTask && (
                                    <>
                                      <span aria-hidden="true" className="opacity-45">
                                        ·
                                      </span>
                                      <span
                                        className={`text-[11px] sm:text-xs font-bold whitespace-nowrap ${
                                          task.status === 'completed'
                                            ? 'text-[#15803D]'
                                            : task.status === 'in_progress'
                                              ? 'text-[#B45309]'
                                              : task.status === 'absent'
                                                ? 'text-[#BE123C]'
                                                : 'text-[#5C4B54]'
                                        }`}
                                      >
                                        {STATUS_LABELS[task.status]}
                                      </span>
                                    </>
                                  )}
                                </div>

                                {(task.lessonName || task.notes || task.link) && (
                                  <div
                                    className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs opacity-90 ${
                                      isMedium ? 'line-clamp-1' : 'line-clamp-3'
                                    }`}
                                  >
                                    {task.lessonName && (
                                      <span className="font-bold text-[#5C4B54] break-words">
                                        Bài học: {task.lessonName}
                                      </span>
                                    )}
                                    {task.notes && <span className="break-words">{task.notes}</span>}
                                    {task.link && (
                                      <a
                                        href={task.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="inline-flex items-center gap-1 font-bold text-[#9D174D] hover:underline whitespace-nowrap"
                                      >
                                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                                        <span>Mở link</span>
                                      </a>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditTask(task);
                              }}
                              aria-label={`Chỉnh sửa ${task.title}`}
                              className="self-start inline-flex items-center gap-1 rounded-xl bg-white/80 border border-black/10 px-2.5 py-1 text-xs font-bold text-[#3D1A2B] hover:bg-white cursor-pointer shrink-0"
                            >
                              <Pencil className="h-3 w-3" aria-hidden="true" />
                              <span>Sửa</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Column 3: Thu nhập - căn theo vị trí bắt đầu từng task */}
            <div
              className="relative font-mono-tabular text-[11px] sm:text-sm whitespace-nowrap"
              style={{ height: `${totalTimelineHeight}px` }}
            >
              {/* Matching background slot gridlines */}
              {timeSlots.map((slot) => {
                const isHourMark = slot.minutes % 60 === 0;
                return (
                  <div
                    key={slot.time}
                    style={{ height: `${SLOT_HEIGHT}px` }}
                    className={`border-b ${
                      isHourMark ? 'border-[#F0C6D8] bg-white' : 'border-[#F6DCE7] bg-[#FFFDFD]'
                    }`}
                  />
                );
              })}

              {/* Editable income rows aligned to each spanning task */}
              <div className="pointer-events-none absolute inset-0 z-10">
                {incomeRows.map(({ task, top }) => {
                  const isOffTask = Boolean(task.isOff);
                  const isDone = !isOffTask && task.status === 'completed';
                  const isEditing = !isOffTask && editingIncomeTaskId === task.id;
                  const isSavingThis = savingIncomeTaskId === task.id;
                  const colorTheme = getTaskColorTheme(task.color, isOffTask);

                  if (isEditing) {
                    return (
                      <div
                        key={`${task.id}-inc`}
                        style={{ top: `${top}px`, height: '36px' }}
                        className="pointer-events-auto absolute left-1 right-1 sm:left-2 sm:right-2 flex items-center justify-end gap-1"
                      >
                        <input
                          type="number"
                          min={0}
                          step={1000}
                          autoFocus
                          aria-label={`Nhập thu nhập cho ${task.title}`}
                          value={incomeDraft}
                          onChange={(e) => setIncomeDraft(e.target.value)}
                          onBlur={() => void commitIncomeEdit(task)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void commitIncomeEdit(task);
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              cancelEditingIncome();
                            }
                          }}
                          className="w-20 sm:w-24 rounded-lg border border-[#E11D64] bg-white px-2 py-1 text-right text-xs font-bold text-[#3D1A2B] font-mono-tabular focus:outline-none focus:ring-2 focus:ring-[#E11D64]/20"
                        />
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            void commitIncomeEdit(task);
                          }}
                          aria-label={`Lưu thu nhập ${task.title}`}
                          className="rounded-lg bg-[#15803D] p-1 text-white hover:bg-[#166534] cursor-pointer shrink-0"
                        >
                          <Check className="h-3 w-3" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            cancelEditingIncome();
                          }}
                          aria-label={`Hủy chỉnh sửa thu nhập ${task.title}`}
                          className="rounded-lg border border-[#F5BDD6] bg-white p-1 text-[#7C5266] hover:bg-[#FFE3EE] cursor-pointer shrink-0"
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </div>
                    );
                  }

                  if (isOffTask) {
                    return (
                      <div
                        key={`${task.id}-inc`}
                        style={{ top: `${top}px`, height: '36px' }}
                        className="pointer-events-auto absolute left-1 right-1 sm:left-2 sm:right-2 flex items-center justify-end"
                      >
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-semibold text-[#6B7280]">
                          <span
                            aria-hidden="true"
                            className="h-2.5 w-2.5 rounded-sm border shrink-0"
                            style={{
                              backgroundColor: colorTheme.hex,
                              borderColor: colorTheme.border,
                            }}
                          />
                          <span>Off</span>
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={`${task.id}-inc`}
                      style={{ top: `${top}px`, height: '36px' }}
                      className="pointer-events-auto absolute left-1 right-1 sm:left-2 sm:right-2 flex items-center justify-end"
                    >
                      <button
                        type="button"
                        disabled={isSavingThis}
                        onClick={() => startEditingIncome(task)}
                        aria-label={`Chỉnh sửa thu nhập ${task.title}`}
                        title={
                          isDone
                            ? `${task.title} — Bấm để chỉnh sửa thu nhập`
                            : `${task.title} — Bấm để chỉnh sửa thu nhập (chỉ hiển thị khi Hoàn thành)`
                        }
                        className={`inline-flex items-center gap-1.5 rounded-xl px-2 py-1 font-bold transition-colors cursor-pointer hover:bg-[#FFE3EE] disabled:opacity-50 ${
                          isDone ? 'text-[#15803D]' : 'text-[#B48EA0]'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className="h-2.5 w-2.5 rounded-sm border shrink-0"
                          style={{
                            backgroundColor: colorTheme.hex,
                            borderColor: colorTheme.border,
                          }}
                        />
                        <span>{isDone ? formatCurrencyVnd(task.income) : '—'}</span>
                        <Pencil className="h-3 w-3 opacity-60 shrink-0" aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sticky footer */}
          <div className="sticky bottom-0 z-20 grid grid-cols-[64px_1fr_132px] sm:grid-cols-[96px_1fr_176px] border-t border-[#F5BDD6] bg-[#FFE3EE] text-xs sm:text-sm font-bold text-[#3D1A2B]">
            <div className="px-2 sm:px-4 py-3 border-r border-[#F5BDD6]">Tổng</div>
            <div className="px-2.5 sm:px-4 py-3 border-r border-[#F5BDD6] text-xs font-semibold text-[#7C5266]">
              {dayTasks.length} task · Xong {summary.completedCount}/{summary.totalCount}
            </div>
            <div className="px-2 sm:px-4 py-3 text-right font-mono-tabular text-[#15803D] whitespace-nowrap">
              {formatCurrencyVnd(summary.completed)}
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
