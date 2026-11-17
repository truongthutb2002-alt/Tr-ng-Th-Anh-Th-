import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChildFolderListQuery,
  buildDriveMultipartRequest,
  buildFileSearchQuery,
  buildFolderSearchQuery,
  collectActiveDataMonthKeys,
  collectWorkspaceMonthKeys,
  deletePlanteaMonthFromDrive,
  formatDriveMonthFileName,
  formatDriveMonthFolderName,
  PLANTEA_DRIVE_FILE_NAME,
  PLANTEA_DRIVE_FOLDER_NAME,
  sliceSnapshotForMonth,
} from './googleDrive.ts';
import type { WorkspaceSnapshot } from '../types/planner.ts';

test('Drive search query builders target Plantea folder, monthly subfolders, and files safely', () => {
  const folderQuery = buildFolderSearchQuery(PLANTEA_DRIVE_FOLDER_NAME);
  assert.equal(
    folderQuery,
    "name='Plantea' and mimeType='application/vnd.google-apps.folder' and trashed=false",
  );

  const childFolderQuery = buildChildFolderListQuery('folder-123');
  assert.equal(
    childFolderQuery,
    "'folder-123' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false",
  );

  const fileQuery = buildFileSearchQuery('folder-123', PLANTEA_DRIVE_FILE_NAME);
  assert.equal(
    fileQuery,
    "'folder-123' in parents and name='plantea-data.json' and trashed=false",
  );
});

test('Monthly Drive folder helpers generate all 12 months and slice data per month', () => {
  assert.equal(formatDriveMonthFolderName('2026-11'), 'Tháng 11 - 2026');
  assert.equal(formatDriveMonthFileName('2026-11'), 'plantea-2026-11.json');

  const snapshot: WorkspaceSnapshot = {
    workspaceId: 'ws-1',
    revision: 2,
    lastSavedAt: '2026-11-16T10:00:00.000Z',
    lastEditedBy: 'Lan',
    tasks: [
      {
        id: 't1',
        date: '2026-11-16',
        title: 'Task T11',
        startTime: '08:00',
        endTime: '09:00',
        income: 100000,
        status: 'completed',
        notes: '',
        link: '',
        createdBy: 'Lan',
        createdAt: '2026-11-16T00:00:00.000Z',
        updatedAt: '2026-11-16T00:00:00.000Z',
      },
      {
        id: 't2',
        date: '2025-12-05',
        title: 'Task T12 2025',
        startTime: '09:00',
        endTime: '10:00',
        income: 0,
        status: 'pending',
        notes: '',
        link: '',
        createdBy: 'Lan',
        createdAt: '2025-12-05T00:00:00.000Z',
        updatedAt: '2025-12-05T00:00:00.000Z',
      },
    ],
    incomes: [],
    todos: [],
    dailyNotes: [
      {
        id: 'n1',
        date: '2026-11-16',
        kind: 'checklist',
        content: 'Chuẩn bị bài',
        checked: false,
        createdBy: 'Lan',
        createdAt: '2026-11-16T07:00:00.000Z',
        updatedAt: '2026-11-16T07:00:00.000Z',
      },
    ],
  };

  const monthKeys = collectWorkspaceMonthKeys(snapshot, new Date('2026-11-16T00:00:00Z'));
  assert.ok(monthKeys.includes('2026-01'));
  assert.ok(monthKeys.includes('2026-12'));
  assert.ok(monthKeys.includes('2025-12'));
  assert.equal(monthKeys.length, 13);

  const activeKeys = collectActiveDataMonthKeys(snapshot, new Date('2026-11-16T00:00:00Z'));
  assert.deepEqual(activeKeys, ['2025-12', '2026-11']);

  const novSlice = sliceSnapshotForMonth(snapshot, '2026-11');
  assert.equal(novSlice.tasks.length, 1);
  assert.equal(novSlice.tasks[0].id, 't1');
  assert.equal(novSlice.dailyNotes?.length, 1);
});

test('buildDriveMultipartRequest formats valid multipart/related metadata + JSON body', () => {
  const req = buildDriveMultipartRequest({
    metadata: { name: 'plantea-data.json', parents: ['folder-123'] },
    contentJson: '{"ok":true}',
    boundary: 'test_boundary',
  });

  assert.equal(req.contentType, 'multipart/related; boundary=test_boundary');
  assert.ok(req.body.includes('--test_boundary\r\n'));
  assert.ok(req.body.includes('"parents":["folder-123"]'));
  assert.ok(req.body.includes('{"ok":true}'));
  assert.ok(req.body.endsWith('--test_boundary--'));
});

test('deletePlanteaMonthFromDrive deletes monthly subfolder, monthly json, and updates master snapshot', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method || 'GET';
    calls.push({ url, method });

    const decodedUrl = decodeURIComponent(url);
    if (method === 'GET' && decodedUrl.includes("mimeType='application/vnd.google-apps.folder'")) {
      return new Response(
        JSON.stringify({
          files: [
            { id: 'month-nov-folder', name: 'Tháng 11 - 2026' },
            { id: 'month-dec-folder', name: 'Tháng 12 - 2026' },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (method === 'GET' && url.includes('plantea-2026-11.json')) {
      return new Response(
        JSON.stringify({
          files: [{ id: 'month-nov-file', name: 'plantea-2026-11.json' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (method === 'DELETE') {
      return new Response(null, { status: 204 });
    }

    if (method === 'PATCH') {
      return new Response(
        JSON.stringify({ id: 'master-file-1', modifiedTime: '2026-11-16T12:00:00.000Z' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(JSON.stringify({ files: [] }), { status: 200 });
  }) as typeof fetch;

  try {
    const cleanedSnapshot: WorkspaceSnapshot = {
      workspaceId: 'ws-1',
      revision: 5,
      lastSavedAt: '2026-11-16T12:00:00.000Z',
      lastEditedBy: 'Lan',
      tasks: [],
      incomes: [],
    };
    const meta = await deletePlanteaMonthFromDrive({
      accessToken: 'fake-token',
      monthKey: '2026-11',
      updatedSnapshot: cleanedSnapshot,
      linkedEmail: 'lan@gmail.com',
      existingFolderId: 'root-folder',
      existingFileId: 'master-file-1',
    });

    assert.equal(meta.folderId, 'root-folder');
    assert.equal(meta.fileId, 'master-file-1');
    assert.equal(meta.monthFolderCount, 1);
    assert.ok(calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/month-nov-file')));
    assert.ok(calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/month-nov-folder')));
    assert.ok(calls.some((c) => c.method === 'PATCH' && c.url.includes('master-file-1')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
