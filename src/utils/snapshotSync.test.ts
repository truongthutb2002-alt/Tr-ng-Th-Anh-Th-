import test from 'node:test';
import assert from 'node:assert/strict';
import type { WorkspaceSnapshot } from '../types/planner';
import {
  buildDriveBackupEnvelope,
  hasWorkspaceUserData,
  parseDriveBackupPayload,
  reconcileSnapshots,
  resolveGoogleWorkspaceId,
  summarizeSnapshotCounts,
  validateEmailInput,
} from './snapshotSync';

function makeSnapshot(overrides: Partial<WorkspaceSnapshot> = {}): WorkspaceSnapshot {
  return {
    workspaceId: 'acct-test',
    revision: 1,
    lastSavedAt: '2026-11-16T08:00:00.000Z',
    lastEditedBy: 'Tester',
    tasks: [],
    incomes: [],
    students: [],
    todos: [],
    dailyGoals: {},
    dismissedTodoCarryovers: {},
    completedTodoCountsByDate: {},
    appearance: { themeMode: 'light', backgroundColor: '#FFF4F8' },
    avatarDataUrl: '',
    monthlyIncomeTargets: {},
    dailyIncomeTargets: {},
    chatHistory: [],
    ...overrides,
  };
}

test('validateEmailInput validates optional vs required emails cleanly', () => {
  assert.equal(validateEmailInput(''), null);
  assert.ok(validateEmailInput('', { required: true }));
  assert.ok(validateEmailInput('invalid-email'));
  assert.ok(validateEmailInput('user@domain'));
  assert.equal(validateEmailInput('truongthutb2002@gmail.com'), null);
  assert.equal(resolveGoogleWorkspaceId('TruongThu@Gmail.com'), 'gdrive-truongthu@gmail.com');
});

test('reconcileSnapshots preserves local data when server DB was reset/empty', () => {
  const local = makeSnapshot({
    revision: 4,
    lastSavedAt: '2026-11-16T07:00:00.000Z',
    tasks: [
      {
        id: 't-1',
        date: '2026-11-16',
        title: 'Dạy Toán',
        startTime: '08:00',
        endTime: '09:30',
        income: 300000,
        status: 'completed',
        notes: '',
        link: '',
        createdBy: 'Minh Anh',
        createdAt: '2026-11-16T07:00:00.000Z',
        updatedAt: '2026-11-16T07:00:00.000Z',
      },
    ],
  });
  const emptyServer = makeSnapshot({
    revision: 1,
    lastSavedAt: '2026-11-16T09:00:00.000Z', // newer timestamp on fresh empty server!
  });

  const result = reconcileSnapshots(local, emptyServer);
  assert.equal(result.source, 'local');
  assert.equal(result.needsServerRestore, true);
  assert.equal(result.snapshot.tasks.length, 1);
  assert.equal(result.snapshot.tasks[0].title, 'Dạy Toán');
});

test('reconcileSnapshots picks remote when local is empty and remote has data', () => {
  const emptyLocal = makeSnapshot({ revision: 1 });
  const remote = makeSnapshot({
    revision: 5,
    todos: [
      {
        id: 'todo-1',
        date: '2026-11-16',
        title: 'Soạn giáo án',
        status: 'pending',
        priority: 'priority',
        createdBy: 'Minh Anh',
        createdAt: '2026-11-16T06:00:00.000Z',
        updatedAt: '2026-11-16T06:00:00.000Z',
      },
    ],
  });

  const result = reconcileSnapshots(emptyLocal, remote);
  assert.equal(result.source, 'remote');
  assert.equal(result.needsServerRestore, false);
  assert.equal(result.snapshot.todos?.length, 1);
});

test('hasWorkspaceUserData detects custom avatar, appearance, goals, and items', () => {
  assert.equal(hasWorkspaceUserData(makeSnapshot()), false);
  assert.equal(hasWorkspaceUserData(makeSnapshot({ avatarDataUrl: 'data:image/png;base64,AAA' })), true);
  assert.equal(hasWorkspaceUserData(makeSnapshot({ dailyGoals: { '2026-11-16': 'Hoàn thành bài' } })), true);
  assert.equal(
    hasWorkspaceUserData(makeSnapshot({ appearance: { themeMode: 'dark', backgroundColor: '#FFF4F8' } })),
    true,
  );
  assert.deepEqual(summarizeSnapshotCounts(makeSnapshot()), {
    tasks: 0,
    incomes: 0,
    students: 0,
    todos: 0,
    totalItems: 0,
  });
});

test('buildDriveBackupEnvelope and parseDriveBackupPayload round-trip snapshots cleanly', () => {
  const snap = makeSnapshot({
    workspaceId: 'acct-old',
    revision: 7,
    avatarDataUrl: 'data:image/png;base64,AAAA',
    dailyGoals: { '2026-11-16': 'Mục tiêu' },
  });
  const envelope = buildDriveBackupEnvelope(snap, '2026-11-16T10:00:00.000Z');
  assert.equal(envelope.app, 'Plantea');
  assert.equal(envelope.schemaVersion, 1);

  const parsed = parseDriveBackupPayload(envelope, 'gdrive-user@gmail.com');
  assert.ok(parsed);
  assert.equal(parsed?.workspaceId, 'gdrive-user@gmail.com');
  assert.equal(parsed?.revision, 7);
  assert.equal(parsed?.avatarDataUrl, 'data:image/png;base64,AAAA');
  assert.equal(parsed?.dailyGoals?.['2026-11-16'], 'Mục tiêu');
});
