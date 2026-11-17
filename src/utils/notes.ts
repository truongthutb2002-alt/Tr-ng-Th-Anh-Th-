import type { DailyNoteInput, DailyNoteItem, DailyNoteKind } from '../types/planner.ts';

export function normalizeDailyNoteKind(kind: unknown): DailyNoteKind {
  return kind === 'checklist' ? 'checklist' : 'text';
}

export function validateDailyNoteInput(input: DailyNoteInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    errors.date = 'Ngày ghi chú không hợp lệ.';
  }
  const content = (input.content || '').trim();
  if (!content) {
    errors.content = 'Vui lòng nhập nội dung ghi chú.';
  } else if (content.length > 2000) {
    errors.content = 'Ghi chú tối đa 2000 ký tự.';
  }
  return errors;
}

export function getNotesForDate(notes: DailyNoteItem[] | undefined, dateKey: string): DailyNoteItem[] {
  if (!Array.isArray(notes) || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return [];
  }
  return notes
    .filter((item) => item && item.date === dateKey)
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}

export function sanitizeDailyNoteFields(body: Record<string, unknown>, fallbackDate: string): DailyNoteInput {
  const date =
    typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date.trim())
      ? body.date.trim()
      : fallbackDate;
  const kind = normalizeDailyNoteKind(body.kind);
  const content = typeof body.content === 'string' ? body.content.trim().slice(0, 2000) : '';
  const checked = kind === 'checklist' ? Boolean(body.checked) : false;
  return {
    date,
    kind,
    content,
    checked,
  };
}
