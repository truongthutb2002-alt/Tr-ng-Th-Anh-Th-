import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getNotesForDate,
  normalizeDailyNoteKind,
  sanitizeDailyNoteFields,
  validateDailyNoteInput,
} from './notes.ts';
import type { DailyNoteItem } from '../types/planner.ts';

test('normalizeDailyNoteKind and sanitizeDailyNoteFields handle checklist and plain text notes', () => {
  assert.equal(normalizeDailyNoteKind('checklist'), 'checklist');
  assert.equal(normalizeDailyNoteKind('text'), 'text');
  assert.equal(normalizeDailyNoteKind('other'), 'text');

  const checklist = sanitizeDailyNoteFields(
    { date: '2026-11-16', kind: 'checklist', content: '  Mua bút dạ quang  ', checked: true },
    '2026-11-15',
  );
  assert.deepEqual(checklist, {
    date: '2026-11-16',
    kind: 'checklist',
    content: 'Mua bút dạ quang',
    checked: true,
  });

  const plain = sanitizeDailyNoteFields(
    { date: 'invalid', kind: 'text', content: 'Ghi chú chung', checked: true },
    '2026-11-16',
  );
  assert.deepEqual(plain, {
    date: '2026-11-16',
    kind: 'text',
    content: 'Ghi chú chung',
    checked: false,
  });
});

test('validateDailyNoteInput catches empty content and invalid dates', () => {
  const errEmpty = validateDailyNoteInput({ date: '2026-11-16', kind: 'text', content: '   ' });
  assert.ok(errEmpty.content);

  const errDate = validateDailyNoteInput({ date: '16-11-2026', kind: 'checklist', content: 'Test' });
  assert.ok(errDate.date);

  const ok = validateDailyNoteInput({ date: '2026-11-16', kind: 'checklist', content: 'Soạn giáo án' });
  assert.deepEqual(ok, {});
});

test('getNotesForDate filters strictly by dateKey and sorts chronologically', () => {
  const items: DailyNoteItem[] = [
    {
      id: 'n2',
      date: '2026-11-16',
      kind: 'text',
      content: 'Thứ hai',
      createdBy: 'A',
      createdAt: '2026-11-16T09:00:00.000Z',
      updatedAt: '2026-11-16T09:00:00.000Z',
    },
    {
      id: 'n1',
      date: '2026-11-16',
      kind: 'checklist',
      content: 'Đầu tiên',
      checked: false,
      createdBy: 'A',
      createdAt: '2026-11-16T08:00:00.000Z',
      updatedAt: '2026-11-16T08:00:00.000Z',
    },
    {
      id: 'n3',
      date: '2026-11-17',
      kind: 'text',
      content: 'Ngày mai',
      createdBy: 'A',
      createdAt: '2026-11-17T08:00:00.000Z',
      updatedAt: '2026-11-17T08:00:00.000Z',
    },
  ];

  const nov16 = getNotesForDate(items, '2026-11-16');
  assert.deepEqual(
    nov16.map((n) => n.id),
    ['n1', 'n2'],
  );
  assert.equal(getNotesForDate(items, '2026-11-18').length, 0);
});
