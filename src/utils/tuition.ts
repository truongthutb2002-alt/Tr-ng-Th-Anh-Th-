import type {
  PlannerTask,
  StudentTuition,
  StudentTuitionInput,
  TuitionSession,
  TuitionSessionInput,
  TuitionSessionStatus,
} from '../types/planner.ts';
import {
  formatCurrencyVnd,
  formatSlotLabel,
  normalizeTaskIncomeName,
  parseDateKey,
} from './schedule.ts';

export const TUITION_STATUS_LABELS: Record<TuitionSessionStatus, string> = {
  completed: 'Hoàn thành',
  absent: 'Nghỉ',
};

export interface TuitionMonthOption {
  value: number;
  label: string;
}

export const TUITION_MONTH_OPTIONS: TuitionMonthOption[] = Array.from(
  { length: 12 },
  (_, idx) => ({
    value: idx + 1,
    label: `Tháng ${idx + 1}`,
  }),
);

export interface TuitionColorTone {
  id: string;
  name: string;
  hex: string;
  softBg: string;
  headerBg: string;
  border: string;
  textDark: string;
  accentText: string;
  buttonBg: string;
}

export const TUITION_COLOR_PALETTE: TuitionColorTone[] = [
  {
    id: 'pink',
    name: 'Hồng Kitty',
    hex: '#E11D64',
    softBg: '#FFF5F9',
    headerBg: '#FFE3EE',
    border: '#F39EC1',
    textDark: '#3D1A2B',
    accentText: '#BE1252',
    buttonBg: '#BE1252',
  },
  {
    id: 'rose',
    name: 'Hồng phấn',
    hex: '#F43F5E',
    softBg: '#FFF5F6',
    headerBg: '#FFE4E6',
    border: '#FDA4AF',
    textDark: '#4C0519',
    accentText: '#BE123C',
    buttonBg: '#BE123C',
  },
  {
    id: 'coral',
    name: 'San hô',
    hex: '#EA580C',
    softBg: '#FFF7ED',
    headerBg: '#FFEDD5',
    border: '#FDBA74',
    textDark: '#431407',
    accentText: '#C2410C',
    buttonBg: '#C2410C',
  },
  {
    id: 'amber',
    name: 'Vàng nắng',
    hex: '#D97706',
    softBg: '#FFFBEB',
    headerBg: '#FEF3C7',
    border: '#FCD34D',
    textDark: '#451A03',
    accentText: '#92400E',
    buttonBg: '#B45309',
  },
  {
    id: 'lime',
    name: 'Xanh cốm',
    hex: '#65A30D',
    softBg: '#F7FEE7',
    headerBg: '#ECFCCB',
    border: '#BEF264',
    textDark: '#1A2E05',
    accentText: '#3F6212',
    buttonBg: '#4D7C0F',
  },
  {
    id: 'emerald',
    name: 'Xanh bạc hà',
    hex: '#059669',
    softBg: '#ECFDF5',
    headerBg: '#D1FAE5',
    border: '#6EE7B7',
    textDark: '#022C22',
    accentText: '#047857',
    buttonBg: '#047857',
  },
  {
    id: 'teal',
    name: 'Xanh ngọc',
    hex: '#0D9488',
    softBg: '#F0FDFA',
    headerBg: '#CCFBF1',
    border: '#5EEAD4',
    textDark: '#042F2E',
    accentText: '#0F766E',
    buttonBg: '#0F766E',
  },
  {
    id: 'sky',
    name: 'Xanh da trời',
    hex: '#0284C7',
    softBg: '#F0F9FF',
    headerBg: '#E0F2FE',
    border: '#7DD3FC',
    textDark: '#082F49',
    accentText: '#0369A1',
    buttonBg: '#0369A1',
  },
  {
    id: 'blue',
    name: 'Xanh coban',
    hex: '#2563EB',
    softBg: '#EFF6FF',
    headerBg: '#DBEAFE',
    border: '#93C5FD',
    textDark: '#172554',
    accentText: '#1D4ED8',
    buttonBg: '#1D4ED8',
  },
  {
    id: 'indigo',
    name: 'Chàm dịu',
    hex: '#4F46E5',
    softBg: '#EEF2FF',
    headerBg: '#E0E7FF',
    border: '#A5B4FC',
    textDark: '#1E1B4B',
    accentText: '#4338CA',
    buttonBg: '#4338CA',
  },
  {
    id: 'violet',
    name: 'Tím oải hương',
    hex: '#7C3AED',
    softBg: '#F5F3FF',
    headerBg: '#EDE9FE',
    border: '#C4B5FD',
    textDark: '#2E1065',
    accentText: '#6D28D9',
    buttonBg: '#6D28D9',
  },
  {
    id: 'fuchsia',
    name: 'Tím hồng',
    hex: '#C026D3',
    softBg: '#FDF4FF',
    headerBg: '#FAE8FF',
    border: '#F0ABFC',
    textDark: '#4A044E',
    accentText: '#A21CAF',
    buttonBg: '#A21CAF',
  },
];

export const DEFAULT_TUITION_COLOR = TUITION_COLOR_PALETTE[0].hex;

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const intVal = Number.parseInt(m[1], 16);
  return {
    r: (intVal >> 16) & 255,
    g: (intVal >> 8) & 255,
    b: intVal & 255,
  };
}

export function getTuitionColorTheme(color?: string): TuitionColorTone {
  const normalized = (color || '').trim().toLowerCase();
  const preset = TUITION_COLOR_PALETTE.find(
    (item) => item.hex.toLowerCase() === normalized || item.id === normalized,
  );
  if (preset) return preset;

  const rgb = hexToRgb(normalized);
  if (rgb) {
    const darkened = `rgb(${Math.max(0, Math.round(rgb.r * 0.65))}, ${Math.max(0, Math.round(rgb.g * 0.65))}, ${Math.max(0, Math.round(rgb.b * 0.65))})`;
    return {
      id: 'custom',
      name: 'Màu tự chọn',
      hex: normalized,
      softBg: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.07)`,
      headerBg: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.16)`,
      border: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.38)`,
      textDark: '#2B1B24',
      accentText: darkened,
      buttonBg: darkened,
    };
  }

  return TUITION_COLOR_PALETTE[0];
}

const WEEKDAY_NAMES_VI = [
  'Chủ nhật',
  'Thứ 2',
  'Thứ 3',
  'Thứ 4',
  'Thứ 5',
  'Thứ 6',
  'Thứ 7',
];

/**
 * Formats dateKey as Vietnamese weekday + DD/MM without year (e.g. "Thứ 7, 14/11").
 */
export function formatVietnameseWeekdayDate(dateKey: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey;
  const date = parseDateKey(dateKey);
  const weekday = WEEKDAY_NAMES_VI[date.getDay()] ?? '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${weekday}, ${dd}/${mm}`;
}

export function formatMonthDisplay(monthOrKey: string | number): string {
  if (typeof monthOrKey === 'number') {
    const safe = Math.max(1, Math.min(12, Math.round(monthOrKey)));
    return `Tháng ${safe}`;
  }
  const keyMatch = /^\d{4}-(\d{2})$/.exec(monthOrKey);
  if (keyMatch) {
    return `Tháng ${Number(keyMatch[1])}`;
  }
  return monthOrKey;
}

export function buildMonthKey(year: number, monthNumber: number): string {
  const clamped = Math.max(1, Math.min(12, Math.round(monthNumber)));
  return `${year}-${String(clamped).padStart(2, '0')}`;
}

export interface MonthDayOption {
  day: number;
  dateKey: string;
  label: string;
}

export function getDaysInMonthOptions(year: number, monthNumber: number): MonthDayOption[] {
  const safeMonth = Math.max(1, Math.min(12, Math.round(monthNumber)));
  const maxDay = new Date(year, safeMonth, 0).getDate();
  const mm = String(safeMonth).padStart(2, '0');
  const options: MonthDayOption[] = [];

  for (let d = 1; d <= maxDay; d++) {
    const dd = String(d).padStart(2, '0');
    const dateKey = `${year}-${mm}-${dd}`;
    const weekday = WEEKDAY_NAMES_VI[new Date(year, safeMonth - 1, d).getDay()] ?? '';
    options.push({
      day: d,
      dateKey,
      label: `${dd}/${mm} (${weekday})`,
    });
  }
  return options;
}

export function getSessionsForMonth(
  sessions: TuitionSession[],
  monthKeyOrNumber: string | number,
): TuitionSession[] {
  const monthSuffix =
    typeof monthKeyOrNumber === 'number'
      ? `-${String(Math.max(1, Math.min(12, Math.round(monthKeyOrNumber)))).padStart(2, '0')}-`
      : null;

  return sessions
    .filter((s) =>
      monthSuffix ? s.date.includes(monthSuffix) : s.date.startsWith(`${monthKeyOrNumber}-`),
    )
    .sort((a, b) => {
      const dateDiff = a.date.localeCompare(b.date);
      if (dateDiff !== 0) return dateDiff;
      return a.createdAt.localeCompare(b.createdAt);
    });
}

export function summarizeStudentTuition(
  sessions: TuitionSession[],
  feePerSession: number,
  monthKeyOrNumber: string | number,
): {
  monthLabel: string;
  completedCount: number;
  absentCount: number;
  totalTuition: number;
} {
  const monthSessions = getSessionsForMonth(sessions, monthKeyOrNumber);
  let completedCount = 0;
  let absentCount = 0;

  for (const s of monthSessions) {
    if (s.status === 'completed') {
      completedCount += 1;
    } else {
      absentCount += 1;
    }
  }

  const safeFee =
    Number.isFinite(feePerSession) && feePerSession > 0 ? Math.round(feePerSession) : 0;

  return {
    monthLabel: formatMonthDisplay(monthKeyOrNumber),
    completedCount,
    absentCount,
    totalTuition: completedCount * safeFee,
  };
}

export function validateStudentTuitionInput(
  input: StudentTuitionInput,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.studentName.trim()) {
    errors.studentName = 'Vui lòng nhập tên học sinh.';
  } else if (input.studentName.trim().length > 100) {
    errors.studentName = 'Tên học sinh tối đa 100 ký tự.';
  }

  if (input.studySchedule.trim().length > 160) {
    errors.studySchedule = 'Thời gian học tối đa 160 ký tự.';
  }

  if (!Number.isFinite(input.feePerSession) || input.feePerSession < 0) {
    errors.feePerSession = 'Học phí mỗi buổi phải là số không âm.';
  }

  if (
    input.month !== undefined &&
    (!Number.isInteger(input.month) || input.month < 1 || input.month > 12)
  ) {
    errors.month = 'Tháng phải từ Tháng 1 đến Tháng 12.';
  }

  return errors;
}

export function validateTuitionSessionInput(
  input: TuitionSessionInput,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    errors.date = 'Ngày học không hợp lệ.';
  }
  if (!input.content.trim()) {
    errors.content = 'Vui lòng nhập nội dung buổi học.';
  } else if (input.content.trim().length > 300) {
    errors.content = 'Nội dung buổi học tối đa 300 ký tự.';
  }
  if (input.status !== 'completed' && input.status !== 'absent') {
    errors.status = 'Tình trạng lớp học không hợp lệ.';
  }
  return errors;
}

function escapeCsvCell(value: string): string {
  const safe = String(value ?? '').replace(/"/g, '""');
  return `"${safe}"`;
}

export function tuitionSheetToCsv(
  student: StudentTuition,
  monthNumber: number,
): string {
  const monthSessions = getSessionsForMonth(student.sessions, monthNumber);
  const summary = summarizeStudentTuition(
    student.sessions,
    student.feePerSession,
    monthNumber,
  );

  const infoRows = [
    ['Học sinh', student.studentName],
    ['Thời gian học', student.studySchedule || 'Chưa cập nhật'],
    [`Học phí ${formatMonthDisplay(monthNumber)}`, formatCurrencyVnd(summary.totalTuition)],
    ['Học phí mỗi buổi', formatCurrencyVnd(student.feePerSession)],
    [],
    ['STT', 'Ngày học', 'Nội dung', 'Tình trạng lớp học'],
  ];

  const sessionRows = monthSessions.map((session, idx) => [
    String(idx + 1),
    formatVietnameseWeekdayDate(session.date),
    session.content,
    TUITION_STATUS_LABELS[session.status] || session.status,
  ]);

  const footerRow = [
    `Tổng hợp ${formatMonthDisplay(monthNumber)}`,
    `${summary.completedCount} buổi hoàn thành`,
    `${summary.absentCount} buổi nghỉ`,
    formatCurrencyVnd(summary.totalTuition),
  ];

  return (
    '\uFEFF' +
    [...infoRows, ...sessionRows, footerRow]
      .map((row) => row.map(escapeCsvCell).join(','))
      .join('\n')
  );
}

const RECEIPT_WEEKDAY_NAMES_VI = [
  'Chủ Nhật',
  'Thứ Hai',
  'Thứ Ba',
  'Thứ Tư',
  'Thứ Năm',
  'Thứ Sáu',
  'Thứ Bảy',
];

export function formatReceiptNumber(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  return new Intl.NumberFormat('vi-VN').format(safe);
}

/**
 * Formats YYYY-MM-DD as full Vietnamese weekday + D/M without leading zeros or year
 * (e.g. "Thứ Năm, 1/10", "Chủ Nhật, 4/10", "Thứ Ba, 6/10").
 */
export function formatReceiptWeekdayDate(dateKey: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey;
  const date = parseDateKey(dateKey);
  const weekday = RECEIPT_WEEKDAY_NAMES_VI[date.getDay()] ?? '';
  return `${weekday}, ${date.getDate()}/${date.getMonth() + 1}`;
}

export interface TuitionSlipRow {
  id: string;
  date: string;
  sourceTaskId?: string;
  sessionNumber: number | null;
  dateLabel: string;
  content: string;
  status: TuitionSessionStatus;
  statusLabel: string;
}

export interface TuitionSlipData {
  headerTitle: string;
  studentName: string;
  studySchedule: string;
  monthNumber: number;
  monthLabel: string;
  feePerSession: number;
  totalSessions: number;
  absentCount: number;
  subtotalTuition: number;
  adjustment: number;
  totalTuition: number;
  rows: TuitionSlipRow[];
  formulaText: string;
  plainText: string;
}

export function buildTuitionSlipData(
  student: StudentTuition,
  monthNumber?: number,
  adjustment = 0,
): TuitionSlipData {
  const safeMonth =
    typeof monthNumber === 'number' && monthNumber >= 1 && monthNumber <= 12
      ? Math.round(monthNumber)
      : student.month >= 1 && student.month <= 12
        ? student.month
        : new Date().getMonth() + 1;

  const safeFee =
    Number.isFinite(student.feePerSession) && student.feePerSession > 0
      ? Math.round(student.feePerSession)
      : 0;

  const safeAdjustment = Number.isFinite(adjustment) ? Math.round(adjustment) : 0;
  const monthSessions = getSessionsForMonth(student.sessions, safeMonth);
  const summary = summarizeStudentTuition(student.sessions, safeFee, safeMonth);
  const monthLabel = formatMonthDisplay(safeMonth);

  let completedSeq = 0;
  const rows: TuitionSlipRow[] = monthSessions.map((session) => {
    const isCompleted = session.status === 'completed';
    if (isCompleted) {
      completedSeq += 1;
    }
    return {
      id: session.id,
      date: session.date,
      sourceTaskId: session.sourceTaskId,
      sessionNumber: isCompleted ? completedSeq : null,
      dateLabel: formatReceiptWeekdayDate(session.date),
      content: session.content,
      status: session.status,
      statusLabel: TUITION_STATUS_LABELS[session.status] || session.status,
    };
  });

  const subtotalTuition = summary.totalTuition;
  const totalTuition = Math.max(0, subtotalTuition + safeAdjustment);
  const baseFormula = `Tổng cộng: ${summary.completedCount}b x ${formatReceiptNumber(safeFee)} = ${formatReceiptNumber(subtotalTuition)}`;
  const formulaText =
    safeAdjustment !== 0
      ? `${baseFormula} (${safeAdjustment > 0 ? `+${formatReceiptNumber(safeAdjustment)}` : `-${formatReceiptNumber(Math.abs(safeAdjustment))}`}) = ${formatReceiptNumber(totalTuition)}`
      : baseFormula;

  const headerTitle = `${student.studentName.toLocaleUpperCase('vi-VN')} (THÁNG ${safeMonth} - ${formatReceiptNumber(safeFee)})`;

  const rowLines = rows.map((row) =>
    row.status === 'absent'
      ? `• ${row.dateLabel}: Nghỉ`
      : `${row.sessionNumber}. ${row.dateLabel} | ${row.content} | ${row.statusLabel}`,
  );

  const plainText = [
    headerTitle,
    ...(student.studySchedule ? [student.studySchedule] : []),
    ...rowLines,
    formulaText,
  ].join('\n');

  return {
    headerTitle,
    studentName: student.studentName,
    studySchedule: student.studySchedule,
    monthNumber: safeMonth,
    monthLabel,
    feePerSession: safeFee,
    totalSessions: summary.completedCount,
    absentCount: summary.absentCount,
    subtotalTuition,
    adjustment: safeAdjustment,
    totalTuition,
    rows,
    formulaText,
    plainText,
  };
}

export function buildSessionContentFromTask(task: PlannerTask): string {
  const trimmedLesson = (task.lessonName || '').trim();
  if (trimmedLesson) {
    return trimmedLesson.slice(0, 300);
  }
  const trimmedNotes = (task.notes || '').trim();
  if (trimmedNotes) {
    return trimmedNotes.slice(0, 300);
  }
  return `Buổi học (${formatSlotLabel(task.startTime)}–${formatSlotLabel(task.endTime)})`;
}

export function syncWorkspaceStudentsWithTasks(
  tasks: PlannerTask[],
  students: StudentTuition[],
  nowIso = new Date().toISOString(),
): StudentTuition[] {
  if (!Array.isArray(students) || students.length === 0) return [];

  const syncableTasksByName = new Map<string, PlannerTask[]>();
  for (const task of tasks) {
    if (task.isOff) continue;
    if (task.status !== 'completed' && task.status !== 'absent') continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(task.date)) continue;
    const normTitle = normalizeTaskIncomeName(task.title);
    if (!normTitle) continue;
    const list = syncableTasksByName.get(normTitle) ?? [];
    list.push(task);
    syncableTasksByName.set(normTitle, list);
  }

  let anyStudentChanged = false;

  const nextStudents = students.map((student) => {
    const normStudentName = normalizeTaskIncomeName(student.studentName);
    const matchingTasks = normStudentName
      ? (syncableTasksByName.get(normStudentName) ?? [])
      : [];
    const matchingTaskMap = new Map(matchingTasks.map((t) => [t.id, t]));
    const dismissedSet = new Set(student.dismissedSyncedTaskIds ?? []);
    const seenTaskIds = new Set<string>();

    let studentChanged = false;
    const nextSessions: TuitionSession[] = [];

    for (const session of student.sessions || []) {
      if (!session.sourceTaskId) {
        nextSessions.push(session);
        continue;
      }

      const task = matchingTaskMap.get(session.sourceTaskId);
      if (!task || dismissedSet.has(session.sourceTaskId)) {
        studentChanged = true;
        continue;
      }

      seenTaskIds.add(task.id);
      const derivedStatus: TuitionSessionStatus =
        task.status === 'absent' ? 'absent' : 'completed';
      const derivedContent = buildSessionContentFromTask(task);
      const nextSignature = `${task.date}|${derivedStatus}|${derivedContent}`;

      if (session.sourceTaskSignature !== nextSignature) {
        studentChanged = true;
        nextSessions.push({
          ...session,
          date: task.date,
          content: derivedContent,
          status: derivedStatus,
          sourceTaskSignature: nextSignature,
          updatedAt: nowIso,
        });
      } else {
        nextSessions.push(session);
      }
    }

    for (const task of matchingTasks) {
      if (seenTaskIds.has(task.id) || dismissedSet.has(task.id)) continue;
      studentChanged = true;
      const derivedStatus: TuitionSessionStatus =
        task.status === 'absent' ? 'absent' : 'completed';
      const derivedContent = buildSessionContentFromTask(task);
      nextSessions.push({
        id: `ses-sync-${task.id}`,
        date: task.date,
        content: derivedContent,
        status: derivedStatus,
        sourceTaskId: task.id,
        sourceTaskSignature: `${task.date}|${derivedStatus}|${derivedContent}`,
        createdAt: task.createdAt || nowIso,
        updatedAt: nowIso,
      });
    }

    if (!studentChanged) {
      return student;
    }

    anyStudentChanged = true;
    return {
      ...student,
      sessions: nextSessions,
      updatedAt: nowIso,
    };
  });

  return anyStudentChanged ? nextStudents : students;
}
