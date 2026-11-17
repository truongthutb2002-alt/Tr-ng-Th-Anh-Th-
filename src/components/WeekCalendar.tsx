import { useEffect, useRef } from 'react';
import type { PlannerTask } from '../types/planner';
import {
  formatCurrencyVnd,
  formatSlotLabel,
  getTaskColorTheme,
  getTasksForDate,
  getWeekDates,
  parseDateKey,
  STATUS_LABELS,
  summarizeIncome,
  toDateKey,
} from '../utils/schedule';
import { CalendarDays, ExternalLink, Plus } from 'lucide-react';

interface WeekCalendarProps {
  selectedDate: string;
  tasks: PlannerTask[];
  onSelectDay: (dateKey: string) => void;
  onAddTaskForDate: (dateKey: string) => void;
  onEditTask: (task: PlannerTask) => void;
}

export function WeekCalendar({
  selectedDate,
  tasks,
  onSelectDay,
  onAddTaskForDate,
  onEditTask,
}: WeekCalendarProps) {
  const weekDates = getWeekDates(selectedDate);
  const todayKey = toDateKey(new Date());
  const todayDateObj = parseDateKey(todayKey);
  const todayTasks = getTasksForDate(tasks, todayKey);
  const todaySummary = summarizeIncome(todayTasks);
  const todayLabel = todayDateObj.toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const todayColumnRef = useRef<HTMLDivElement | null>(null);

  // Automatically bring today's column into view on horizontal overflow without changing Mon -> Sun order
  useEffect(() => {
    const container = scrollContainerRef.current;
    const todayEl = todayColumnRef.current;
    if (!container || !todayEl) return;
    if (container.scrollWidth > container.clientWidth) {
      const targetLeft = Math.max(
        0,
        todayEl.offsetLeft - (container.clientWidth - todayEl.offsetWidth) / 2,
      );
      container.scrollTo({ left: targetLeft, behavior: 'auto' });
    }
  }, [selectedDate, todayKey]);

  return (
    <div className="space-y-3">
      {/* Ưu tiên hiển thị ngày hiện tại (Hôm nay) lên đầu giao diện */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border-2 border-[#E11D64] bg-[#FFE3EE] px-4 py-3 shadow-xs">
        <button
          type="button"
          onClick={() => onSelectDay(todayKey)}
          className="flex items-center gap-3 min-w-0 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D64] rounded-xl"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#E11D64] text-white shadow-xs">
            <CalendarDays className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wide text-[#E11D64]">
                Hôm nay
              </span>
              <span className="text-xs font-bold text-[#15803D] font-mono-tabular">
                {todayTasks.length} task · {formatCurrencyVnd(todaySummary.completed)}
              </span>
            </div>
            <div className="text-sm sm:text-base font-extrabold capitalize text-[#3D1A2B]">
              {todayLabel}
            </div>
          </div>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onAddTaskForDate(todayKey)}
            className="inline-flex items-center gap-1 rounded-xl bg-[#E11D64] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#BE185D] cursor-pointer whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Thêm task hôm nay</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectDay(todayKey)}
            className="rounded-xl border border-[#F39EC1] bg-white px-3 py-1.5 text-xs font-bold text-[#9D174D] hover:bg-[#FFD6E7] cursor-pointer whitespace-nowrap"
          >
            Xem
          </button>
        </div>
      </div>

      {/* Layout tuần chuẩn: thứ tự từ Thứ 2 đến Chủ nhật */}
      <div
        ref={scrollContainerRef}
        className="rounded-3xl border border-[#F5BDD6] bg-[#FFF8FB] overflow-x-auto shadow-xs"
      >
        <div className="grid min-w-[710px] grid-cols-7 divide-x divide-[#F5BDD6]">
          {weekDates.map((dateKey) => {
            const dateObj = parseDateKey(dateKey);
            const weekdayLabel = dateObj.toLocaleDateString('vi-VN', { weekday: 'short' });
            const dayMonthLabel = dateObj.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
            const dayTasks = getTasksForDate(tasks, dateKey);
            const summary = summarizeIncome(dayTasks);
            const isSelected = dateKey === selectedDate;
            const isToday = dateKey === todayKey;

            return (
              <div
                key={dateKey}
                ref={isToday ? todayColumnRef : undefined}
                className={`flex flex-col min-h-[460px] ${
                  isToday
                    ? 'ring-2 ring-inset ring-[#E11D64] bg-[#FFF4F8]'
                    : isSelected
                      ? 'bg-[#FFF0F6]'
                      : 'bg-white'
                }`}
              >
                {/* Column header */}
                <div
                  className={`border-b border-[#F5BDD6] p-3 ${
                    isToday ? 'bg-[#FFDCEB]' : 'bg-[#FFE3EE]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <button
                      type="button"
                      onClick={() => onSelectDay(dateKey)}
                      className="text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D64] rounded-lg"
                    >
                      <div
                        className={`text-xs font-bold capitalize ${
                          isToday ? 'text-[#9D174D]' : 'text-[#7C5266]'
                        }`}
                      >
                        {weekdayLabel}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-block text-sm font-extrabold font-mono-tabular ${
                            isToday
                              ? 'rounded-lg bg-[#E11D64] px-1.5 py-0.5 text-white'
                              : 'text-[#3D1A2B]'
                          }`}
                        >
                          {dayMonthLabel}
                        </span>
                        {isToday && (
                          <span className="text-[10px] font-extrabold uppercase tracking-tight text-[#E11D64] whitespace-nowrap">
                            Hôm nay
                          </span>
                        )}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onAddTaskForDate(dateKey)}
                      aria-label={`Thêm task ngày ${dayMonthLabel}`}
                      className="rounded-xl border border-[#F5BDD6] bg-white p-1.5 text-[#9D174D] hover:bg-[#FFD6E7] cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-2 text-xs font-bold text-[#15803D] font-mono-tabular">
                    {formatCurrencyVnd(summary.completed)}
                  </div>
                </div>

                {/* Tasks list */}
                <div className="flex-1 p-2 space-y-2">
                  {dayTasks.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => onAddTaskForDate(dateKey)}
                      className="w-full rounded-2xl border border-dashed border-[#F5BDD6] py-6 px-2 text-center text-xs text-[#9E788A] hover:border-[#E11D64] hover:text-[#9D174D] transition-colors cursor-pointer"
                    >
                      Chưa có task
                      <br />
                      Bấm để thêm
                    </button>
                  ) : (
                    dayTasks.map((task) => {
                      const isOffTask = Boolean(task.isOff);
                      const isAllDayTask =
                        Boolean(task.isAllDay) ||
                        (task.startTime === '06:00' && task.endTime === '24:00');
                      const colorTheme = getTaskColorTheme(task.color, isOffTask);
                      return (
                        <button
                          key={task.id}
                          data-task-card="true"
                          type="button"
                          onClick={() => onEditTask(task)}
                          style={{
                            backgroundColor: colorTheme.hex,
                            borderColor: colorTheme.border,
                            color: colorTheme.text,
                          }}
                          className="w-full text-left rounded-2xl border p-2.5 hover:brightness-[0.98] hover:shadow-xs transition-all cursor-pointer space-y-1"
                        >
                          <div className="flex items-center justify-between gap-1 text-[11px] font-mono-tabular opacity-85">
                            <span>
                              {isAllDayTask
                                ? 'Cả ngày'
                                : `${formatSlotLabel(task.startTime)}–${formatSlotLabel(task.endTime)}`}
                            </span>
                            <span
                              className={`font-sans font-bold ${
                                isOffTask
                                  ? 'text-[#18181B]'
                                  : task.status === 'completed'
                                    ? 'text-[#15803D]'
                                    : task.status === 'in_progress'
                                      ? 'text-[#B45309]'
                                      : task.status === 'absent'
                                        ? 'text-[#BE123C]'
                                        : 'text-[#9D174D]'
                              }`}
                            >
                              {isOffTask ? 'Off' : STATUS_LABELS[task.status]}
                            </span>
                          </div>
                          <div className="text-xs font-bold line-clamp-2">
                            {isOffTask ? 'Off' : task.title}
                          </div>
                          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-black/10">
                            <span
                              className={`font-bold font-mono-tabular ${
                                !isOffTask && task.status === 'completed'
                                  ? 'text-[#15803D]'
                                  : 'opacity-60'
                              }`}
                            >
                              {!isOffTask && task.status === 'completed'
                                ? formatCurrencyVnd(task.income)
                                : '—'}
                            </span>
                            {task.link && (
                              <ExternalLink className="h-3 w-3 text-[#9D174D]" aria-hidden="true" />
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="border-t border-[#F6C8DC] p-2 text-center">
                  <button
                    type="button"
                    onClick={() => onSelectDay(dateKey)}
                    className="text-xs font-bold text-[#9D174D] hover:underline cursor-pointer"
                  >
                    Xem
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
