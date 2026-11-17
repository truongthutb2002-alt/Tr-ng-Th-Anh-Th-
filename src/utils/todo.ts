import type {
  TodoInput,
  TodoItem,
  TodoPriority,
  TodoStatus,
} from '../types/planner.ts';

export const TODO_STATUS_LABELS: Record<TodoStatus, string> = {
  pending: 'Chưa hoàn thành',
  in_progress: 'Đang làm',
  completed: 'Hoàn thành',
};

export const TODO_PRIORITY_LABELS: Record<TodoPriority, string> = {
  default: 'Mặc định',
  priority: 'Ưu tiên',
  later: 'Làm sau',
  yesterday: 'Hôm qua',
};

export const TODO_STATUS_OPTIONS: TodoStatus[] = ['pending', 'in_progress', 'completed'];
export const TODO_PRIORITY_OPTIONS: TodoPriority[] = ['default', 'priority', 'later', 'yesterday'];

export interface ResolvedTodoItem extends TodoItem {
  originId: string;
  isVirtualCarryover: boolean;
}

export function getTodoOriginId(item: Pick<TodoItem, 'id' | 'originId'>): string {
  return item.originId?.trim() || item.id;
}

export function normalizeTodoStatus(status: unknown): TodoStatus {
  if (status === 'completed' || status === 'in_progress' || status === 'pending') {
    return status;
  }
  return 'pending';
}

export function normalizeTodoPriority(priority: unknown): TodoPriority {
  if (
    priority === 'priority' ||
    priority === 'later' ||
    priority === 'yesterday' ||
    priority === 'default'
  ) {
    return priority;
  }
  return 'default';
}

export function validateTodoInput(input: TodoInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.title.trim()) {
    errors.title = 'Vui lòng nhập nội dung việc cần làm.';
  } else if (input.title.trim().length > 240) {
    errors.title = 'Nội dung việc cần làm tối đa 240 ký tự.';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    errors.date = 'Ngày không hợp lệ.';
  }
  if (typeof input.notes === 'string' && input.notes.trim().length > 1000) {
    errors.notes = 'Ghi chú tối đa 1000 ký tự.';
  }
  return errors;
}

const PRIORITY_SORT_WEIGHT: Record<TodoPriority, number> = {
  priority: 0,
  yesterday: 1,
  default: 2,
  later: 3,
};

const STATUS_SORT_WEIGHT: Record<TodoStatus, number> = {
  in_progress: 0,
  pending: 1,
  completed: 2,
};

export function sortResolvedTodos(items: ResolvedTodoItem[]): ResolvedTodoItem[] {
  return [...items].sort((a, b) => {
    const aDone = a.status === 'completed' ? 1 : 0;
    const bDone = b.status === 'completed' ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;

    const pDiff =
      (PRIORITY_SORT_WEIGHT[a.priority] ?? 2) - (PRIORITY_SORT_WEIGHT[b.priority] ?? 2);
    if (pDiff !== 0) return pDiff;

    const sDiff = (STATUS_SORT_WEIGHT[a.status] ?? 1) - (STATUS_SORT_WEIGHT[b.status] ?? 1);
    if (sDiff !== 0) return sDiff;

    return a.createdAt.localeCompare(b.createdAt);
  });
}

function groupLatestByOriginUpToDate(
  todos: TodoItem[],
  targetDate: string,
): Map<string, TodoItem> {
  const latestMap = new Map<string, TodoItem>();
  for (const item of todos) {
    if (!item || !/^\d{4}-\d{2}-\d{2}$/.test(item.date) || item.date > targetDate) {
      continue;
    }
    const originId = getTodoOriginId(item);
    const prev = latestMap.get(originId);
    if (
      !prev ||
      item.date > prev.date ||
      (item.date === prev.date && item.updatedAt > prev.updatedAt)
    ) {
      latestMap.set(originId, item);
    }
  }
  return latestMap;
}

function isOriginDismissedForTarget(
  originId: string,
  latestDate: string,
  targetDate: string,
  dismissedTodoCarryovers: Record<string, string>,
): boolean {
  const dismissedDate = dismissedTodoCarryovers[originId];
  if (!dismissedDate || !/^\d{4}-\d{2}-\d{2}$/.test(dismissedDate)) {
    return false;
  }
  return dismissedDate > latestDate && dismissedDate <= targetDate;
}

export function removeCompletedTodoFromList(
  todos: TodoItem[],
  todoId: string,
  originId?: string,
): TodoItem[] {
  const normalizedOrigin = originId?.trim();
  return todos.filter((item) => {
    if (item.id === todoId) return false;
    if (normalizedOrigin && getTodoOriginId(item) === normalizedOrigin) return false;
    return item.status !== 'completed';
  });
}

/**
 * Resolves all todo items to display on targetDate:
 * - Stored active (incomplete) items whose date === targetDate
 * - Incomplete items from earlier dates carried forward automatically with priority = 'yesterday'
 * - Completed items are automatically excluded/removed from the list
 */
export function resolveTodosForDate(
  todos: TodoItem[],
  targetDate: string,
  dismissedTodoCarryovers: Record<string, string> = {},
): ResolvedTodoItem[] {
  if (!Array.isArray(todos) || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return [];
  }

  const latestByOrigin = groupLatestByOriginUpToDate(todos, targetDate);
  const resolved: ResolvedTodoItem[] = [];

  for (const [originId, latest] of latestByOrigin.entries()) {
    // Completed todos are automatically removed from the list
    if (latest.status === 'completed') {
      continue;
    }

    if (latest.date === targetDate) {
      resolved.push({
        ...latest,
        originId,
        isVirtualCarryover: false,
      });
      continue;
    }

    if (isOriginDismissedForTarget(originId, latest.date, targetDate, dismissedTodoCarryovers)) {
      continue;
    }

    resolved.push({
      id: `carry-${originId}-${targetDate}`,
      originId,
      date: targetDate,
      title: latest.title,
      ...(latest.notes ? { notes: latest.notes } : {}),
      status: 'pending',
      priority: 'yesterday',
      carriedFromDate: latest.date,
      createdBy: latest.createdBy,
      createdAt: latest.createdAt,
      updatedAt: latest.updatedAt,
      isVirtualCarryover: true,
    });
  }

  return sortResolvedTodos(resolved);
}

/**
 * Materializes incomplete previous-day todos onto targetDateKey (typically today's date)
 * so they are persisted in the workspace snapshot with tag 'yesterday'.
 */
export function syncTodoCarryoversUpToDate(
  todos: TodoItem[],
  targetDateKey: string,
  dismissedTodoCarryovers: Record<string, string> = {},
  nowIso = new Date().toISOString(),
): TodoItem[] {
  if (!Array.isArray(todos) || todos.length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(targetDateKey)) {
    return Array.isArray(todos) ? todos : [];
  }

  const latestByOrigin = groupLatestByOriginUpToDate(todos, targetDateKey);
  const additions: TodoItem[] = [];

  for (const [originId, latest] of latestByOrigin.entries()) {
    if (latest.date >= targetDateKey) continue;
    if (latest.status === 'completed') continue;
    if (isOriginDismissedForTarget(originId, latest.date, targetDateKey, dismissedTodoCarryovers)) {
      continue;
    }

    additions.push({
      id: `todo-carry-${originId}-${targetDateKey}`,
      originId,
      date: targetDateKey,
      title: latest.title,
      ...(latest.notes ? { notes: latest.notes } : {}),
      status: 'pending',
      priority: 'yesterday',
      carriedFromDate: latest.date,
      createdBy: latest.createdBy,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  if (additions.length === 0) {
    return todos;
  }

  return [...todos, ...additions];
}

/**
 * Removes unedited auto-carried 'yesterday' pending clones on dates strictly after completedDate
 * when the origin item is marked completed retroactively on an earlier date.
 */
export function cleanupCarriedClonesAfterCompletion(
  todos: TodoItem[],
  originId: string,
  completedDate: string,
): TodoItem[] {
  return todos.filter(
    (item) =>
      !(
        getTodoOriginId(item) === originId &&
        item.date > completedDate &&
        item.status === 'pending' &&
        item.priority === 'yesterday' &&
        Boolean(item.carriedFromDate)
      ),
  );
}

export function summarizeDayTodos(
  todos: ResolvedTodoItem[],
  persistedCompletedCount = 0,
): {
  totalCount: number;
  completedCount: number;
  inProgressCount: number;
  pendingCount: number;
  yesterdayCount: number;
} {
  let inlineCompletedCount = 0;
  let inProgressCount = 0;
  let pendingCount = 0;
  let yesterdayCount = 0;

  for (const item of todos) {
    if (item.status === 'completed') inlineCompletedCount += 1;
    else if (item.status === 'in_progress') inProgressCount += 1;
    else pendingCount += 1;

    if (item.priority === 'yesterday') yesterdayCount += 1;
  }

  const extraCompleted =
    Number.isFinite(persistedCompletedCount) && persistedCompletedCount > 0
      ? Math.round(persistedCompletedCount)
      : 0;
  const completedCount = inlineCompletedCount + extraCompleted;

  return {
    totalCount: todos.length + extraCompleted,
    completedCount,
    inProgressCount,
    pendingCount,
    yesterdayCount,
  };
}

export function formatShortDateDdMm(dateKey: string): string {
  const [, m, d] = dateKey.split('-');
  if (!m || !d) return dateKey;
  return `${d}/${m}`;
}
