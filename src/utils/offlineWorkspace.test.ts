import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyOfflineNoteCreate,
  applyOfflineTaskSave,
  applyOfflineTodoCreate,
  clearMonthDataFromSnapshot,
  formatMonthKeyLabel,
  mergePendingSyncState,
  EMPTY_PENDING_SYNC_STATE,
} from './offlineWorkspace.ts';
import { summarizeMonthlyIncome } from './schedule.ts';
import type { WorkspaceSnapshot } from '../types/planner.ts';

function buildSampleSnapshot(): WorkspaceSnapshot {
  return {
    workspaceId: 'ws-test',
    revision: 3,
    lastSavedAt: '2026-11-16T08:00:00.000Z',
    lastEditedBy: 'Lan',
    tasks: [
      {
        id: 't-nov-1',
        date: '2026-11-16',
        title: 'Bé Bi',
        lessonName: 'Toán lớp 4',
        startTime: '08:00',
        endTime: '09:00',
        income: 200000,
        status: 'completed',
        notes: '',
        link: '',
        createdBy: 'Lan',
        createdAt: '2026-11-16T00:00:00.000Z',
        updatedAt: '2026-11-16T00:00:00.000Z',
      },
      {
        id: 't-dec-1',
        date: '2026-12-02',
        title: 'Bé Na',
        startTime: '10:00',
        endTime: '11:00',
        income: 250000,
        status: 'pending',
        notes: '',
        link: '',
        createdBy: 'Lan',
        createdAt: '2026-11-16T00:00:00.000Z',
        updatedAt: '2026-11-16T00:00:00.000Z',
      },
    ],
    incomes: [
      {
        id: 'inc-nov',
        month: '2026-11',
        sourceName: 'Lớp ngoài',
        amount: 500000,
        receivedStatus: 'received',
        createdBy: 'Lan',
        createdAt: '2026-11-16T00:00:00.000Z',
        updatedAt: '2026-11-16T00:00:00.000Z',
      },
      {
        id: 'inc-dec',
        month: '2026-12',
        sourceName: 'Thưởng tháng 12',
        amount: 300000,
        receivedStatus: 'unreceived',
        createdBy: 'Lan',
        createdAt: '2026-11-16T00:00:00.000Z',
        updatedAt: '2026-11-16T00:00:00.000Z',
      },
    ],
    students: [
      {
        id: 'stu-nov-only',
        studentName: 'Bé Bi',
        studySchedule: 'Thứ 2',
        feePerSession: 200000,
        month: 11,
        themeColor: '#E11D64',
        sessions: [
          {
            id: 'ses-1',
            date: '2026-11-16',
            content: 'Toán lớp 4',
            status: 'completed',
            sourceTaskId: 't-nov-1',
            createdAt: '2026-11-16T00:00:00.000Z',
            updatedAt: '2026-11-16T00:00:00.000Z',
          },
        ],
        createdBy: 'Lan',
        createdAt: '2026-11-16T00:00:00.000Z',
        updatedAt: '2026-11-16T00:00:00.000Z',
      },
      {
        id: 'stu-dec',
        studentName: 'Bé Na',
        studySchedule: 'Thứ 4',
        feePerSession: 250000,
        month: 12,
        themeColor: '#0D9488',
        sessions: [
          {
            id: 'ses-2',
            date: '2026-12-02',
            content: 'Tiếng Anh',
            status: 'completed',
            createdAt: '2026-11-16T00:00:00.000Z',
            updatedAt: '2026-11-16T00:00:00.000Z',
          },
        ],
        createdBy: 'Lan',
        createdAt: '2026-11-16T00:00:00.000Z',
        updatedAt: '2026-11-16T00:00:00.000Z',
      },
    ],
    todos: [
      {
        id: 'todo-nov',
        originId: 'todo-nov',
        date: '2026-11-16',
        title: 'Soạn đề tháng 11',
        status: 'pending',
        priority: 'priority',
        createdBy: 'Lan',
        createdAt: '2026-11-16T00:00:00.000Z',
        updatedAt: '2026-11-16T00:00:00.000Z',
      },
      {
        id: 'todo-dec',
        originId: 'todo-dec',
        date: '2026-12-01',
        title: 'Lịch tháng 12',
        status: 'pending',
        priority: 'default',
        createdBy: 'Lan',
        createdAt: '2026-11-16T00:00:00.000Z',
        updatedAt: '2026-11-16T00:00:00.000Z',
      },
    ],
    dailyNotes: [
      {
        id: 'note-nov',
        date: '2026-11-16',
        kind: 'checklist',
        content: 'Nhắn phụ huynh Bi',
        checked: false,
        createdBy: 'Lan',
        createdAt: '2026-11-16T00:00:00.000Z',
        updatedAt: '2026-11-16T00:00:00.000Z',
      },
      {
        id: 'note-dec',
        date: '2026-12-01',
        kind: 'text',
        content: 'Ghi chú tháng 12',
        createdBy: 'Lan',
        createdAt: '2026-11-16T00:00:00.000Z',
        updatedAt: '2026-11-16T00:00:00.000Z',
      },
    ],
    dailyGoals: {
      '2026-11-16': 'Hoàn thành giáo án',
      '2026-12-01': 'Mục tiêu tháng 12',
    },
    completedTodoCountsByDate: {
      '2026-11-16': 4,
      '2026-12-01': 1,
    },
    monthlyIncomeTargets: {
      '2026-11': 10000000,
      '2026-12': 12000000,
    },
    dailyIncomeTargets: {
      '2026-11-16': 500000,
      '2026-12-01': 600000,
    },
    appearance: { themeMode: 'light', backgroundColor: '#FFE3EE' },
    avatarDataUrl: 'data:image/png;base64,AAA',
  };
}

test('clearMonthDataFromSnapshot erases ONLY target month data while preserving other months and settings', () => {
  const initial = buildSampleSnapshot();
  const cleared = clearMonthDataFromSnapshot(initial, '2026-11', 'Lan', '2026-11-16T12:00:00.000Z');

  assert.equal(formatMonthKeyLabel('2026-11'), 'Tháng 11/2026');
  assert.deepEqual(
    cleared.tasks.map((t) => t.id),
    ['t-dec-1'],
  );
  assert.deepEqual(
    cleared.incomes.map((i) => i.id),
    ['inc-dec'],
  );
  assert.deepEqual(
    cleared.students?.map((s) => s.id),
    ['stu-dec'],
  );
  assert.deepEqual(
    cleared.todos?.map((t) => t.id),
    ['todo-dec'],
  );
  assert.deepEqual(
    cleared.dailyNotes?.map((n) => n.id),
    ['note-dec'],
  );
  assert.deepEqual(cleared.dailyGoals, { '2026-12-01': 'Mục tiêu tháng 12' });
  assert.deepEqual(cleared.completedTodoCountsByDate, { '2026-12-01': 1 });
  assert.deepEqual(cleared.monthlyIncomeTargets, { '2026-12': 12000000 });
  assert.deepEqual(cleared.dailyIncomeTargets, { '2026-12-01': 600000 });
  assert.deepEqual(cleared.appearance, initial.appearance);
  assert.equal(cleared.avatarDataUrl, initial.avatarDataUrl);
  assert.equal(cleared.revision, 4);
});

test('Offline task, todo, and note mutations update snapshot locally with valid revision and synced incomes', () => {
  let snap = clearMonthDataFromSnapshot(buildSampleSnapshot(), '2026-11', 'Lan');

  snap = applyOfflineTaskSave(
    snap,
    {
      date: '2026-11-18',
      title: 'Dạy offline',
      lessonName: 'Bài 1',
      startTime: '09:00',
      endTime: '10:00',
      income: 350000,
      status: 'completed',
      notes: '',
      link: '',
    },
    undefined,
    'Lan',
    '2026-11-18T09:00:00.000Z',
  );

  assert.equal(snap.tasks.filter((t) => t.date === '2026-11-18').length, 1);
  assert.equal(
    summarizeMonthlyIncome(snap.tasks, snap.incomes, '2026-11-18').monthTotal,
    350000,
  );

  snap = applyOfflineTodoCreate(
    snap,
    {
      date: '2026-11-18',
      title: 'Việc làm offline',
      notes: 'Ghi chú việc',
      status: 'pending',
      priority: 'priority',
    },
    'Lan',
  );
  assert.equal(snap.todos?.some((t) => t.title === 'Việc làm offline'), true);

  snap = applyOfflineNoteCreate(
    snap,
    {
      date: '2026-11-18',
      kind: 'checklist',
      content: 'Tick offline',
      checked: false,
    },
    'Lan',
  );
  assert.equal(snap.dailyNotes?.some((n) => n.content === 'Tick offline'), true);
});

test('mergePendingSyncState queues deleted months and clears resolved items cleanly', () => {
  let pending = mergePendingSyncState(EMPTY_PENDING_SYNC_STATE, {
    pendingServerSync: true,
    pendingDriveSync: true,
    addDeleteMonth: '2026-11',
  });
  assert.equal(pending.pendingServerSync, true);
  assert.equal(pending.pendingDriveSync, true);
  assert.deepEqual(pending.pendingDeleteMonths, ['2026-11']);

  pending = mergePendingSyncState(pending, {
    pendingServerSync: false,
    pendingDriveSync: false,
    clearDeleteMonths: ['2026-11'],
  });
  assert.equal(pending.pendingServerSync, false);
  assert.equal(pending.pendingDriveSync, false);
  assert.deepEqual(pending.pendingDeleteMonths, []);
});
