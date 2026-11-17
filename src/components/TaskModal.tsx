import { useEffect, useMemo, useRef, useState } from 'react';
import type { CompletionStatus, PlannerTask, TaskInput } from '../types/planner';
import {
  formatSlotLabel,
  generateEndTimeOptions,
  generateTimeSlots,
  getAvailableTimeRanges,
  getConflictingColorsForCandidate,
  getOverlappingTasksForCandidate,
  getTaskColorTheme,
  minutesToTime,
  normalizeHexColor,
  normalizeTimeInput,
  OFF_TASK_COLOR,
  PASTEL_60_COLORS,
  pickAvailablePastelColor,
  timeToMinutes,
  validateTaskInput,
  type TimeSlot,
} from '../utils/schedule';
import { AlertCircle, ArrowRight, Ban, CalendarOff, Check, ChevronDown, Palette, Sun, Trash2, X } from 'lucide-react';

interface TaskModalProps {
  isOpen: boolean;
  editingTask: PlannerTask | null;
  existingTasks: PlannerTask[];
  defaultDate: string;
  defaultStartTime: string;
  defaultEndTime?: string;
  backgroundColor?: string;
  isSaving: boolean;
  onClose: () => void;
  onSave: (input: TaskInput, existingId?: string) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
  onGoToTuitionSheet?: (dateKey: string, studentName: string) => void;
}

const START_OPTIONS = generateTimeSlots(6, 24, 15);
const END_OPTIONS = generateEndTimeOptions(6, 24);

interface TimeComboboxProps {
  id: string;
  value: string;
  options: TimeSlot[];
  placeholder?: string;
  allDaySelected?: boolean;
  onSelectAllDay?: () => void;
  onChange: (nextValue: string) => void;
  onCommitNormalized: (normalized: string) => void;
}

function TimeCombobox({
  id,
  value,
  options,
  placeholder = 'HH:MM',
  allDaySelected = false,
  onSelectAllDay,
  onChange,
  onCommitNormalized,
}: TimeComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isOpen]);

  const handleBlur = () => {
    const normalized = normalizeTimeInput(value);
    if (normalized) {
      onCommitNormalized(normalized);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center rounded-lg border border-[#F0C6D8] bg-white focus-within:border-[#E11D64] focus-within:ring-2 focus-within:ring-[#E11D64]/20">
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && isOpen) {
              e.stopPropagation();
              setIsOpen(false);
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full min-w-0 rounded-l-lg bg-transparent px-3 py-2 text-sm text-[#3D1A2B] font-mono-tabular focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-label="Chọn mốc thời gian"
          aria-expanded={isOpen}
          className="shrink-0 rounded-r-lg border-l border-[#F5BDD6] px-2.5 py-2 text-[#7C5266] hover:bg-[#FFE3EE] hover:text-[#3D1A2B] cursor-pointer"
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      </div>

      {isOpen && (
        <ul
          role="listbox"
          aria-label="Danh sách mốc thời gian"
          className="absolute left-0 right-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-xl border border-[#F5BDD6] bg-white py-1 shadow-lg"
        >
          {onSelectAllDay && (
            <li key="__all_day__">
              <button
                type="button"
                role="option"
                aria-selected={allDaySelected}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelectAllDay();
                  setIsOpen(false);
                }}
                className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between border-b border-[#F6DCE7] cursor-pointer ${
                  allDaySelected
                    ? 'bg-[#FFE3EE] font-bold text-[#9D174D]'
                    : 'font-bold text-[#3D1A2B] hover:bg-[#FFF4F8]'
                }`}
              >
                <span>Cả ngày</span>
                <span className="font-mono-tabular text-[#7C5266]">06:00–24:00</span>
              </button>
            </li>
          )}
          {options.map((opt) => {
            const isSelected = !allDaySelected && normalizeTimeInput(value) === opt.time;
            return (
              <li key={opt.time}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onCommitNormalized(opt.time);
                    setIsOpen(false);
                  }}
                  className={`w-full px-3 py-1.5 text-left text-xs font-mono-tabular flex items-center justify-between cursor-pointer ${
                    isSelected
                      ? 'bg-[#FFE3EE] font-bold text-[#9D174D]'
                      : 'text-[#3D1A2B] hover:bg-[#FFF4F8]'
                  }`}
                >
                  <span>{opt.label}</span>
                  <span className="text-[#7C5266]">{opt.time}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function TaskModal({
  isOpen,
  editingTask,
  existingTasks,
  defaultDate,
  defaultStartTime,
  defaultEndTime,
  backgroundColor,
  isSaving,
  onClose,
  onSave,
  onDelete,
  onGoToTuitionSheet,
}: TaskModalProps) {
  const [title, setTitle] = useState('');
  const [lessonName, setLessonName] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState(defaultStartTime);
  const [endTime, setEndTime] = useState('07:00');
  const [income, setIncome] = useState('0');
  const [status, setStatus] = useState<CompletionStatus>('pending');
  const [isOff, setIsOff] = useState(false);
  const [isAllDay, setIsAllDay] = useState(false);
  const [color, setColor] = useState<string>(PASTEL_60_COLORS[0].hex);
  const [hasManualColor, setHasManualColor] = useState(false);
  const [notes, setNotes] = useState('');
  const [link, setLink] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setErrors({});
    setSubmitError('');

    if (editingTask) {
      const taskIsOff = Boolean(editingTask.isOff);
      const taskIsAllDay =
        Boolean(editingTask.isAllDay) ||
        (editingTask.startTime === '06:00' && editingTask.endTime === '24:00');
      setTitle(editingTask.title);
      setLessonName(editingTask.lessonName || '');
      setDate(editingTask.date);
      setStartTime(editingTask.startTime);
      setEndTime(editingTask.endTime);
      setIncome(String(editingTask.income || 0));
      setStatus(editingTask.status);
      setIsOff(taskIsOff);
      setIsAllDay(taskIsAllDay);
      const normalizedEditingColor = normalizeHexColor(editingTask.color);
      const blockedBg = normalizeHexColor(backgroundColor);
      setColor(
        taskIsOff
          ? OFF_TASK_COLOR
          : editingTask.color && normalizedEditingColor !== blockedBg
            ? editingTask.color
            : pickAvailablePastelColor(
                existingTasks,
                editingTask,
                editingTask.id,
                0,
                backgroundColor,
              ),
      );
      setHasManualColor(Boolean(editingTask.color && normalizedEditingColor !== blockedBg));
      setNotes(editingTask.notes || '');
      setLink(editingTask.link || '');
    } else {
      const startMin = timeToMinutes(defaultStartTime);
      let safeStart = startMin >= 360 && startMin < 1440 ? defaultStartTime : '06:00';
      const endMin = defaultEndTime ? timeToMinutes(defaultEndTime) : -1;
      let safeEnd =
        endMin > timeToMinutes(safeStart) && endMin <= 1440
          ? defaultEndTime!
          : minutesToTime(Math.min(1440, timeToMinutes(safeStart) + 30));

      // If no explicit free range was chosen and default start overlaps, pick first open slot of the day
      if (!defaultEndTime) {
        const initialOverlaps = getOverlappingTasksForCandidate(existingTasks, {
          date: defaultDate,
          startTime: safeStart,
          endTime: safeEnd,
        });
        if (initialOverlaps.length > 0) {
          const freeRanges = getAvailableTimeRanges(existingTasks, defaultDate);
          if (freeRanges.length > 0) {
            const firstFree = freeRanges[0];
            const firstStartMin = timeToMinutes(firstFree.startTime);
            const firstEndMin = timeToMinutes(firstFree.endTime);
            safeStart = firstFree.startTime;
            safeEnd = minutesToTime(Math.min(firstEndMin, firstStartMin + 30));
          }
        }
      }

      setTitle('');
      setLessonName('');
      setDate(defaultDate);
      setStartTime(safeStart);
      setEndTime(safeEnd);
      setIncome('0');
      setStatus('pending');
      setIsOff(false);
      setIsAllDay(false);
      setColor(
        pickAvailablePastelColor(
          existingTasks,
          {
            date: defaultDate,
            startTime: safeStart,
            endTime: safeEnd,
          },
          undefined,
          0,
          backgroundColor,
        ),
      );
      setHasManualColor(false);
      setNotes('');
      setLink('');
    }
  }, [isOpen, editingTask, existingTasks, defaultDate, defaultStartTime, defaultEndTime, backgroundColor]);

  const effectiveCandidate = useMemo(() => {
    const s = isAllDay ? '06:00' : (normalizeTimeInput(startTime) ?? startTime.trim());
    const e = isAllDay ? '24:00' : (normalizeTimeInput(endTime) ?? endTime.trim());
    return { date, startTime: s, endTime: e };
  }, [date, startTime, endTime, isAllDay]);

  const conflictingColorMap = useMemo(
    () => getConflictingColorsForCandidate(existingTasks, effectiveCandidate, editingTask?.id),
    [existingTasks, effectiveCandidate, editingTask?.id],
  );

  const overlappingTasks = useMemo(
    () => getOverlappingTasksForCandidate(existingTasks, effectiveCandidate, editingTask?.id),
    [existingTasks, effectiveCandidate, editingTask?.id],
  );

  const availableRangesForDate = useMemo(() => {
    const tasksExcludingSelf = editingTask
      ? existingTasks.filter((t) => t.id !== editingTask.id)
      : existingTasks;
    return getAvailableTimeRanges(tasksExcludingSelf, date);
  }, [existingTasks, date, editingTask]);

  const blockedBackgroundHex = useMemo(
    () => normalizeHexColor(backgroundColor),
    [backgroundColor],
  );

  // If adding a new task and user has not manually chosen a color, keep auto-picked color conflict-free when time/date/bg changes
  useEffect(() => {
    if (!isOpen || isOff || hasManualColor) return;
    const upperColor = color.toUpperCase();
    if (conflictingColorMap.has(upperColor) || (blockedBackgroundHex && upperColor === blockedBackgroundHex)) {
      const nextSafe = pickAvailablePastelColor(
        existingTasks,
        effectiveCandidate,
        editingTask?.id,
        0,
        backgroundColor,
      );
      if (nextSafe !== color) {
        setColor(nextSafe);
      }
    }
  }, [
    isOpen,
    isOff,
    hasManualColor,
    conflictingColorMap,
    blockedBackgroundHex,
    backgroundColor,
    color,
    existingTasks,
    effectiveCandidate,
    editingTask?.id,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const activeColorTone = getTaskColorTheme(color, isOff);
  const currentConflictTask = isOff ? undefined : conflictingColorMap.get(activeColorTone.hex);
  const isMatchingBackground = !isOff && Boolean(blockedBackgroundHex && activeColorTone.hex === blockedBackgroundHex);

  const handleToggleOff = () => {
    setErrors({});
    if (!isOff) {
      setIsOff(true);
      setColor(OFF_TASK_COLOR);
    } else {
      setIsOff(false);
      setIsAllDay(false);
      const fallbackColor = pickAvailablePastelColor(
        existingTasks,
        effectiveCandidate,
        editingTask?.id,
        0,
        backgroundColor,
      );
      setColor(fallbackColor);
      setHasManualColor(false);
    }
  };

  const handleSelectAllDay = () => {
    setIsAllDay(true);
    setStartTime('06:00');
    setEndTime('24:00');
    setErrors((prev) => ({ ...prev, startTime: '', endTime: '' }));
  };

  const handleApplyNearestAvailableSlot = () => {
    if (availableRangesForDate.length === 0) return;
    const free = availableRangesForDate[0];
    const startMin = timeToMinutes(free.startTime);
    const endMin = timeToMinutes(free.endTime);
    setIsAllDay(false);
    setStartTime(free.startTime);
    setEndTime(minutesToTime(Math.min(endMin, startMin + 30)));
    setErrors((prev) => ({ ...prev, startTime: '', endTime: '' }));
  };

  const overlapBanner = overlappingTasks.length > 0 ? (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3 py-2 text-xs text-[#BE123C]">
      <div className="flex items-start gap-1.5 min-w-0 flex-1">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
        <span>
          Các task trong cùng ngày không được trùng giờ (đang trùng với{' '}
          <strong className="font-bold">
            {overlappingTasks[0].isOff ? 'Off' : overlappingTasks[0].title}
          </strong>{' '}
          lúc{' '}
          <span className="font-mono-tabular font-semibold">
            {overlappingTasks[0].isAllDay ||
            (overlappingTasks[0].startTime === '06:00' &&
              overlappingTasks[0].endTime === '24:00')
              ? 'Cả ngày (6h–24h)'
              : `${formatSlotLabel(overlappingTasks[0].startTime)}–${formatSlotLabel(overlappingTasks[0].endTime)}`}
          </span>
          ).
        </span>
      </div>
      {availableRangesForDate.length > 0 && (
        <button
          type="button"
          onClick={handleApplyNearestAvailableSlot}
          className="font-bold underline hover:text-[#9F1239] cursor-pointer whitespace-nowrap shrink-0"
        >
          Chọn giờ trống ({availableRangesForDate[0].startLabel})
        </button>
      )}
    </div>
  ) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    const normalizedStart = isAllDay
      ? '06:00'
      : (normalizeTimeInput(startTime) ?? startTime.trim());
    const normalizedEnd = isAllDay
      ? '24:00'
      : (normalizeTimeInput(endTime) ?? endTime.trim());
    if (normalizedStart !== startTime) setStartTime(normalizedStart);
    if (normalizedEnd !== endTime) setEndTime(normalizedEnd);

    const payload: TaskInput = isOff
      ? {
          date,
          title: 'Off',
          lessonName: '',
          startTime: normalizedStart,
          endTime: normalizedEnd,
          income: 0,
          status: 'pending',
          isOff: true,
          isAllDay,
          color: OFF_TASK_COLOR,
          notes: '',
          link: '',
        }
      : {
          date,
          title: title.trim(),
          lessonName: lessonName.trim(),
          startTime: normalizedStart,
          endTime: normalizedEnd,
          income: income.trim() === '' ? 0 : Number(income),
          status,
          isOff: false,
          isAllDay,
          color: activeColorTone.hex,
          notes: notes.trim(),
          link: link.trim(),
        };

    const validationErrors = validateTaskInput(
      payload,
      existingTasks,
      editingTask?.id,
      backgroundColor,
    );
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    try {
      await onSave(payload, editingTask?.id);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Không thể lưu thông tin.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#3D1A2B]/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-modal-title"
    >
      <div className="w-full max-w-lg rounded-3xl border border-[#F5BDD6] bg-white shadow-xl overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-[#F5BDD6] bg-[#FFE3EE] px-5 py-4">
          <h2 id="task-modal-title" className="text-lg font-bold text-[#3D1A2B]">
            {editingTask ? 'Chỉnh sửa thông tin task' : 'Thêm task mới'}
          </h2>
          <div className="flex items-center gap-1.5 shrink-0">
            {onGoToTuitionSheet && (
              <button
                type="button"
                onClick={() => onGoToTuitionSheet(date, isOff ? '' : title.trim())}
                aria-label="Đi tới bảng học phí của buổi hôm đó"
                title="Đi tới bảng học phí của buổi hôm đó"
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#F39EC1] bg-white text-[#9D174D] transition-colors hover:bg-[#FFD6E7] hover:text-[#3D1A2B] cursor-pointer"
              >
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng bảng thêm task"
              className="rounded-xl p-1.5 text-[#7C5266] hover:bg-[#FFDCEB] hover:text-[#3D1A2B] cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
          {submitError && (
            <div className="rounded-lg border border-[#FECDD3] bg-[#FFF1F2] px-3 py-2 text-xs font-medium text-[#BE123C]">
              {submitError}
            </div>
          )}

          {/* Nút chọn nhanh chế độ Off */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#F0C6D8] bg-[#FFF8FB] px-3.5 py-2.5">
            <div className="min-w-0">
              <div className="text-xs font-bold text-[#3D1A2B]">Đánh dấu thời gian nghỉ</div>
              <div className="text-[11px] text-[#7C5266]">
                {isOff
                  ? 'Không cần nhập thông tin khác — chỉ cần chọn Cả ngày hoặc khung giờ.'
                  : 'Chọn nút Off nếu muốn đánh dấu khoảng thời gian nghỉ.'}
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleOff}
              aria-pressed={isOff}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-1.5 text-xs font-bold transition-colors cursor-pointer shrink-0 ${
                isOff
                  ? 'border-[#6B7280] bg-[#9CA3AF] text-[#18181B] shadow-xs'
                  : 'border-[#F5BDD6] bg-white text-[#5C4B54] hover:bg-[#F3F4F6] hover:border-[#9CA3AF]'
              }`}
            >
              <CalendarOff className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Off</span>
            </button>
          </div>

          {isOff ? (
            <>
              {/* Thông báo màu tự động xám trung bình cho chế độ Off */}
              <div className="flex items-center gap-2.5 rounded-xl border border-[#6B7280] bg-[#9CA3AF] px-3.5 py-2.5 text-xs font-semibold text-[#18181B]">
                <span
                  aria-hidden="true"
                  className="h-4 w-4 rounded-md border border-[#4B5563] bg-[#9CA3AF] shrink-0"
                />
                <span>
                  Task Off tự động hiển thị màu xám trung bình trên lịch ngày và không cần nhập thêm thông tin.
                </span>
              </div>

              {/* Ngày thực hiện */}
              <div>
                <label htmlFor="task-date" className="block text-xs font-semibold text-[#3D1A2B] mb-1">
                  Ngày thực hiện
                </label>
                <input
                  id="task-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-[#F0C6D8] px-3 py-2 text-sm text-[#3D1A2B] font-mono-tabular focus:border-[#E11D64] focus:outline-none"
                />
                {errors.date && <p className="mt-1 text-xs text-[#BE123C]">{errors.date}</p>}
              </div>

              {/* Thời gian hoặc chọn "Cả ngày" ở đầu tiên */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#3D1A2B]">
                    Thời gian nghỉ (Off)
                  </span>
                </div>

                {/* Trường dữ liệu "Cả ngày" ở đầu tiên */}
                <button
                  type="button"
                  onClick={() => {
                    if (isAllDay) {
                      setIsAllDay(false);
                    } else {
                      handleSelectAllDay();
                    }
                  }}
                  aria-pressed={isAllDay}
                  className={`w-full flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs font-bold transition-colors cursor-pointer ${
                    isAllDay
                      ? 'border-[#6B7280] bg-[#9CA3AF] text-[#18181B]'
                      : 'border-[#F0C6D8] bg-[#FFFDFD] text-[#3D1A2B] hover:bg-[#F3F4F6]'
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <Sun className="h-4 w-4" aria-hidden="true" />
                    <span>Cả ngày (từ 6h đến 24h)</span>
                  </span>
                  <span className="font-mono-tabular">
                    {isAllDay ? 'Đã chọn' : 'Chọn nhanh'}
                  </span>
                </button>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="task-start" className="block text-xs font-semibold text-[#3D1A2B] mb-1">
                      Từ thời gian
                    </label>
                    <TimeCombobox
                      id="task-start"
                      value={startTime}
                      options={START_OPTIONS}
                      placeholder="06:00 hoặc 6h15"
                      allDaySelected={isAllDay}
                      onSelectAllDay={handleSelectAllDay}
                      onChange={(nextVal) => {
                        setIsAllDay(false);
                        setStartTime(nextVal);
                        if (errors.startTime || errors.endTime) {
                          setErrors((prev) => ({ ...prev, startTime: '', endTime: '' }));
                        }
                      }}
                      onCommitNormalized={(nextStart) => {
                        setIsAllDay(false);
                        setStartTime(nextStart);
                        const normalizedEnd = normalizeTimeInput(endTime);
                        if (!normalizedEnd || timeToMinutes(normalizedEnd) <= timeToMinutes(nextStart)) {
                          setEndTime(minutesToTime(Math.min(1440, timeToMinutes(nextStart) + 15)));
                        }
                        if (errors.startTime || errors.endTime) {
                          setErrors((prev) => ({ ...prev, startTime: '', endTime: '' }));
                        }
                      }}
                    />
                    {errors.startTime && <p className="mt-1 text-xs text-[#BE123C]">{errors.startTime}</p>}
                  </div>

                  <div>
                    <label htmlFor="task-end" className="block text-xs font-semibold text-[#3D1A2B] mb-1">
                      Đến thời gian
                    </label>
                    <TimeCombobox
                      id="task-end"
                      value={endTime}
                      options={END_OPTIONS}
                      placeholder="07:00 hoặc 24:00"
                      allDaySelected={isAllDay}
                      onSelectAllDay={handleSelectAllDay}
                      onChange={(nextVal) => {
                        setIsAllDay(false);
                        setEndTime(nextVal);
                        if (errors.endTime) setErrors((prev) => ({ ...prev, endTime: '' }));
                      }}
                      onCommitNormalized={(nextEnd) => {
                        setIsAllDay(false);
                        setEndTime(nextEnd);
                        if (errors.endTime) setErrors((prev) => ({ ...prev, endTime: '' }));
                      }}
                    />
                    {errors.endTime && <p className="mt-1 text-xs text-[#BE123C]">{errors.endTime}</p>}
                  </div>
                </div>
                {overlapBanner}
              </div>
            </>
          ) : (
            <>
              {/* Tên task */}
              <div>
                <label htmlFor="task-title" className="block text-xs font-semibold text-[#3D1A2B] mb-1">
                  Tên task <span className="text-[#E11D64]">*</span>
                </label>
                <input
                  id="task-title"
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (errors.title) setErrors((prev) => ({ ...prev, title: '' }));
                  }}
                  placeholder="Ví dụ: Bé Bông, Thiết kế ấn phẩm..."
                  className="w-full rounded-lg border border-[#F0C6D8] px-3 py-2 text-sm text-[#3D1A2B] focus:border-[#E11D64] focus:outline-none focus:ring-2 focus:ring-[#E11D64]/20"
                />
                {errors.title && <p className="mt-1 text-xs text-[#BE123C]">{errors.title}</p>}
              </div>

              {/* Tên bài học (liên kết trực tiếp với cột Bài học trong Phiếu học phí) */}
              <div>
                <label htmlFor="task-lesson-name" className="block text-xs font-semibold text-[#3D1A2B] mb-1">
                  Tên bài học
                </label>
                <input
                  id="task-lesson-name"
                  type="text"
                  value={lessonName}
                  onChange={(e) => {
                    setLessonName(e.target.value);
                    if (errors.lessonName) setErrors((prev) => ({ ...prev, lessonName: '' }));
                  }}
                  placeholder="Ví dụ: Unit 3 - Ngữ pháp hiện tại đơn (tự đồng bộ vào phiếu học phí)"
                  className="w-full rounded-lg border border-[#F0C6D8] px-3 py-2 text-sm text-[#3D1A2B] focus:border-[#E11D64] focus:outline-none focus:ring-2 focus:ring-[#E11D64]/20"
                />
                {errors.lessonName && (
                  <p className="mt-1 text-xs text-[#BE123C]">{errors.lessonName}</p>
                )}
              </div>

              {/* Ngày & Thu nhập */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="task-date" className="block text-xs font-semibold text-[#3D1A2B] mb-1">
                    Ngày thực hiện
                  </label>
                  <input
                    id="task-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-lg border border-[#F0C6D8] px-3 py-2 text-sm text-[#3D1A2B] font-mono-tabular focus:border-[#E11D64] focus:outline-none"
                  />
                  {errors.date && <p className="mt-1 text-xs text-[#BE123C]">{errors.date}</p>}
                </div>

                <div>
                  <label htmlFor="task-income" className="block text-xs font-semibold text-[#3D1A2B] mb-1">
                    Thu nhập (VNĐ)
                  </label>
                  <input
                    id="task-income"
                    type="number"
                    min={0}
                    step={1000}
                    value={income}
                    onChange={(e) => {
                      setIncome(e.target.value);
                      if (errors.income) setErrors((prev) => ({ ...prev, income: '' }));
                    }}
                    placeholder="0"
                    className="w-full rounded-lg border border-[#F0C6D8] px-3 py-2 text-sm text-[#3D1A2B] font-mono-tabular focus:border-[#E11D64] focus:outline-none"
                  />
                  {errors.income && <p className="mt-1 text-xs text-[#BE123C]">{errors.income}</p>}
                </div>
              </div>

              {/* Thời gian từ [thời gian] đến [thời gian] - cho phép chọn hoặc nhập thủ công */}
              <div className="space-y-1">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="task-start" className="block text-xs font-semibold text-[#3D1A2B] mb-1">
                      Từ thời gian
                    </label>
                    <TimeCombobox
                      id="task-start"
                      value={startTime}
                      options={START_OPTIONS}
                      placeholder="06:00 hoặc 6h15"
                      allDaySelected={isAllDay}
                      onSelectAllDay={handleSelectAllDay}
                      onChange={(nextVal) => {
                        setIsAllDay(false);
                        setStartTime(nextVal);
                        if (errors.startTime || errors.endTime) {
                          setErrors((prev) => ({ ...prev, startTime: '', endTime: '' }));
                        }
                      }}
                      onCommitNormalized={(nextStart) => {
                        setIsAllDay(false);
                        setStartTime(nextStart);
                        const normalizedEnd = normalizeTimeInput(endTime);
                        if (!normalizedEnd || timeToMinutes(normalizedEnd) <= timeToMinutes(nextStart)) {
                          setEndTime(minutesToTime(Math.min(1440, timeToMinutes(nextStart) + 15)));
                        }
                        if (errors.startTime || errors.endTime) {
                          setErrors((prev) => ({ ...prev, startTime: '', endTime: '' }));
                        }
                      }}
                    />
                    {errors.startTime && <p className="mt-1 text-xs text-[#BE123C]">{errors.startTime}</p>}
                  </div>

                  <div>
                    <label htmlFor="task-end" className="block text-xs font-semibold text-[#3D1A2B] mb-1">
                      Đến thời gian
                    </label>
                    <TimeCombobox
                      id="task-end"
                      value={endTime}
                      options={END_OPTIONS}
                      placeholder="07:00 hoặc 7h30"
                      allDaySelected={isAllDay}
                      onSelectAllDay={handleSelectAllDay}
                      onChange={(nextVal) => {
                        setIsAllDay(false);
                        setEndTime(nextVal);
                        if (errors.endTime) setErrors((prev) => ({ ...prev, endTime: '' }));
                      }}
                      onCommitNormalized={(nextEnd) => {
                        setIsAllDay(false);
                        setEndTime(nextEnd);
                        if (errors.endTime) setErrors((prev) => ({ ...prev, endTime: '' }));
                      }}
                    />
                    {errors.endTime && <p className="mt-1 text-xs text-[#BE123C]">{errors.endTime}</p>}
                  </div>
                </div>
                {overlapBanner}
                <p className="text-[11px] text-[#7C5266]">
                  Có thể gõ trực tiếp (vd: 08:10, 8h20) hoặc bấm mũi tên để chọn nhanh.
                </p>
              </div>

              {/* Tình trạng hoàn thành */}
              <div>
                <label htmlFor="task-status" className="block text-xs font-semibold text-[#3D1A2B] mb-1">
                  Tình trạng hoàn thành
                </label>
                <select
                  id="task-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as CompletionStatus)}
                  className="w-full rounded-lg border border-[#F0C6D8] bg-white px-3 py-2 text-sm text-[#3D1A2B] focus:border-[#E11D64] focus:outline-none"
                >
                  <option value="pending">Chưa hoàn thành</option>
                  <option value="in_progress">Đang làm</option>
                  <option value="completed">Hoàn thành</option>
                  <option value="absent">Nghỉ</option>
                </select>
              </div>

              {/* Bảng màu pastel 60 màu */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#3D1A2B]">
                    <Palette className="h-3.5 w-3.5 text-[#E11D64]" aria-hidden="true" />
                    <span>Màu thẻ task (Bảng pastel 60 màu)</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#3D1A2B]">
                    <span
                      aria-hidden="true"
                      className="h-4 w-4 rounded-md border"
                      style={{
                        backgroundColor: activeColorTone.hex,
                        borderColor: activeColorTone.border,
                      }}
                    />
                    <span>{activeColorTone.name}</span>
                  </span>
                </div>

                <div
                  role="radiogroup"
                  aria-label="Chọn màu pastel cho task"
                  className="grid grid-cols-6 sm:grid-cols-10 gap-1.5 rounded-2xl border border-[#F0C6D8] bg-[#FFFDFD] p-2.5"
                >
                  {PASTEL_60_COLORS.map((tone) => {
                    const isSelected = activeColorTone.hex === tone.hex;
                    const conflictTask = conflictingColorMap.get(tone.hex);
                    const isSameAsBackground = Boolean(blockedBackgroundHex && tone.hex === blockedBackgroundHex);
                    const isBlocked = Boolean(conflictTask) || isSameAsBackground;

                    return (
                      <button
                        key={tone.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        disabled={isBlocked}
                        onClick={() => {
                          setColor(tone.hex);
                          setHasManualColor(true);
                          if (errors.color) setErrors((prev) => ({ ...prev, color: '' }));
                        }}
                        title={
                          isSameAsBackground
                            ? `${tone.name} — Không thể chọn (trùng màu nền giao diện)`
                            : isBlocked
                              ? `${tone.name} — Không thể chọn (trùng màu task liền kề: ${conflictTask?.title})`
                              : tone.name
                        }
                        aria-label={
                          isSameAsBackground
                            ? `${tone.name} (trùng màu nền giao diện)`
                            : isBlocked
                              ? `${tone.name} (đang trùng với task liền kề ${conflictTask?.title})`
                              : `Chọn màu ${tone.name}`
                        }
                        className={`relative flex h-8 w-full items-center justify-center rounded-lg border transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D64] ${
                          isBlocked
                            ? 'opacity-35 cursor-not-allowed'
                            : 'hover:scale-105 cursor-pointer'
                        } ${isSelected ? 'ring-2 ring-[#3D1A2B] ring-offset-1 scale-105' : ''}`}
                        style={{
                          backgroundColor: tone.hex,
                          borderColor: isSelected ? '#3D1A2B' : tone.border,
                        }}
                      >
                        {isBlocked ? (
                          <Ban className="h-3.5 w-3.5 text-[#3D1A2B]/80" aria-hidden="true" />
                        ) : isSelected ? (
                          <Check className="h-4 w-4 text-[#3D1A2B]" aria-hidden="true" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                {(errors.color || currentConflictTask || isMatchingBackground) && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#FECDD3] bg-[#FFF1F2] px-3 py-1.5 text-xs text-[#BE123C]">
                    <span>
                      {errors.color ||
                        (isMatchingBackground
                          ? 'Không thể chọn màu trùng với màu nền giao diện.'
                          : `2 task liền kề không được chọn trùng màu (đang trùng với "${currentConflictTask?.title}").`)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const nextSafe = pickAvailablePastelColor(
                          existingTasks,
                          effectiveCandidate,
                          editingTask?.id,
                          0,
                          backgroundColor,
                        );
                        setColor(nextSafe);
                        setHasManualColor(true);
                        setErrors((prev) => ({ ...prev, color: '' }));
                      }}
                      className="font-bold underline hover:text-[#9F1239] cursor-pointer whitespace-nowrap"
                    >
                      Đổi màu gợi ý
                    </button>
                  </div>
                )}

                {(conflictingColorMap.size > 0 || Boolean(blockedBackgroundHex)) &&
                  !errors.color &&
                  !currentConflictTask &&
                  !isMatchingBackground && (
                    <p className="text-[11px] text-[#7C5266]">
                      Các ô có biểu tượng gạch chéo đang trùng màu nền hoặc task liền kề nên không thể chọn.
                    </p>
                  )}
              </div>

              {/* Ghi chú */}
              <div>
                <label htmlFor="task-notes" className="block text-xs font-semibold text-[#3D1A2B] mb-1">
                  Ghi chú
                </label>
                <textarea
                  id="task-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ghi chú thêm về công việc, khách hàng..."
                  className="w-full rounded-lg border border-[#F0C6D8] px-3 py-2 text-sm text-[#3D1A2B] focus:border-[#E11D64] focus:outline-none"
                />
              </div>

              {/* Link */}
              <div>
                <label htmlFor="task-link" className="block text-xs font-semibold text-[#3D1A2B] mb-1">
                  Link đính kèm (Google Sheet, Drive, Docs...)
                </label>
                <input
                  id="task-link"
                  type="url"
                  value={link}
                  onChange={(e) => {
                    setLink(e.target.value);
                    if (errors.link) setErrors((prev) => ({ ...prev, link: '' }));
                  }}
                  placeholder="https://docs.google.com/spreadsheets/..."
                  className="w-full rounded-lg border border-[#F0C6D8] px-3 py-2 text-sm text-[#3D1A2B] focus:border-[#E11D64] focus:outline-none"
                />
                {errors.link && <p className="mt-1 text-xs text-[#BE123C]">{errors.link}</p>}
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#F6C8DC]">
            {editingTask ? (
              <button
                type="button"
                disabled={isSaving}
                onClick={() => onDelete(editingTask.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#FECDD3] px-3 py-2 text-xs font-semibold text-[#BE123C] hover:bg-[#FFF1F2] cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Xóa task</span>
              </button>
            ) : (
              <span className="text-xs text-[#7C5266]">Tự động sao lưu trực tuyến</span>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[#F0C6D8] px-4 py-2 text-sm font-medium text-[#7C5266] hover:bg-[#FFF4F8] cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-lg bg-[#E11D64] px-4 py-2 text-sm font-semibold text-white hover:bg-[#BE185D] cursor-pointer disabled:opacity-50"
              >
                {isSaving ? 'Đang lưu...' : 'Lưu thông tin'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
