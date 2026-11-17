import type {
  CompletionStatus,
  IncomeEntry,
  IncomeInput,
  IncomeReceivedStatus,
  PlannerTask,
  TaskInput,
} from '../types/planner.ts';

export interface TimeSlot {
  time: string; // "06:00"
  label: string; // "6h", "6h15"
  minutes: number; // 360
}

export const START_HOUR = 6;
export const END_HOUR = 24;
export const SLOT_STEP_MINUTES = 15;

export function timeToMinutes(time: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return -1;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(mins) || hours < 0 || hours > 24 || mins < 0 || mins > 59) {
    return -1;
  }
  if (hours === 24 && mins !== 0) return -1;
  return hours * 60 + mins;
}

export function minutesToTime(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, totalMinutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function normalizeTimeInput(raw: string): string | null {
  const cleaned = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!cleaned) return null;

  let hours = -1;
  let mins = -1;

  const colonMatch = /^(\d{1,2}):(\d{1,2})$/.exec(cleaned);
  if (colonMatch) {
    hours = Number(colonMatch[1]);
    mins = Number(colonMatch[2]);
  } else {
    const hMatch = /^(\d{1,2})h(\d{0,2})$/.exec(cleaned);
    if (hMatch) {
      hours = Number(hMatch[1]);
      mins = hMatch[2] === '' ? 0 : Number(hMatch[2]);
    } else {
      const hourOnlyMatch = /^(\d{1,2})$/.exec(cleaned);
      if (hourOnlyMatch) {
        hours = Number(hourOnlyMatch[1]);
        mins = 0;
      } else {
        const compactMatch = /^(\d{3,4})$/.exec(cleaned);
        if (compactMatch) {
          const digits = compactMatch[1];
          if (digits.length === 3) {
            hours = Number(digits.slice(0, 1));
            mins = Number(digits.slice(1));
          } else {
            hours = Number(digits.slice(0, 2));
            mins = Number(digits.slice(2));
          }
        }
      }
    }
  }

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(mins) ||
    hours < 0 ||
    hours > 24 ||
    mins < 0 ||
    mins > 59 ||
    (hours === 24 && mins !== 0)
  ) {
    return null;
  }

  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function formatSlotLabel(time: string): string {
  const total = timeToMinutes(time);
  if (total < 0) return time;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

export function generateTimeSlots(
  startHour = START_HOUR,
  endHour = END_HOUR,
  stepMinutes = SLOT_STEP_MINUTES,
): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const startMinutes = startHour * 60;
  const endMinutes = endHour * 60;
  for (let m = startMinutes; m < endMinutes; m += stepMinutes) {
    const time = minutesToTime(m);
    slots.push({
      time,
      label: formatSlotLabel(time),
      minutes: m,
    });
  }
  return slots;
}

export function generateEndTimeOptions(startHour = START_HOUR, endHour = END_HOUR): TimeSlot[] {
  const options: TimeSlot[] = [];
  for (let m = startHour * 60 + SLOT_STEP_MINUTES; m <= endHour * 60; m += SLOT_STEP_MINUTES) {
    const time = minutesToTime(m);
    options.push({
      time,
      label: formatSlotLabel(time),
      minutes: m,
    });
  }
  return options;
}

export interface SlotTaskEntry {
  task: PlannerTask;
  isStartSlot: boolean;
}

export function getTasksForSlot(tasks: PlannerTask[], date: string, slotTime: string): SlotTaskEntry[] {
  const slotMin = timeToMinutes(slotTime);
  if (slotMin < 0) return [];
  const slotEndMin = slotMin + SLOT_STEP_MINUTES;
  const dayTasks = tasks
    .filter((t) => t.date === date)
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  const entries: SlotTaskEntry[] = [];
  for (const task of dayTasks) {
    const startMin = timeToMinutes(task.startTime);
    const endMin = timeToMinutes(task.endTime);
    if (startMin < 0 || endMin <= startMin) continue;
    // Task occupies [startMin, endMin) and overlaps bucket [slotMin, slotMin + 15)
    if (startMin < slotEndMin && endMin > slotMin) {
      const isStartSlot = startMin >= slotMin && startMin < slotEndMin;
      entries.push({ task, isStartSlot });
    }
  }
  return entries;
}

export function getTasksForDate(tasks: PlannerTask[], date: string): PlannerTask[] {
  return tasks
    .filter((t) => t.date === date)
    .sort((a, b) => {
      const diff = timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
      if (diff !== 0) return diff;
      return a.createdAt.localeCompare(b.createdAt);
    });
}

export interface UpcomingDayTasksResult {
  visibleTasks: PlannerTask[];
  expiredCount: number;
  activeTaskId: string | null;
}

export function getUpcomingDayTasks(
  tasks: PlannerTask[],
  dateKey: string,
  now: Date = new Date(),
): UpcomingDayTasksResult {
  const dayTasks = getTasksForDate(tasks, dateKey);
  const todayKey = toDateKey(now);

  const sortCompletedToBottom = (list: PlannerTask[]): PlannerTask[] =>
    [...list].sort((a, b) => {
      const aDone = a.status === 'completed' ? 1 : 0;
      const bDone = b.status === 'completed' ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      const diff = timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
      if (diff !== 0) return diff;
      return a.createdAt.localeCompare(b.createdAt);
    });

  if (dateKey > todayKey) {
    return {
      visibleTasks: sortCompletedToBottom(dayTasks),
      expiredCount: 0,
      activeTaskId: null,
    };
  }

  if (dateKey < todayKey) {
    return {
      visibleTasks: [],
      expiredCount: dayTasks.length,
      activeTaskId: null,
    };
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const visibleTasks: PlannerTask[] = [];
  let expiredCount = 0;

  for (const task of dayTasks) {
    const endMin = timeToMinutes(task.endTime);
    if (endMin > 0 && endMin <= nowMinutes) {
      expiredCount += 1;
      continue;
    }
    visibleTasks.push(task);
  }

  const sortedVisible = sortCompletedToBottom(visibleTasks);
  let activeTaskId: string | null = null;
  for (const task of sortedVisible) {
    if (task.status === 'completed') continue;
    const startMin = timeToMinutes(task.startTime);
    const endMin = timeToMinutes(task.endTime);
    if (startMin >= 0 && startMin <= nowMinutes && endMin > nowMinutes) {
      activeTaskId = task.id;
      break;
    }
  }

  return {
    visibleTasks: sortedVisible,
    expiredCount,
    activeTaskId,
  };
}

export function summarizeIncome(tasks: PlannerTask[]): {
  total: number;
  completed: number;
  pending: number;
  completedCount: number;
  totalCount: number;
} {
  let total = 0;
  let completed = 0;
  let pending = 0;
  let completedCount = 0;

  for (const t of tasks) {
    const amount = Number.isFinite(t.income) && t.income > 0 ? t.income : 0;
    total += amount;
    if (t.status === 'completed') {
      completed += amount;
      completedCount += 1;
    } else {
      pending += amount;
    }
  }

  return {
    total,
    completed,
    pending,
    completedCount,
    totalCount: tasks.length,
  };
}

export function formatCurrencyVnd(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  return `${new Intl.NumberFormat('vi-VN').format(safe)} ₫`;
}

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(dateKey: string, delta: number): string {
  const d = parseDateKey(dateKey);
  d.setDate(d.getDate() + delta);
  return toDateKey(d);
}

export function addMonths(dateKey: string, delta: number): string {
  const d = parseDateKey(dateKey);
  const originalDay = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + delta);
  const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(originalDay, maxDay));
  return toDateKey(d);
}

/**
 * Returns 7 date strings (Monday -> Sunday) for the week containing dateKey.
 */
export function getWeekDates(dateKey: string): string[] {
  const d = parseDateKey(dateKey);
  const day = d.getDay(); // 0=Sun, 1=Mon...
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMon);

  const result: string[] = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + i);
    result.push(toDateKey(cur));
  }
  return result;
}

export interface MonthCell {
  dateKey: string;
  dayOfMonth: number;
  inCurrentMonth: boolean;
}

/**
 * Returns 42 cells (6 weeks, Monday -> Sunday) for the month of dateKey.
 */
export function getMonthGrid(dateKey: string): MonthCell[] {
  const d = parseDateKey(dateKey);
  const year = d.getFullYear();
  const month = d.getMonth();
  const firstDay = new Date(year, month, 1);
  const firstWeekday = firstDay.getDay(); // 0=Sun, 1=Mon
  const offset = firstWeekday === 0 ? 6 : firstWeekday - 1;

  const gridStart = new Date(year, month, 1 - offset);
  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i++) {
    const cur = new Date(gridStart);
    cur.setDate(gridStart.getDate() + i);
    cells.push({
      dateKey: toDateKey(cur),
      dayOfMonth: cur.getDate(),
      inCurrentMonth: cur.getMonth() === month,
    });
  }
  return cells;
}

export interface PastelColorTone {
  id: string;
  name: string;
  hex: string;
  border: string;
  text: string;
}

function clampChannel(val: number): number {
  return Math.max(0, Math.min(255, Math.round(val)));
}

function darkenHex(hex: string, factor: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const dr = clampChannel(r * (1 - factor));
  const dg = clampChannel(g * (1 - factor));
  const db = clampChannel(b * (1 - factor));
  return `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`.toUpperCase();
}

function buildPastelTone(id: string, name: string, hex: string): PastelColorTone {
  const upperHex = hex.toUpperCase();
  return {
    id,
    name,
    hex: upperHex,
    border: darkenHex(upperHex, 0.22),
    text: '#2D1722',
  };
}

export const PASTEL_60_COLORS: PastelColorTone[] = [
  // Row 1: Hồng & Đào (10)
  buildPastelTone('p01', 'Hồng phấn anh đào', '#FFE0EC'),
  buildPastelTone('p02', 'Hồng dâu sữa', '#FFD1E3'),
  buildPastelTone('p03', 'Hồng kẹo bông', '#FFC7D9'),
  buildPastelTone('p04', 'Hồng hoa hồng', '#FFCCD5'),
  buildPastelTone('p05', 'Hồng đào nhẹ', '#FFD6CC'),
  buildPastelTone('p06', 'Cam đào kem', '#FFE0CC'),
  buildPastelTone('p07', 'Cam san hô nhạt', '#FFD9C2'),
  buildPastelTone('p08', 'Mơ chín dịu', '#FFE4D6'),
  buildPastelTone('p09', 'Hồng pastel cổ điển', '#FAD2E1'),
  buildPastelTone('p10', 'Hồng trà sữa', '#F8C8DC'),

  // Row 2: Cam ấm & Vàng bơ (10)
  buildPastelTone('p11', 'Vàng mơ pastel', '#FFE5B4'),
  buildPastelTone('p12', 'Vàng kem vani', '#FFEAC2'),
  buildPastelTone('p13', 'Vàng chanh bơ', '#FFF0B8'),
  buildPastelTone('p14', 'Vàng nắng mai', '#FFF5BA'),
  buildPastelTone('p15', 'Vàng mật ong nhạt', '#FEF3C7'),
  buildPastelTone('p16', 'Vàng cát dịu', '#FDE6C4'),
  buildPastelTone('p17', 'Vàng bánh flan', '#FDE2B8'),
  buildPastelTone('p18', 'Vàng cúc nhạt', '#FFF7CC'),
  buildPastelTone('p19', 'Vàng yến mạch', '#F9E4B7'),
  buildPastelTone('p20', 'Cam bơ sữa', '#FBE7C6'),

  // Row 3: Xanh lá & Bạc hà (10)
  buildPastelTone('p21', 'Xanh cốm non', '#ECFCCB'),
  buildPastelTone('p22', 'Xanh táo pastel', '#E2F6CA'),
  buildPastelTone('p23', 'Xanh matcha sữa', '#D9F2C6'),
  buildPastelTone('p24', 'Xanh lá mạ dịu', '#D4F0C9'),
  buildPastelTone('p25', 'Xanh bơ non', '#CCF2CB'),
  buildPastelTone('p26', 'Xanh bạc hà tươi', '#CDF5D4'),
  buildPastelTone('p27', 'Xanh ngọc bạc hà', '#D1FAE5'),
  buildPastelTone('p28', 'Xanh lá dứa nhạt', '#C7F2E3'),
  buildPastelTone('p29', 'Xanh xô thơm', '#D8F3DC'),
  buildPastelTone('p30', 'Xanh chanh non', '#E4F5D4'),

  // Row 4: Xanh biển & Ngọc lam (10)
  buildPastelTone('p31', 'Xanh ngọc lam dịu', '#CCFBF1'),
  buildPastelTone('p32', 'Xanh băng pastel', '#C8F4F9'),
  buildPastelTone('p33', 'Xanh cyan phấn', '#CFFAFE'),
  buildPastelTone('p34', 'Xanh trời trong', '#D0EEFF'),
  buildPastelTone('p35', 'Xanh mây nhẹ', '#CBE8FF'),
  buildPastelTone('p36', 'Xanh baby blue', '#D6E6FF'),
  buildPastelTone('p37', 'Xanh thanh thiên', '#DCE8FF'),
  buildPastelTone('p38', 'Xanh denim nhạt', '#D4E4F7'),
  buildPastelTone('p39', 'Xanh lưu ly dịu', '#CFE0FA'),
  buildPastelTone('p40', 'Xanh sương sớm', '#E0F2FE'),

  // Row 5: Tím oải hương & Tím hồng (10)
  buildPastelTone('p41', 'Tím thanh anh', '#E0E7FF'),
  buildPastelTone('p42', 'Tím hoa cà nhạt', '#E2DCFF'),
  buildPastelTone('p43', 'Tím oải hương', '#E6DBFF'),
  buildPastelTone('p44', 'Tím khoai môn sữa', '#EADCF8'),
  buildPastelTone('p45', 'Tím tử đinh hương', '#EFE0FF'),
  buildPastelTone('p46', 'Tím phong lan dịu', '#F3DBFF'),
  buildPastelTone('p47', 'Tím hồng pastel', '#F7DCFF'),
  buildPastelTone('p48', 'Hồng tím hoa lan', '#FCE0FB'),
  buildPastelTone('p49', 'Tím mận nhạt', '#F5D8EB'),
  buildPastelTone('p50', 'Tím sương mờ', '#E8DFF5'),

  // Row 6: Kem sữa & Trung tính pastel (10)
  buildPastelTone('p51', 'Kem hạnh nhân', '#FFF1E6'),
  buildPastelTone('p52', 'Hồng đất nhạt', '#FDE8E1'),
  buildPastelTone('p53', 'Hồng vỏ sò', '#F8EDEB'),
  buildPastelTone('p54', 'Cà phê sữa nhạt', '#F5E6DF'),
  buildPastelTone('p55', 'Be lụa ấm', '#EFE6DD'),
  buildPastelTone('p56', 'Kem lúa mạch', '#F4EAD5'),
  buildPastelTone('p57', 'Xám kem ấm', '#EAE7DC'),
  buildPastelTone('p58', 'Xanh rêu sương', '#E6EFE9'),
  buildPastelTone('p59', 'Xám xanh pastel', '#E8EDF2'),
  buildPastelTone('p60', 'Tím khói phấn', '#F0E6EF'),
];

export const DEFAULT_APP_BACKGROUND_COLOR = '#FFF4F8';
export const DEFAULT_TASK_COLOR = PASTEL_60_COLORS[0].hex;
export const OFF_TASK_COLOR = '#9CA3AF';
export const OFF_TASK_THEME: PastelColorTone = {
  id: 'off-gray',
  name: 'Xám trung bình (Off)',
  hex: OFF_TASK_COLOR,
  border: '#6B7280',
  text: '#18181B',
};

const PASTEL_BY_HEX = new Map(PASTEL_60_COLORS.map((tone) => [tone.hex.toUpperCase(), tone]));

export function normalizeHexColor(color: unknown): string | null {
  if (typeof color !== 'string') return null;
  const trimmed = color.trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

export function getTaskColorTheme(color?: string, isOff?: boolean): PastelColorTone {
  const normalized = normalizeHexColor(color);
  if (isOff || normalized === OFF_TASK_COLOR) {
    return OFF_TASK_THEME;
  }
  const safeHex = normalized || DEFAULT_TASK_COLOR;
  const matched = PASTEL_BY_HEX.get(safeHex);
  if (matched) return matched;
  return buildPastelTone('custom', safeHex, safeHex);
}

export function getAdjacentTasks(
  tasks: PlannerTask[],
  candidate: { date: string; startTime: string; endTime: string },
  excludeTaskId?: string,
): PlannerTask[] {
  const candStart = timeToMinutes(candidate.startTime);
  const candEnd = timeToMinutes(candidate.endTime);
  if (!candidate.date || candStart < 0 || candEnd <= candStart) {
    return [];
  }

  const sameDay = tasks
    .filter((t) => t.date === candidate.date && t.id !== excludeTaskId)
    .map((t) => ({
      task: t,
      startMin: timeToMinutes(t.startTime),
      endMin: timeToMinutes(t.endTime),
    }))
    .filter((item) => item.startMin >= 0 && item.endMin > item.startMin);

  if (sameDay.length === 0) return [];

  const adjacentMap = new Map<string, PlannerTask>();

  // 1. Overlapping tasks
  for (const item of sameDay) {
    if (item.startMin < candEnd && item.endMin > candStart) {
      adjacentMap.set(item.task.id, item.task);
    }
  }

  // 2. Immediate predecessor(s): tasks ending at or before candStart with maximum endMin
  const prevCandidates = sameDay.filter((item) => item.endMin <= candStart);
  if (prevCandidates.length > 0) {
    const maxPrevEnd = Math.max(...prevCandidates.map((item) => item.endMin));
    for (const item of prevCandidates) {
      if (item.endMin === maxPrevEnd) {
        adjacentMap.set(item.task.id, item.task);
      }
    }
  }

  // 3. Immediate successor(s): tasks starting at or after candEnd with minimum startMin
  const nextCandidates = sameDay.filter((item) => item.startMin >= candEnd);
  if (nextCandidates.length > 0) {
    const minNextStart = Math.min(...nextCandidates.map((item) => item.startMin));
    for (const item of nextCandidates) {
      if (item.startMin === minNextStart) {
        adjacentMap.set(item.task.id, item.task);
      }
    }
  }

  return Array.from(adjacentMap.values());
}

export function getConflictingColorsForCandidate(
  tasks: PlannerTask[],
  candidate: { date: string; startTime: string; endTime: string },
  excludeTaskId?: string,
): Map<string, PlannerTask> {
  const adjacent = getAdjacentTasks(tasks, candidate, excludeTaskId);
  const conflicts = new Map<string, PlannerTask>();
  for (const task of adjacent) {
    if (task.isOff) continue;
    const hex = normalizeHexColor(task.color) || DEFAULT_TASK_COLOR;
    if (hex === OFF_TASK_COLOR) continue;
    if (!conflicts.has(hex)) {
      conflicts.set(hex, task);
    }
  }
  return conflicts;
}

export function pickAvailablePastelColor(
  tasks: PlannerTask[],
  candidate: { date: string; startTime: string; endTime: string },
  excludeTaskId?: string,
  preferredStartIndex = 0,
  forbiddenBackgroundColor?: string,
): string {
  const conflicts = getConflictingColorsForCandidate(tasks, candidate, excludeTaskId);
  const blockedBgHex = normalizeHexColor(forbiddenBackgroundColor);
  const total = PASTEL_60_COLORS.length;
  const startIdx = ((preferredStartIndex % total) + total) % total;
  for (let offset = 0; offset < total; offset++) {
    const tone = PASTEL_60_COLORS[(startIdx + offset) % total];
    if (!conflicts.has(tone.hex) && tone.hex !== blockedBgHex) {
      return tone.hex;
    }
  }
  const fallback = PASTEL_60_COLORS.find((t) => t.hex !== blockedBgHex);
  return fallback?.hex || DEFAULT_TASK_COLOR;
}

export function ensureNonConflictingTaskColors(tasks: PlannerTask[]): PlannerTask[] {
  if (!Array.isArray(tasks) || tasks.length === 0) return tasks;

  // Sort chronologically so legacy uncolored tasks get varied non-adjacent colors in time order
  const orderedIndices = tasks
    .map((t, index) => ({ t, index }))
    .sort((a, b) => {
      const dateDiff = a.t.date.localeCompare(b.t.date);
      if (dateDiff !== 0) return dateDiff;
      const startDiff = timeToMinutes(a.t.startTime) - timeToMinutes(b.t.startTime);
      if (startDiff !== 0) return startDiff;
      return a.t.createdAt.localeCompare(b.t.createdAt);
    });

  let changed = false;
  const nextTasks = [...tasks];

  for (let step = 0; step < orderedIndices.length; step++) {
    const { index } = orderedIndices[step];
    const current = nextTasks[index];
    if (current.isOff) {
      if (normalizeHexColor(current.color) !== OFF_TASK_COLOR) {
        nextTasks[index] = { ...current, color: OFF_TASK_COLOR };
        changed = true;
      }
      continue;
    }
    const currentColor = normalizeHexColor(current.color);
    if (currentColor) {
      if (currentColor !== current.color) {
        nextTasks[index] = { ...current, color: currentColor };
        changed = true;
      }
      continue;
    }
    // Spread legacy uncolored tasks pleasantly across the palette while avoiding adjacent collisions
    const preferredIdx = (step * 7) % PASTEL_60_COLORS.length;
    const assigned = pickAvailablePastelColor(nextTasks, current, current.id, preferredIdx);
    nextTasks[index] = { ...current, color: assigned };
    changed = true;
  }

  return changed ? nextTasks : tasks;
}

export interface PositionedDayTask {
  task: PlannerTask;
  startMin: number;
  endMin: number;
  lane: number;
  totalLanes: number;
}

export function computeTaskLayoutLanes(
  dayTasks: PlannerTask[],
  gridStartMinutes = START_HOUR * 60,
  gridEndMinutes = END_HOUR * 60,
): PositionedDayTask[] {
  const items = dayTasks
    .map((task) => {
      const rawStart = timeToMinutes(task.startTime);
      const rawEnd = timeToMinutes(task.endTime);
      if (rawStart < 0 || rawEnd <= rawStart) return null;
      const startMin = Math.max(gridStartMinutes, rawStart);
      const endMin = Math.min(gridEndMinutes, Math.max(startMin + 1, rawEnd));
      return { task, startMin, endMin };
    })
    .filter((item): item is { task: PlannerTask; startMin: number; endMin: number } => item !== null)
    .sort((a, b) => {
      const sDiff = a.startMin - b.startMin;
      if (sDiff !== 0) return sDiff;
      const eDiff = a.endMin - b.endMin;
      if (eDiff !== 0) return eDiff;
      return a.task.createdAt.localeCompare(b.task.createdAt);
    });

  if (items.length === 0) return [];

  // Partition into overlap clusters
  const clusters: Array<typeof items> = [];
  let currentCluster: typeof items = [];
  let clusterMaxEnd = -1;

  for (const item of items) {
    if (currentCluster.length === 0 || item.startMin < clusterMaxEnd) {
      currentCluster.push(item);
      clusterMaxEnd = Math.max(clusterMaxEnd, item.endMin);
    } else {
      clusters.push(currentCluster);
      currentCluster = [item];
      clusterMaxEnd = item.endMin;
    }
  }
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  const result: PositionedDayTask[] = [];
  for (const cluster of clusters) {
    const laneEndTimes: number[] = [];
    const assigned: Array<{ task: PlannerTask; startMin: number; endMin: number; lane: number }> = [];

    for (const item of cluster) {
      let laneIndex = laneEndTimes.findIndex((endT) => endT <= item.startMin);
      if (laneIndex === -1) {
        laneIndex = laneEndTimes.length;
        laneEndTimes.push(item.endMin);
      } else {
        laneEndTimes[laneIndex] = item.endMin;
      }
      assigned.push({ ...item, lane: laneIndex });
    }

    const totalLanes = Math.max(1, laneEndTimes.length);
    for (const item of assigned) {
      result.push({ ...item, totalLanes });
    }
  }

  return result;
}

export function getOverlappingTasksForCandidate(
  tasks: PlannerTask[],
  candidate: { date: string; startTime: string; endTime: string },
  excludeTaskId?: string,
): PlannerTask[] {
  const candStart = timeToMinutes(candidate.startTime);
  const candEnd = timeToMinutes(candidate.endTime);
  if (!candidate.date || candStart < 0 || candEnd <= candStart) {
    return [];
  }

  return tasks
    .filter((t) => {
      if (t.date !== candidate.date || t.id === excludeTaskId) return false;
      const tStart = timeToMinutes(t.startTime);
      const tEnd = timeToMinutes(t.endTime);
      if (tStart < 0 || tEnd <= tStart) return false;
      return tStart < candEnd && tEnd > candStart;
    })
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
}

export interface AvailableTimeRange {
  startTime: string;
  endTime: string;
  startLabel: string;
  endLabel: string;
  durationMinutes: number;
  durationLabel: string;
}

export function formatDurationLabel(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h > 0 && m > 0) return `${h} giờ ${m} phút`;
  if (h > 0) return `${h} giờ`;
  return `${m} phút`;
}

export function getAvailableTimeRanges(
  tasks: PlannerTask[],
  date: string,
  dayStartMinutes = START_HOUR * 60,
  dayEndMinutes = END_HOUR * 60,
): AvailableTimeRange[] {
  if (!date || dayEndMinutes <= dayStartMinutes) return [];

  const intervals = tasks
    .filter((t) => t.date === date)
    .map((t) => {
      const s = timeToMinutes(t.startTime);
      const e = timeToMinutes(t.endTime);
      if (s < 0 || e <= s) return null;
      const clippedStart = Math.max(dayStartMinutes, s);
      const clippedEnd = Math.min(dayEndMinutes, e);
      return clippedEnd > clippedStart ? { start: clippedStart, end: clippedEnd } : null;
    })
    .filter((item): item is { start: number; end: number } => item !== null)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  // Merge contiguous / overlapping busy intervals
  const mergedBusy: Array<{ start: number; end: number }> = [];
  for (const interval of intervals) {
    const last = mergedBusy[mergedBusy.length - 1];
    if (!last || interval.start > last.end) {
      mergedBusy.push({ ...interval });
    } else {
      last.end = Math.max(last.end, interval.end);
    }
  }

  const freeRanges: AvailableTimeRange[] = [];
  let cursor = dayStartMinutes;

  for (const busy of mergedBusy) {
    if (busy.start > cursor) {
      const startTime = minutesToTime(cursor);
      const endTime = minutesToTime(busy.start);
      const durationMinutes = busy.start - cursor;
      freeRanges.push({
        startTime,
        endTime,
        startLabel: formatSlotLabel(startTime),
        endLabel: formatSlotLabel(endTime),
        durationMinutes,
        durationLabel: formatDurationLabel(durationMinutes),
      });
    }
    cursor = Math.max(cursor, busy.end);
  }

  if (cursor < dayEndMinutes) {
    const startTime = minutesToTime(cursor);
    const endTime = minutesToTime(dayEndMinutes);
    const durationMinutes = dayEndMinutes - cursor;
    freeRanges.push({
      startTime,
      endTime,
      startLabel: formatSlotLabel(startTime),
      endLabel: formatSlotLabel(endTime),
      durationMinutes,
      durationLabel: formatDurationLabel(durationMinutes),
    });
  }

  return freeRanges;
}

export function validateTaskInput(
  input: TaskInput,
  existingTasks?: PlannerTask[],
  excludeTaskId?: string,
  forbiddenBackgroundColor?: string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.isOff && !input.title.trim()) {
    errors.title = 'Vui lòng nhập tên task.';
  } else if (input.title.trim().length > 140) {
    errors.title = 'Tên task tối đa 140 ký tự.';
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    errors.date = 'Ngày không hợp lệ.';
  }

  const startMin = timeToMinutes(input.startTime);
  const endMin = timeToMinutes(input.endTime);
  if (startMin < 0) {
    errors.startTime = 'Thời gian bắt đầu không hợp lệ.';
  }
  if (endMin < 0) {
    errors.endTime = 'Thời gian kết thúc không hợp lệ.';
  }
  if (startMin >= 0 && endMin >= 0 && endMin <= startMin) {
    errors.endTime = 'Thời gian kết thúc phải sau thời gian bắt đầu.';
  }

  if (
    !errors.date &&
    !errors.startTime &&
    !errors.endTime &&
    existingTasks &&
    startMin >= 0 &&
    endMin > startMin
  ) {
    const overlaps = getOverlappingTasksForCandidate(
      existingTasks,
      {
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
      },
      excludeTaskId,
    );
    if (overlaps.length > 0) {
      const first = overlaps[0];
      const conflictName = first.isOff ? 'Off' : first.title;
      const conflictRange =
        first.isAllDay || (first.startTime === '06:00' && first.endTime === '24:00')
          ? 'Cả ngày (6h–24h)'
          : `${formatSlotLabel(first.startTime)}–${formatSlotLabel(first.endTime)}`;
      errors.endTime = `Các task trong cùng ngày không được trùng giờ (đang trùng với "${conflictName}" lúc ${conflictRange}).`;
    }
  }

  if (!Number.isFinite(input.income) || input.income < 0) {
    errors.income = 'Thu nhập phải là số không âm.';
  }

  if (input.link.trim()) {
    const trimmed = input.link.trim();
    if (!/^https?:\/\/.+/i.test(trimmed)) {
      errors.link = 'Link cần bắt đầu bằng http:// hoặc https://';
    }
  }

  if (input.lessonName && input.lessonName.trim().length > 300) {
    errors.lessonName = 'Tên bài học tối đa 300 ký tự.';
  }

  if (!input.isOff && input.color !== undefined && input.color !== '') {
    const normalizedColor = normalizeHexColor(input.color);
    const blockedBgHex = normalizeHexColor(forbiddenBackgroundColor);
    if (!normalizedColor) {
      errors.color = 'Mã màu thẻ task không hợp lệ.';
    } else if (blockedBgHex && normalizedColor === blockedBgHex) {
      errors.color = 'Không thể chọn màu trùng với màu nền giao diện.';
    } else if (existingTasks && startMin >= 0 && endMin > startMin && /^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
      const conflicts = getConflictingColorsForCandidate(
        existingTasks,
        {
          date: input.date,
          startTime: input.startTime,
          endTime: input.endTime,
        },
        excludeTaskId,
      );
      const conflictingTask = conflicts.get(normalizedColor);
      if (conflictingTask) {
        errors.color = `2 task liền kề không được chọn trùng màu (đang trùng với "${conflictingTask.title}").`;
      }
    }
  }

  return errors;
}

export const STATUS_LABELS: Record<CompletionStatus, string> = {
  pending: 'Chưa hoàn thành',
  in_progress: 'Đang làm',
  completed: 'Hoàn thành',
  absent: 'Nghỉ',
};

export const INCOME_STATUS_LABELS: Record<IncomeReceivedStatus, string> = {
  received: 'Đã thu',
  unreceived: 'Chưa thu',
};

export function getMonthKey(dateKey: string): string {
  const d = parseDateKey(dateKey);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function getIncomesForMonth(incomes: IncomeEntry[], dateKey: string): IncomeEntry[] {
  const monthKey = getMonthKey(dateKey);
  return incomes
    .filter((item) => item.month === monthKey)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function normalizeTaskIncomeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN');
}

export function getMatchingTaskIncomeForMonth(
  tasks: PlannerTask[],
  month: string,
  sourceName: string,
): {
  hasMatch: boolean;
  completedTotal: number;
  taskCount: number;
} {
  const target = normalizeTaskIncomeName(sourceName);
  if (!target || !/^\d{4}-\d{2}$/.test(month)) {
    return { hasMatch: false, completedTotal: 0, taskCount: 0 };
  }

  let taskCount = 0;
  let completedTotal = 0;

  for (const task of tasks) {
    if (!task.date.startsWith(`${month}-`)) continue;
    if (normalizeTaskIncomeName(task.title) !== target) continue;
    taskCount += 1;
    if (task.status === 'completed') {
      const amount = Number.isFinite(task.income) && task.income > 0 ? task.income : 0;
      completedTotal += amount;
    }
  }

  return {
    hasMatch: taskCount > 0,
    completedTotal: Math.round(completedTotal),
    taskCount,
  };
}

export function syncWorkspaceIncomesWithTasks(
  tasks: PlannerTask[],
  incomes: IncomeEntry[],
  nowIso = new Date().toISOString(),
): IncomeEntry[] {
  if (!Array.isArray(incomes) || incomes.length === 0) return [];

  const taskTotalsByMonthAndName = new Map<string, number>();
  for (const task of tasks) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(task.date)) continue;
    const normTitle = normalizeTaskIncomeName(task.title);
    if (!normTitle) continue;
    const key = `${task.date.slice(0, 7)}::${normTitle}`;
    const prev = taskTotalsByMonthAndName.get(key) ?? 0;
    const add =
      task.status === 'completed' && Number.isFinite(task.income) && task.income > 0
        ? Math.round(task.income)
        : 0;
    taskTotalsByMonthAndName.set(key, prev + add);
  }

  let changed = false;
  const nextIncomes = incomes.map((entry) => {
    const normSource = normalizeTaskIncomeName(entry.sourceName);
    const key = `${entry.month}::${normSource}`;
    if (normSource && taskTotalsByMonthAndName.has(key)) {
      const syncedAmount = taskTotalsByMonthAndName.get(key) ?? 0;
      if (entry.amount !== syncedAmount || entry.syncedFromTasks !== true) {
        changed = true;
        return {
          ...entry,
          amount: syncedAmount,
          syncedFromTasks: true,
          updatedAt: nowIso,
        };
      }
      return entry;
    }

    if (entry.syncedFromTasks) {
      changed = true;
      return {
        ...entry,
        amount: 0,
        syncedFromTasks: false,
        updatedAt: nowIso,
      };
    }

    return entry;
  });

  return changed ? nextIncomes : incomes;
}

export function summarizeMonthlyIncome(
  tasks: PlannerTask[],
  incomes: IncomeEntry[],
  dateKey: string,
): {
  monthTotal: number;
  taskMonthTotal: number;
  categoryMonthTotal: number;
  categoryReceived: number;
  categoryUnreceived: number;
} {
  const monthKey = getMonthKey(dateKey);
  const monthTasks = tasks.filter((t) => t.date.startsWith(`${monthKey}-`));
  const taskMonthTotal = summarizeIncome(monthTasks).completed;

  const syncedIncomes = syncWorkspaceIncomesWithTasks(tasks, incomes);
  const monthIncomes = getIncomesForMonth(syncedIncomes, dateKey);
  let categoryMonthTotal = 0;
  let unsyncedCategoryTotal = 0;
  let categoryReceived = 0;
  let categoryUnreceived = 0;

  for (const item of monthIncomes) {
    const val = Number.isFinite(item.amount) && item.amount > 0 ? item.amount : 0;
    categoryMonthTotal += val;
    if (!item.syncedFromTasks) {
      unsyncedCategoryTotal += val;
    }
    if (item.receivedStatus === 'received') {
      categoryReceived += val;
    } else {
      categoryUnreceived += val;
    }
  }

  return {
    monthTotal: taskMonthTotal + unsyncedCategoryTotal,
    taskMonthTotal,
    categoryMonthTotal,
    categoryReceived,
    categoryUnreceived,
  };
}

export function summarizeDailyIncome(
  tasks: PlannerTask[],
  dateKey: string,
): {
  dayTotal: number;
  taskCount: number;
  completedCount: number;
} {
  const dayTasks = tasks.filter((t) => t.date === dateKey);
  const summary = summarizeIncome(dayTasks);
  return {
    dayTotal: summary.completed,
    taskCount: summary.totalCount,
    completedCount: summary.completedCount,
  };
}

export interface IncomeTargetProgress {
  target: number;
  achieved: number;
  remaining: number;
  exceeded: number;
  percent: number;
}

export function calculateIncomeTargetProgress(
  targetAmount: number,
  currentIncome: number,
): IncomeTargetProgress {
  const target = Number.isFinite(targetAmount) && targetAmount > 0 ? Math.round(targetAmount) : 0;
  const achieved = Number.isFinite(currentIncome) && currentIncome > 0 ? Math.round(currentIncome) : 0;
  const remaining = Math.max(0, target - achieved);
  const exceeded = target > 0 ? Math.max(0, achieved - target) : 0;
  const percent = target > 0 ? Math.min(100, Math.round((achieved / target) * 100)) : 0;
  return {
    target,
    achieved,
    remaining,
    exceeded,
    percent,
  };
}

export function validateIncomeInput(input: IncomeInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.sourceName.trim()) {
    errors.sourceName = 'Vui lòng nhập tên nguồn thu.';
  } else if (input.sourceName.trim().length > 120) {
    errors.sourceName = 'Tên nguồn thu tối đa 120 ký tự.';
  }

  if (!/^\d{4}-\d{2}$/.test(input.month)) {
    errors.month = 'Tháng không hợp lệ.';
  }

  if (!Number.isFinite(input.amount) || input.amount < 0) {
    errors.amount = 'Số tiền phải là số không âm.';
  }

  if (input.receivedStatus !== 'received' && input.receivedStatus !== 'unreceived') {
    errors.receivedStatus = 'Tình trạng thu không hợp lệ.';
  }

  return errors;
}

export function normalizeUsername(username: string): string {
  const cleaned = username
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9@._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'user';
}

export function normalizePhoneNumber(phone: string): string {
  let digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+84')) {
    digits = '0' + digits.slice(3);
  } else if (digits.startsWith('84') && digits.length >= 10) {
    digits = '0' + digits.slice(2);
  }
  return digits.replace(/\D/g, '');
}

export function validateUsername(username: string): string | null {
  const trimmed = username.trim();
  if (!trimmed) {
    return 'Vui lòng nhập tên đăng nhập.';
  }
  if (trimmed.length < 2) {
    return 'Tên đăng nhập cần ít nhất 2 ký tự.';
  }
  if (trimmed.length > 80) {
    return 'Tên đăng nhập tối đa 80 ký tự.';
  }
  return null;
}

export function validatePhoneNumber(phone: string): string | null {
  const digits = normalizePhoneNumber(phone);
  if (!digits) {
    return 'Vui lòng nhập số điện thoại.';
  }
  if (digits.length < 9 || digits.length > 15) {
    return 'Số điện thoại cần từ 9 đến 15 chữ số.';
  }
  return null;
}

export function validateRegistrationInput(input: {
  username: string;
  phone: string;
  confirmPhone: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  const usernameErr = validateUsername(input.username);
  if (usernameErr) errors.username = usernameErr;

  const phoneErr = validatePhoneNumber(input.phone);
  if (phoneErr) errors.phone = phoneErr;

  const confirmDigits = normalizePhoneNumber(input.confirmPhone);
  const phoneDigits = normalizePhoneNumber(input.phone);
  if (!confirmDigits) {
    errors.confirmPhone = 'Vui lòng nhập lại số điện thoại.';
  } else if (!phoneErr && phoneDigits !== confirmDigits) {
    errors.confirmPhone = 'Số điện thoại nhập lại không khớp.';
  }
  return errors;
}

export function validateLoginInput(input: {
  username: string;
  phone: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  const usernameErr = validateUsername(input.username);
  if (usernameErr) errors.username = usernameErr;

  const phoneErr = validatePhoneNumber(input.phone);
  if (phoneErr) errors.phone = phoneErr;
  return errors;
}

export function buildAccountKey(username: string, phone: string): string {
  return `${normalizeUsername(username)}::${normalizePhoneNumber(phone)}`;
}

export function resolveAccountWorkspaceId(username: string, phone: string): string {
  return `acct-${normalizeUsername(username)}-${normalizePhoneNumber(phone)}`;
}

function escapeCsvCell(value: string): string {
  const safe = String(value ?? '').replace(/"/g, '""');
  return `"${safe}"`;
}

export function tasksToCsv(tasks: PlannerTask[]): string {
  const headers = [
    'Ngày',
    'Tên task',
    'Tên bài học',
    'Từ giờ',
    'Đến giờ',
    'Thu nhập (VND)',
    'Tình trạng hoàn thành',
    'Ghi chú',
    'Link',
    'Người cập nhật',
    'Cập nhật lúc',
  ];
  const sorted = [...tasks].sort((a, b) => {
    const dateDiff = a.date.localeCompare(b.date);
    if (dateDiff !== 0) return dateDiff;
    return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
  });

  const rows = sorted.map((t) => [
    t.date,
    t.isOff ? (t.title || 'Off') : t.title,
    t.lessonName || '',
    t.isAllDay ? 'Cả ngày' : formatSlotLabel(t.startTime),
    t.isAllDay ? 'Cả ngày' : formatSlotLabel(t.endTime),
    String(Math.round(t.income || 0)),
    t.isOff ? 'Off' : (STATUS_LABELS[t.status] || t.status),
    t.notes || '',
    t.link || '',
    t.createdBy || '',
    t.updatedAt || '',
  ]);

  // UTF-8 BOM for direct Google Sheets / Excel Vietnamese import
  return '\uFEFF' + [headers, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\n');
}
