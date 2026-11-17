import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAccountKey,
  calculateIncomeTargetProgress,
  computeTaskLayoutLanes,
  formatSlotLabel,
  generateTimeSlots,
  getAvailableTimeRanges,
  getConflictingColorsForCandidate,
  getMatchingTaskIncomeForMonth,
  getMonthGrid,
  getOverlappingTasksForCandidate,
  getTaskColorTheme,
  getTasksForSlot,
  getUpcomingDayTasks,
  getWeekDates,
  normalizePhoneNumber,
  normalizeTimeInput,
  normalizeUsername,
  OFF_TASK_COLOR,
  PASTEL_60_COLORS,
  pickAvailablePastelColor,
  resolveAccountWorkspaceId,
  summarizeDailyIncome,
  summarizeIncome,
  summarizeMonthlyIncome,
  syncWorkspaceIncomesWithTasks,
  tasksToCsv,
  timeToMinutes,
  validateIncomeInput,
  validateLoginInput,
  validatePhoneNumber,
  validateRegistrationInput,
  validateTaskInput,
  validateUsername,
} from './schedule';
import {
  convertSolarToLunar,
  formatLunarDdMm,
  formatLunarShort,
  getLunarFromDateKey,
} from './lunar';
import type { IncomeEntry, PlannerTask } from '../types/planner';

const sampleTask: PlannerTask = {
  id: 'task-1',
  date: '2026-11-13',
  title: 'Thiết kế banner Hello Kitty',
  startTime: '06:15',
  endTime: '07:00',
  income: 450000,
  status: 'completed',
  notes: 'Gửi file PNG + PSD',
  link: 'https://docs.google.com/spreadsheets/d/demo',
  createdBy: 'truongthutb2002@gmail.com',
  createdAt: '2026-11-13T06:00:00.000Z',
  updatedAt: '2026-11-13T06:00:00.000Z',
};

test('generateTimeSlots starts at 6h and increments by 15 minutes until 23h45', () => {
  const slots = generateTimeSlots();
  assert.equal(slots.length, 72);
  assert.equal(slots[0].time, '06:00');
  assert.equal(slots[0].label, '6h');
  assert.equal(slots[1].time, '06:15');
  assert.equal(slots[1].label, '6h15');
  assert.equal(slots[2].time, '06:30');
  assert.equal(slots[2].label, '6h30');
  assert.equal(slots[slots.length - 1].time, '23:45');
  assert.equal(slots[slots.length - 1].label, '23h45');
});

test('formatSlotLabel and timeToMinutes handle boundary values', () => {
  assert.equal(formatSlotLabel('06:00'), '6h');
  assert.equal(formatSlotLabel('06:15'), '6h15');
  assert.equal(formatSlotLabel('14:30'), '14h30');
  assert.equal(timeToMinutes('06:15'), 375);
  assert.equal(timeToMinutes('24:00'), 1440);
  assert.equal(timeToMinutes('25:00'), -1);
});

test('getTasksForSlot marks start slot vs continuation slots accurately without duplicating start', () => {
  const slot600 = getTasksForSlot([sampleTask], '2026-11-13', '06:00');
  const slot615 = getTasksForSlot([sampleTask], '2026-11-13', '06:15');
  const slot630 = getTasksForSlot([sampleTask], '2026-11-13', '06:30');
  const slot645 = getTasksForSlot([sampleTask], '2026-11-13', '06:45');
  const slot700 = getTasksForSlot([sampleTask], '2026-11-13', '07:00');

  assert.equal(slot600.length, 0);
  assert.equal(slot615.length, 1);
  assert.equal(slot615[0].isStartSlot, true);
  assert.equal(slot630.length, 1);
  assert.equal(slot630[0].isStartSlot, false);
  assert.equal(slot645.length, 1);
  assert.equal(slot645[0].isStartSlot, false);
  assert.equal(slot700.length, 0);
});

test('normalizeTimeInput parses manual time formats and getTasksForSlot handles non-15m tasks', () => {
  assert.equal(normalizeTimeInput('8:10'), '08:10');
  assert.equal(normalizeTimeInput('8h05'), '08:05');
  assert.equal(normalizeTimeInput('14h'), '14:00');
  assert.equal(normalizeTimeInput('930'), '09:30');
  assert.equal(normalizeTimeInput('24:00'), '24:00');
  assert.equal(normalizeTimeInput('24:15'), null);
  assert.equal(normalizeTimeInput('abc'), null);

  const shortTask: PlannerTask = {
    ...sampleTask,
    id: 'task-short',
    startTime: '08:05',
    endTime: '08:12',
  };
  const slot800 = getTasksForSlot([shortTask], '2026-11-13', '08:00');
  const slot815 = getTasksForSlot([shortTask], '2026-11-13', '08:15');
  assert.equal(slot800.length, 1);
  assert.equal(slot800[0].isStartSlot, true);
  assert.equal(slot815.length, 0);
});

test('summarizeIncome aggregates total, completed, and pending income', () => {
  const tasks: PlannerTask[] = [
    sampleTask,
    {
      ...sampleTask,
      id: 'task-2',
      title: 'Viết content',
      startTime: '09:00',
      endTime: '10:00',
      income: 250000,
      status: 'pending',
    },
  ];
  const summary = summarizeIncome(tasks);
  assert.equal(summary.total, 700000);
  assert.equal(summary.completed, 450000);
  assert.equal(summary.pending, 250000);
  assert.equal(summary.completedCount, 1);
  assert.equal(summary.totalCount, 2);
});

test('getWeekDates and getMonthGrid return Monday-start grids', () => {
  // 2026-11-13 is Friday
  const week = getWeekDates('2026-11-13');
  assert.equal(week.length, 7);
  assert.equal(week[0], '2026-11-09'); // Monday
  assert.equal(week[6], '2026-11-15'); // Sunday

  const grid = getMonthGrid('2026-11-13');
  assert.equal(grid.length, 42);
  const nov1 = grid.find((c) => c.dateKey === '2026-11-01');
  assert.ok(nov1?.inCurrentMonth);
});

test('validateTaskInput catches empty title, inverted times, negative income, and malformed link', () => {
  const errors = validateTaskInput({
    date: '2026-11-13',
    title: '   ',
    startTime: '10:00',
    endTime: '09:00',
    income: -100,
    status: 'pending',
    notes: '',
    link: 'not-a-url',
  });
  assert.ok(errors.title);
  assert.ok(errors.endTime);
  assert.ok(errors.income);
  assert.ok(errors.link);
});

test('tasksToCsv outputs UTF-8 BOM and properly escaped Vietnamese fields', () => {
  const csv = tasksToCsv([sampleTask]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"Thiết kế banner Hello Kitty"'));
  assert.ok(csv.includes('"6h15"'));
  assert.ok(csv.includes('"450000"'));
  assert.ok(csv.includes('"Hoàn thành"'));
});

test('summarizeMonthlyIncome combines task income and income category entries for the active month', () => {
  const incomes: IncomeEntry[] = [
    {
      id: 'inc-1',
      month: '2026-11',
      sourceName: 'Lương cứng',
      amount: 5000000,
      receivedStatus: 'received',
      createdBy: 'user',
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    },
    {
      id: 'inc-2',
      month: '2026-11',
      sourceName: 'Hoa hồng đơn hàng',
      amount: 1200000,
      receivedStatus: 'unreceived',
      createdBy: 'user',
      createdAt: '2026-11-02T00:00:00.000Z',
      updatedAt: '2026-11-02T00:00:00.000Z',
    },
    {
      id: 'inc-other',
      month: '2026-12',
      sourceName: 'Thưởng tháng sau',
      amount: 999999,
      receivedStatus: 'unreceived',
      createdBy: 'user',
      createdAt: '2026-12-01T00:00:00.000Z',
      updatedAt: '2026-12-01T00:00:00.000Z',
    },
  ];
  const pendingTaskSameMonth: PlannerTask = {
    ...sampleTask,
    id: 'task-pending-month',
    date: '2026-11-15',
    income: 300000,
    status: 'pending',
  };
  const res = summarizeMonthlyIncome([sampleTask, pendingTaskSameMonth], incomes, '2026-11-13');
  assert.equal(res.taskMonthTotal, 450000);
  assert.equal(res.categoryMonthTotal, 6200000);
  assert.equal(res.categoryReceived, 5000000);
  assert.equal(res.categoryUnreceived, 1200000);
  assert.equal(res.monthTotal, 6650000);
});

test('summarizeDailyIncome totals only completed task income for selected date', () => {
  const tasks: PlannerTask[] = [
    sampleTask,
    {
      ...sampleTask,
      id: 'task-2',
      date: '2026-11-13',
      income: 150000,
      status: 'pending',
    },
    {
      ...sampleTask,
      id: 'task-other-day',
      date: '2026-11-14',
      income: 999000,
      status: 'completed',
    },
  ];
  const daily = summarizeDailyIncome(tasks, '2026-11-13');
  assert.equal(daily.dayTotal, 450000);
  assert.equal(daily.taskCount, 2);
  assert.equal(daily.completedCount, 1);
});

test('validateIncomeInput enforces sourceName, month format, and non-negative amount', () => {
  const errs = validateIncomeInput({
    month: '2026-13-01',
    sourceName: '  ',
    amount: -50,
    receivedStatus: 'received',
  });
  assert.ok(errs.sourceName);
  assert.ok(errs.month);
  assert.ok(errs.amount);

  const ok = validateIncomeInput({
    month: '2026-11',
    sourceName: 'Bán sticker Hello Kitty',
    amount: 250000,
    receivedStatus: 'unreceived',
  });
  assert.equal(Object.keys(ok).length, 0);
});

test('account registration, phone normalization, and isolated workspace resolution', () => {
  assert.equal(validateUsername('  '), 'Vui lòng nhập tên đăng nhập.');
  assert.equal(validateUsername('A'), 'Tên đăng nhập cần ít nhất 2 ký tự.');
  assert.equal(validateUsername('Thư Kitty'), null);

  assert.equal(normalizePhoneNumber('0912-345.678'), '0912345678');
  assert.equal(normalizePhoneNumber('+84 912 345 678'), '0912345678');
  assert.ok(validatePhoneNumber('123'));
  assert.equal(validatePhoneNumber('0912345678'), null);

  const regMismatch = validateRegistrationInput({
    username: 'Thư Kitty',
    phone: '0912345678',
    confirmPhone: '0912345679',
  });
  assert.ok(regMismatch.confirmPhone);

  const regOk = validateRegistrationInput({
    username: 'Thư Kitty',
    phone: '0912 345 678',
    confirmPhone: '+84912345678',
  });
  assert.equal(Object.keys(regOk).length, 0);

  const loginErr = validateLoginInput({ username: 'T', phone: '12' });
  assert.ok(loginErr.username);
  assert.ok(loginErr.phone);

  assert.equal(normalizeUsername('Nguyễn Thư Kitty'), 'nguyen-thu-kitty');
  assert.equal(buildAccountKey('Nguyễn Thư', '0912 345 678'), 'nguyen-thu::0912345678');
  assert.equal(
    resolveAccountWorkspaceId('Nguyễn Thư', '0912345678'),
    'acct-nguyen-thu-0912345678',
  );
  assert.notEqual(
    resolveAccountWorkspaceId('Nguyễn Thư', '0912345678'),
    resolveAccountWorkspaceId('Minh Anh', '0988777666'),
  );
});

test('syncWorkspaceIncomesWithTasks syncs matching completed tasks in month without double-counting monthly total', () => {
  const tasks: PlannerTask[] = [
    {
      ...sampleTask,
      id: 't-teach-1',
      date: '2026-11-10',
      title: 'Dạy kèm Toán',
      income: 200000,
      status: 'completed',
    },
    {
      ...sampleTask,
      id: 't-teach-2',
      date: '2026-11-14',
      title: '  dạy kèm toán ',
      income: 300000,
      status: 'completed',
    },
    {
      ...sampleTask,
      id: 't-teach-pending',
      date: '2026-11-16',
      title: 'Dạy kèm Toán',
      income: 150000,
      status: 'pending',
    },
  ];

  const incomes: IncomeEntry[] = [
    {
      id: 'inc-teach',
      month: '2026-11',
      sourceName: 'Dạy kèm Toán',
      amount: 0,
      receivedStatus: 'unreceived',
      createdBy: 'user',
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    },
    {
      id: 'inc-salary',
      month: '2026-11',
      sourceName: 'Lương cứng',
      amount: 5000000,
      receivedStatus: 'received',
      createdBy: 'user',
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    },
  ];

  const matchInfo = getMatchingTaskIncomeForMonth(tasks, '2026-11', 'Dạy kèm Toán');
  assert.equal(matchInfo.hasMatch, true);
  assert.equal(matchInfo.completedTotal, 500000);
  assert.equal(matchInfo.taskCount, 3);

  const synced = syncWorkspaceIncomesWithTasks(tasks, incomes, '2026-11-14T10:00:00.000Z');
  assert.equal(synced[0].amount, 500000);
  assert.equal(synced[0].syncedFromTasks, true);
  assert.equal(synced[1].amount, 5000000);
  assert.equal(synced[1].syncedFromTasks, undefined);

  // Monthly total should NOT double-count Dạy kèm Toán (500k from calendar + 5,000k from Lương cứng = 5,500k)
  const monthly = summarizeMonthlyIncome(tasks, synced, '2026-11-14');
  assert.equal(monthly.taskMonthTotal, 500000);
  assert.equal(monthly.categoryMonthTotal, 5500000);
  assert.equal(monthly.monthTotal, 5500000);

  // Deleting matching tasks resets synced entry back to 0 without touching Lương cứng
  const afterDelete = syncWorkspaceIncomesWithTasks([], synced, '2026-11-15T10:00:00.000Z');
  assert.equal(afterDelete[0].amount, 0);
  assert.equal(afterDelete[0].syncedFromTasks, false);
  assert.equal(afterDelete[1].amount, 5000000);
});

test('PASTEL_60_COLORS provides 60 unique pastel hex colors', () => {
  assert.equal(PASTEL_60_COLORS.length, 60);
  const uniqueHexes = new Set(PASTEL_60_COLORS.map((c) => c.hex.toUpperCase()));
  assert.equal(uniqueHexes.size, 60);
  for (const tone of PASTEL_60_COLORS) {
    assert.match(tone.hex, /^#[0-9A-F]{6}$/);
    assert.match(tone.border, /^#[0-9A-F]{6}$/);
  }
});

test('adjacent tasks cannot share the same color while non-adjacent tasks can', () => {
  const colorA = PASTEL_60_COLORS[0].hex;
  const colorB = PASTEL_60_COLORS[1].hex;
  const colorC = PASTEL_60_COLORS[2].hex;

  const existing: PlannerTask[] = [
    {
      ...sampleTask,
      id: 't1',
      date: '2026-11-14',
      title: 'Ca 1',
      startTime: '08:00',
      endTime: '09:00',
      color: colorA,
    },
    {
      ...sampleTask,
      id: 't2',
      date: '2026-11-14',
      title: 'Ca 2',
      startTime: '09:00',
      endTime: '10:00',
      color: colorB,
    },
  ];

  // Candidate right after Ca 2 (10:00-11:00) touches Ca 2 (colorB blocked), NOT Ca 1 (colorA allowed!)
  const conflictsAfterT2 = getConflictingColorsForCandidate(existing, {
    date: '2026-11-14',
    startTime: '10:00',
    endTime: '11:00',
  });
  assert.equal(conflictsAfterT2.has(colorB), true);
  assert.equal(conflictsAfterT2.has(colorA), false);

  const errSameAsNeighbor = validateTaskInput(
    {
      date: '2026-11-14',
      title: 'Ca 3',
      startTime: '10:00',
      endTime: '11:00',
      income: 100000,
      status: 'pending',
      color: colorB,
      notes: '',
      link: '',
    },
    existing,
  );
  assert.ok(errSameAsNeighbor.color);

  const okReuseNonAdjacent = validateTaskInput(
    {
      date: '2026-11-14',
      title: 'Ca 3',
      startTime: '10:00',
      endTime: '11:00',
      income: 100000,
      status: 'pending',
      color: colorA,
      notes: '',
      link: '',
    },
    existing,
  );
  assert.equal(okReuseNonAdjacent.color, undefined);

  // Auto picker avoids colorB when adding at 10:00-11:00 if starting at index 1
  const autoPicked = pickAvailablePastelColor(
    existing,
    { date: '2026-11-14', startTime: '10:00', endTime: '11:00' },
    undefined,
    1,
  );
  assert.equal(autoPicked, colorC);

  // Editing t2 itself does not self-conflict with t2's own color
  const okEditingSelf = validateTaskInput(
    {
      date: '2026-11-14',
      title: 'Ca 2 cập nhật',
      startTime: '09:00',
      endTime: '10:00',
      income: 200000,
      status: 'completed',
      color: colorB,
      notes: '',
      link: '',
    },
    existing,
    't2',
  );
  assert.equal(okEditingSelf.color, undefined);
});

test('computeTaskLayoutLanes spans full width for sequential tasks and splits lanes for overlapping tasks', () => {
  const dayTasks: PlannerTask[] = [
    {
      ...sampleTask,
      id: 'seq-1',
      startTime: '08:00',
      endTime: '09:30',
    },
    {
      ...sampleTask,
      id: 'ov-1',
      startTime: '10:00',
      endTime: '11:30',
    },
    {
      ...sampleTask,
      id: 'ov-2',
      startTime: '10:30',
      endTime: '12:00',
    },
  ];

  const positioned = computeTaskLayoutLanes(dayTasks);
  assert.equal(positioned.length, 3);
  assert.equal(positioned[0].totalLanes, 1);
  assert.equal(positioned[0].lane, 0);
  assert.equal(positioned[0].endMin - positioned[0].startMin, 90);
  assert.equal(positioned[1].totalLanes, 2);
  assert.equal(positioned[1].lane, 0);
  assert.equal(positioned[2].totalLanes, 2);
  assert.equal(positioned[2].lane, 1);
});

test('Off tasks require no title/details, support Cả ngày, and resolve to medium gray', () => {
  const offTheme = getTaskColorTheme(undefined, true);
  assert.equal(offTheme.hex, OFF_TASK_COLOR);
  assert.equal(offTheme.hex, '#9CA3AF');

  const offAllDayErrors = validateTaskInput({
    date: '2026-11-14',
    title: '',
    startTime: '06:00',
    endTime: '24:00',
    income: 0,
    status: 'pending',
    isOff: true,
    isAllDay: true,
    color: OFF_TASK_COLOR,
    notes: '',
    link: '',
  });
  assert.equal(Object.keys(offAllDayErrors).length, 0);

  // Off tasks do not block pastel colors for neighboring tasks and two Off tasks can share gray
  const existingWithOff: PlannerTask[] = [
    {
      ...sampleTask,
      id: 'off-1',
      date: '2026-11-14',
      title: 'Off',
      startTime: '08:00',
      endTime: '12:00',
      income: 0,
      status: 'pending',
      isOff: true,
      color: OFF_TASK_COLOR,
    },
  ];

  const conflicts = getConflictingColorsForCandidate(existingWithOff, {
    date: '2026-11-14',
    startTime: '12:00',
    endTime: '13:00',
  });
  assert.equal(conflicts.size, 0);

  const secondOffErrors = validateTaskInput(
    {
      date: '2026-11-14',
      title: '',
      startTime: '12:00',
      endTime: '14:00',
      income: 0,
      status: 'pending',
      isOff: true,
      color: OFF_TASK_COLOR,
      notes: '',
      link: '',
    },
    existingWithOff,
  );
  assert.equal(Object.keys(secondOffErrors).length, 0);
});

test('validateTaskInput rejects overlapping task hours on the same day while allowing back-to-back slots', () => {
  const dayTasks: PlannerTask[] = [
    {
      ...sampleTask,
      id: 't-morning',
      date: '2026-11-14',
      title: 'Dạy Bé Bông',
      startTime: '08:00',
      endTime: '09:30',
      color: PASTEL_60_COLORS[0].hex,
    },
  ];

  // Overlapping candidate: 09:00-10:00 overlaps 08:00-09:30
  const overlaps = getOverlappingTasksForCandidate(dayTasks, {
    date: '2026-11-14',
    startTime: '09:00',
    endTime: '10:00',
  });
  assert.equal(overlaps.length, 1);

  const overlapErr = validateTaskInput(
    {
      date: '2026-11-14',
      title: 'Dạy Minh Anh',
      startTime: '09:00',
      endTime: '10:00',
      income: 200000,
      status: 'pending',
      color: PASTEL_60_COLORS[2].hex,
      notes: '',
      link: '',
    },
    dayTasks,
  );
  assert.ok(overlapErr.endTime);

  // Back-to-back touching slot 09:30-10:30 is allowed
  const adjacentOk = validateTaskInput(
    {
      date: '2026-11-14',
      title: 'Dạy Minh Anh',
      startTime: '09:30',
      endTime: '10:30',
      income: 200000,
      status: 'pending',
      color: PASTEL_60_COLORS[2].hex,
      notes: '',
      link: '',
    },
    dayTasks,
  );
  assert.equal(adjacentOk.endTime, undefined);

  // Editing the task itself does not trigger self-overlap
  const selfEditOk = validateTaskInput(
    {
      date: '2026-11-14',
      title: 'Dạy Bé Bông',
      startTime: '08:00',
      endTime: '09:45',
      income: 200000,
      status: 'completed',
      color: PASTEL_60_COLORS[0].hex,
      notes: '',
      link: '',
    },
    dayTasks,
    't-morning',
  );
  assert.equal(selfEditOk.endTime, undefined);
});

test('getAvailableTimeRanges calculates remaining unscheduled gaps accurately', () => {
  assert.deepEqual(
    getAvailableTimeRanges([], '2026-11-14').map((r) => `${r.startTime}-${r.endTime}`),
    ['06:00-24:00'],
  );

  const dayTasks: PlannerTask[] = [
    {
      ...sampleTask,
      id: 'a1',
      date: '2026-11-14',
      startTime: '08:00',
      endTime: '09:30',
    },
    {
      ...sampleTask,
      id: 'a2',
      date: '2026-11-14',
      startTime: '14:00',
      endTime: '16:15',
    },
  ];
  const ranges = getAvailableTimeRanges(dayTasks, '2026-11-14');
  assert.deepEqual(
    ranges.map((r) => `${r.startLabel}-${r.endLabel}`),
    ['6h-8h', '9h30-14h', '16h15-24h'],
  );
  assert.equal(ranges[0].durationLabel, '2 giờ');
  assert.equal(ranges[1].durationLabel, '4 giờ 30 phút');

  // All-day Off leaves no available time ranges
  const fullOff = getAvailableTimeRanges(
    [
      {
        ...sampleTask,
        id: 'off-all',
        date: '2026-11-14',
        isOff: true,
        isAllDay: true,
        startTime: '06:00',
        endTime: '24:00',
      },
    ],
    '2026-11-14',
  );
  assert.equal(fullOff.length, 0);
});

test('convertSolarToLunar accurately computes Vietnamese lunar dates', () => {
  // Tết Nguyên Đán 2025: 29/01/2025 -> 1/1/2025 ÂL
  const tet2025 = convertSolarToLunar(29, 1, 2025);
  assert.equal(tet2025.day, 1);
  assert.equal(tet2025.month, 1);
  assert.equal(tet2025.year, 2025);

  // Tết Nguyên Đán 2026: 17/02/2026 -> 1/1/2026 ÂL
  const tet2026 = convertSolarToLunar(17, 2, 2026);
  assert.equal(tet2026.day, 1);
  assert.equal(tet2026.month, 1);
  assert.equal(tet2026.year, 2026);

  // Trung Thu 2025: 06/10/2025 -> 15/8/2025 ÂL
  const midAutumn2025 = getLunarFromDateKey('2025-10-06');
  assert.equal(formatLunarShort(midAutumn2025), '15/8');

  // Trung Thu 2026: 25/09/2026 -> 15/8/2026 ÂL
  const midAutumn2026 = getLunarFromDateKey('2026-09-25');
  assert.equal(formatLunarShort(midAutumn2026), '15/8');
  assert.equal(formatLunarDdMm(midAutumn2026), '15/08');
  assert.equal(formatLunarDdMm(tet2026), '01/01');
});

test('getUpcomingDayTasks drops expired tasks and promotes the next task to first position', () => {
  const dayTasks: PlannerTask[] = [
    {
      ...sampleTask,
      id: 't-early',
      date: '2026-11-14',
      title: 'Ca sáng sớm',
      startTime: '07:00',
      endTime: '08:30',
      status: 'pending',
    },
    {
      ...sampleTask,
      id: 't-current',
      date: '2026-11-14',
      title: 'Ca hiện tại',
      startTime: '09:00',
      endTime: '10:30',
      status: 'in_progress',
    },
    {
      ...sampleTask,
      id: 't-next',
      date: '2026-11-14',
      title: 'Ca tiếp theo',
      startTime: '14:00',
      endTime: '15:30',
      status: 'pending',
    },
  ];

  // At 09:30 on 2026-11-14 -> Ca sáng sớm expired, Ca hiện tại is active and first
  const morningRes = getUpcomingDayTasks(dayTasks, '2026-11-14', new Date(2026, 10, 14, 9, 30));
  assert.deepEqual(
    morningRes.visibleTasks.map((t) => t.id),
    ['t-current', 't-next'],
  );
  assert.equal(morningRes.expiredCount, 1);
  assert.equal(morningRes.activeTaskId, 't-current');

  // At 10:30 -> Ca hiện tại ends, Ca tiếp theo moves to #1
  const midRes = getUpcomingDayTasks(dayTasks, '2026-11-14', new Date(2026, 10, 14, 10, 30));
  assert.deepEqual(
    midRes.visibleTasks.map((t) => t.id),
    ['t-next'],
  );
  assert.equal(midRes.expiredCount, 2);
  assert.equal(midRes.activeTaskId, null);

  // Future date keeps all tasks in chronological order
  const futureRes = getUpcomingDayTasks(dayTasks, '2026-11-14', new Date(2026, 10, 13, 18, 0));
  assert.equal(futureRes.visibleTasks.length, 3);
  assert.equal(futureRes.expiredCount, 0);

  // Completed task moves to the very bottom even if its slot is earlier
  const withCompleted: PlannerTask[] = [
    { ...dayTasks[0], status: 'completed' },
    dayTasks[1],
    dayTasks[2],
  ];
  const sortedRes = getUpcomingDayTasks(withCompleted, '2026-11-14', new Date(2026, 10, 14, 7, 30));
  assert.deepEqual(
    sortedRes.visibleTasks.map((t) => t.id),
    ['t-current', 't-next', 't-early'],
  );
});

test('validateTaskInput and pickAvailablePastelColor forbid selecting task color matching background color', () => {
  const bgHex = PASTEL_60_COLORS[0].hex;
  const err = validateTaskInput(
    {
      date: '2026-11-14',
      title: 'Dạy kèm',
      startTime: '08:00',
      endTime: '09:00',
      income: 200000,
      status: 'pending',
      color: bgHex,
      notes: '',
      link: '',
    },
    [],
    undefined,
    bgHex,
  );
  assert.ok(err.color);

  const picked = pickAvailablePastelColor(
    [],
    { date: '2026-11-14', startTime: '08:00', endTime: '09:00' },
    undefined,
    0,
    bgHex,
  );
  assert.notEqual(picked, bgHex);
});

test('calculateIncomeTargetProgress automatically subtracts achieved income from target', () => {
  const step1 = calculateIncomeTargetProgress(10000000, 2500000);
  assert.equal(step1.target, 10000000);
  assert.equal(step1.achieved, 2500000);
  assert.equal(step1.remaining, 7500000);
  assert.equal(step1.exceeded, 0);
  assert.equal(step1.percent, 25);

  const step2 = calculateIncomeTargetProgress(10000000, 12000000);
  assert.equal(step2.remaining, 0);
  assert.equal(step2.exceeded, 2000000);
  assert.equal(step2.percent, 100);
});



