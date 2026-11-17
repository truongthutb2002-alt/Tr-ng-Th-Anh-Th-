import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TUITION_COLOR,
  TUITION_COLOR_PALETTE,
  TUITION_MONTH_OPTIONS,
  buildTuitionSlipData,
  formatMonthDisplay,
  formatVietnameseWeekdayDate,
  getDaysInMonthOptions,
  getSessionsForMonth,
  getTuitionColorTheme,
  summarizeStudentTuition,
  syncWorkspaceStudentsWithTasks,
  tuitionSheetToCsv,
  validateStudentTuitionInput,
  validateTuitionSessionInput,
} from './tuition';
import type { PlannerTask, StudentTuition, TuitionSession } from '../types/planner';

const sampleSessions: TuitionSession[] = [
  {
    id: 's2',
    date: '2026-11-12',
    content: 'Luyện đọc hiểu Unit 2',
    status: 'absent',
    createdAt: '2026-11-12T08:00:00.000Z',
    updatedAt: '2026-11-12T08:00:00.000Z',
  },
  {
    id: 's1',
    date: '2026-11-10',
    content: 'Ngữ pháp thì hiện tại đơn',
    status: 'completed',
    createdAt: '2026-11-10T08:00:00.000Z',
    updatedAt: '2026-11-10T08:00:00.000Z',
  },
  {
    id: 's3',
    date: '2026-11-17',
    content: 'Thực hành giao tiếp',
    status: 'completed',
    createdAt: '2026-11-17T08:00:00.000Z',
    updatedAt: '2026-11-17T08:00:00.000Z',
  },
  {
    id: 's-other-month',
    date: '2026-10-29',
    content: 'Kiểm tra đầu vào',
    status: 'completed',
    createdAt: '2026-10-29T08:00:00.000Z',
    updatedAt: '2026-10-29T08:00:00.000Z',
  },
];

test('formatVietnameseWeekdayDate formats weekday and DD/MM without year', () => {
  assert.equal(formatVietnameseWeekdayDate('2026-11-14'), 'Thứ 7, 14/11');
  assert.equal(formatVietnameseWeekdayDate('2026-11-15'), 'Chủ nhật, 15/11');
  assert.equal(formatMonthDisplay(11), 'Tháng 11');
  assert.equal(formatMonthDisplay('2026-11'), 'Tháng 11');
});

test('TUITION_MONTH_OPTIONS covers Tháng 1 through Tháng 12 and getDaysInMonthOptions omits year', () => {
  assert.equal(TUITION_MONTH_OPTIONS.length, 12);
  assert.equal(TUITION_MONTH_OPTIONS[0].label, 'Tháng 1');
  assert.equal(TUITION_MONTH_OPTIONS[11].label, 'Tháng 12');

  const novDays = getDaysInMonthOptions(2026, 11);
  assert.equal(novDays.length, 30);
  assert.equal(novDays[9].label, '10/11 (Thứ 3)');
  assert.ok(!novDays[9].label.includes('2026'));
});

test('getSessionsForMonth filters by month number and sorts chronologically', () => {
  const nov = getSessionsForMonth(sampleSessions, 11);
  assert.deepEqual(
    nov.map((s) => s.id),
    ['s1', 's2', 's3'],
  );
});

test('summarizeStudentTuition counts completed and absent separately without combined totalSessions', () => {
  const summary = summarizeStudentTuition(sampleSessions, 200000, 11);
  assert.equal(summary.completedCount, 2);
  assert.equal(summary.absentCount, 1);
  assert.equal(summary.totalTuition, 400000);
  assert.equal('totalSessions' in summary, false);
});

test('getTuitionColorTheme resolves presets and custom hex colors', () => {
  assert.ok(TUITION_COLOR_PALETTE.length >= 10);
  const teal = getTuitionColorTheme('#0D9488');
  assert.equal(teal.name, 'Xanh ngọc');
  const custom = getTuitionColorTheme('#123456');
  assert.equal(custom.id, 'custom');
  assert.equal(custom.hex, '#123456');
});

test('validateStudentTuitionInput and validateTuitionSessionInput reject invalid inputs', () => {
  const badStudent = validateStudentTuitionInput({
    studentName: '  ',
    studySchedule: '',
    feePerSession: -100,
    month: 13,
  });
  assert.ok(badStudent.studentName);
  assert.ok(badStudent.feePerSession);
  assert.ok(badStudent.month);

  const badSession = validateTuitionSessionInput({
    date: 'invalid',
    content: '',
    status: 'completed',
  });
  assert.ok(badSession.date);
  assert.ok(badSession.content);
});

test('tuitionSheetToCsv omits year and combined session count', () => {
  const student: StudentTuition = {
    id: 'st-1',
    studentName: 'Bé Bông',
    studySchedule: 'Thứ 3 & Thứ 5 (18:00 - 19:30)',
    feePerSession: 200000,
    month: 11,
    themeColor: DEFAULT_TUITION_COLOR,
    sessions: sampleSessions,
    createdBy: 'Thư',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  };
  const csv = tuitionSheetToCsv(student, 11);
  assert.equal(csv.startsWith('\uFEFF'), true);
  assert.ok(csv.includes('Bé Bông'));
  assert.ok(csv.includes('Thứ 3, 10/11'));
  assert.ok(!csv.includes('10/11/2026'));
  assert.ok(!csv.includes('Tổng 3 buổi'));
  assert.ok(csv.includes('400.000'));
});

test('buildTuitionSlipData formats detailed spreadsheet receipt rows and totals', () => {
  const student: StudentTuition = {
    id: 'st-2',
    studentName: 'Nguyễn Vũ Khánh Duyên',
    studySchedule: '18h Thứ 3-5 / 17h -CN',
    feePerSession: 110000,
    month: 11,
    themeColor: '#EA580C',
    sessions: sampleSessions,
    createdBy: 'Thư',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  };

  const slip = buildTuitionSlipData(student, 11, -10000);
  assert.equal(slip.headerTitle, 'NGUYỄN VŨ KHÁNH DUYÊN (THÁNG 11 - 110.000)');
  assert.equal(slip.rows.length, 3);
  // 1st session (10/11 completed) -> sessionNumber = 1
  assert.equal(slip.rows[0].sessionNumber, 1);
  assert.equal(slip.rows[0].dateLabel, 'Thứ Ba, 10/11');
  // 2nd session (12/11 absent) -> sessionNumber = null
  assert.equal(slip.rows[1].sessionNumber, null);
  assert.equal(slip.rows[1].dateLabel, 'Thứ Năm, 12/11');
  assert.equal(slip.rows[1].statusLabel, 'Nghỉ');
  // 3rd session (17/11 completed) -> sessionNumber = 2
  assert.equal(slip.rows[2].sessionNumber, 2);
  assert.equal(slip.rows[2].dateLabel, 'Thứ Ba, 17/11');

  assert.equal(slip.totalSessions, 2);
  assert.equal(slip.subtotalTuition, 220000);
  assert.equal(slip.totalTuition, 210000);
  assert.equal(slip.formulaText, 'Tổng cộng: 2b x 110.000 = 220.000 (-10.000) = 210.000');

  const noAdj = buildTuitionSlipData(student, 11);
  assert.equal(noAdj.formulaText, 'Tổng cộng: 2b x 110.000 = 220.000');
});

test('syncWorkspaceStudentsWithTasks syncs matching completed tasks into tuition sessions and preserves manual sessions', () => {
  const manualSession: TuitionSession = {
    id: 'ses-manual-1',
    date: '2026-11-05',
    content: 'Unit 1: Chào hỏi',
    status: 'completed',
    createdAt: '2026-11-05T10:00:00.000Z',
    updatedAt: '2026-11-05T10:00:00.000Z',
  };

  const student: StudentTuition = {
    id: 'st-bong',
    studentName: 'Bé Bông',
    studySchedule: '18h Thứ 3 & Thứ 5',
    feePerSession: 200000,
    month: 11,
    themeColor: DEFAULT_TUITION_COLOR,
    sessions: [manualSession],
    createdBy: 'Thư',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  };

  const tasks: PlannerTask[] = [
    {
      id: 'task-bong-1',
      date: '2026-11-12',
      title: '  bé bông ',
      lessonName: 'Unit 2: Ngữ pháp hiện tại đơn',
      startTime: '18:00',
      endTime: '19:30',
      income: 200000,
      status: 'completed',
      notes: 'Ghi chú phụ',
      link: '',
      createdBy: 'Thư',
      createdAt: '2026-11-12T10:00:00.000Z',
      updatedAt: '2026-11-12T10:00:00.000Z',
    },
    {
      id: 'task-bong-absent',
      date: '2026-11-15',
      title: 'Bé Bông',
      lessonName: 'Unit 3',
      startTime: '18:00',
      endTime: '19:30',
      income: 200000,
      status: 'absent',
      notes: 'Xin nghỉ phép',
      link: '',
      createdBy: 'Thư',
      createdAt: '2026-11-13T10:00:00.000Z',
      updatedAt: '2026-11-13T10:00:00.000Z',
    },
    {
      id: 'task-bong-pending',
      date: '2026-11-19',
      title: 'Bé Bông',
      lessonName: '',
      startTime: '18:00',
      endTime: '19:30',
      income: 200000,
      status: 'pending',
      notes: '',
      link: '',
      createdBy: 'Thư',
      createdAt: '2026-11-14T10:00:00.000Z',
      updatedAt: '2026-11-14T10:00:00.000Z',
    },
  ];

  // 1. Completed and absent tasks sync; pending is ignored; lessonName takes priority over notes
  const synced1 = syncWorkspaceStudentsWithTasks(tasks, [student], '2026-11-12T19:30:00.000Z');
  assert.equal(synced1[0].sessions.length, 3);
  assert.equal(synced1[0].sessions[0].id, 'ses-manual-1');
  assert.equal(synced1[0].sessions[1].sourceTaskId, 'task-bong-1');
  assert.equal(synced1[0].sessions[1].content, 'Unit 2: Ngữ pháp hiện tại đơn');
  assert.equal(synced1[0].sessions[1].status, 'completed');
  assert.equal(synced1[0].sessions[2].sourceTaskId, 'task-bong-absent');
  assert.equal(synced1[0].sessions[2].status, 'absent');

  const slip1 = buildTuitionSlipData(synced1[0], 11);
  assert.equal(slip1.totalSessions, 2);
  assert.equal(slip1.absentCount, 1);
  assert.equal(slip1.totalTuition, 400000);
  assert.equal(slip1.rows[0].date, '2026-11-05');
  assert.equal(slip1.rows[0].sourceTaskId, undefined);
  assert.equal(slip1.rows[1].date, '2026-11-12');
  assert.equal(slip1.rows[1].sourceTaskId, 'task-bong-1');

  // 2. Completing third task (with empty lessonName/notes) adds session; changing absent -> completed updates status
  const tasks2: PlannerTask[] = [
    { ...tasks[0], lessonName: 'Unit 2: Đã sửa bài' },
    { ...tasks[1], status: 'completed' },
    { ...tasks[2], status: 'completed', notes: '' },
  ];
  const synced2 = syncWorkspaceStudentsWithTasks(tasks2, synced1, '2026-11-19T19:30:00.000Z');
  assert.equal(synced2[0].sessions.length, 4);
  assert.equal(synced2[0].sessions[1].content, 'Unit 2: Đã sửa bài');
  assert.equal(synced2[0].sessions[2].status, 'completed');
  assert.equal(synced2[0].sessions[3].content, 'Buổi học (18h–19h30)');

  // 3. Removing tasks removes only their synced sessions and keeps manual session
  const synced3 = syncWorkspaceStudentsWithTasks([tasks2[0]], synced2, '2026-11-20T10:00:00.000Z');
  assert.equal(synced3[0].sessions.length, 2);
  assert.equal(synced3[0].sessions[0].id, 'ses-manual-1');
});
