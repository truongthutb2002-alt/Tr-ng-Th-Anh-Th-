import test from 'node:test';
import assert from 'node:assert/strict';
import type { TodoItem } from '../types/planner';
import {
  cleanupCarriedClonesAfterCompletion,
  removeCompletedTodoFromList,
  resolveTodosForDate,
  summarizeDayTodos,
  syncTodoCarryoversUpToDate,
  TODO_PRIORITY_LABELS,
  TODO_STATUS_LABELS,
  validateTodoInput,
} from './todo';

const baseTodo: TodoItem = {
  id: 'todo-1',
  originId: 'todo-1',
  date: '2026-11-13',
  title: 'Soạn bài giảng Unit 5',
  status: 'pending',
  priority: 'priority',
  createdBy: 'Thư',
  createdAt: '2026-11-13T08:00:00.000Z',
  updatedAt: '2026-11-13T08:00:00.000Z',
};

test('todo labels and validation cover all required Vietnamese statuses and priorities', () => {
  assert.equal(TODO_STATUS_LABELS.pending, 'Chưa hoàn thành');
  assert.equal(TODO_STATUS_LABELS.in_progress, 'Đang làm');
  assert.equal(TODO_STATUS_LABELS.completed, 'Hoàn thành');

  assert.equal(TODO_PRIORITY_LABELS.default, 'Mặc định');
  assert.equal(TODO_PRIORITY_LABELS.priority, 'Ưu tiên');
  assert.equal(TODO_PRIORITY_LABELS.later, 'Làm sau');
  assert.equal(TODO_PRIORITY_LABELS.yesterday, 'Hôm qua');

  const errs = validateTodoInput({
    date: '2026-11-14',
    title: '   ',
    status: 'pending',
    priority: 'default',
  });
  assert.ok(errs.title);

  const okErrs = validateTodoInput({
    date: '2026-11-14',
    title: 'Gửi phiếu học phí',
    status: 'pending',
    priority: 'default',
  });
  assert.equal(Object.keys(okErrs).length, 0);
});

test('incomplete todos automatically carry over to the next day with tag "Hôm qua" and completed ones are automatically removed', () => {
  const todos: TodoItem[] = [
    baseTodo, // pending on 2026-11-13
    {
      ...baseTodo,
      id: 'todo-2',
      originId: 'todo-2',
      date: '2026-11-13',
      title: 'Chấm bài tập',
      status: 'in_progress',
      priority: 'default',
    },
    {
      ...baseTodo,
      id: 'todo-3',
      originId: 'todo-3',
      date: '2026-11-13',
      title: 'Gọi phụ huynh',
      status: 'completed',
      priority: 'default',
    },
  ];

  // Completed item on same day (2026-11-13) is automatically excluded from list
  const nov13 = resolveTodosForDate(todos, '2026-11-13');
  assert.equal(nov13.length, 2);
  assert.equal(nov13.some((item) => item.title === 'Gọi phụ huynh'), false);

  // Viewing 2026-11-14: todo-1 and todo-2 roll over with priority='yesterday' and status='pending'; todo-3 does not
  const nov14 = resolveTodosForDate(todos, '2026-11-14');
  assert.equal(nov14.length, 2);
  assert.ok(nov14.every((item) => item.priority === 'yesterday'));
  assert.ok(nov14.every((item) => item.status === 'pending'));
  assert.ok(nov14.every((item) => item.carriedFromDate === '2026-11-13'));
  assert.equal(nov14.some((item) => item.title === 'Gọi phụ huynh'), false);

  const summary = summarizeDayTodos(nov14);
  assert.equal(summary.totalCount, 2);
  assert.equal(summary.pendingCount, 2);
  assert.equal(summary.yesterdayCount, 2);
});

test('syncTodoCarryoversUpToDate materializes persisted clones once and stops after completion or dismissal', () => {
  const initial: TodoItem[] = [baseTodo];

  const synced = syncTodoCarryoversUpToDate(
    initial,
    '2026-11-14',
    {},
    '2026-11-14T00:05:00.000Z',
  );
  assert.equal(synced.length, 2);
  assert.equal(synced[1].date, '2026-11-14');
  assert.equal(synced[1].priority, 'yesterday');
  assert.equal(synced[1].status, 'pending');
  assert.equal(synced[1].originId, 'todo-1');
  assert.equal(synced[1].carriedFromDate, '2026-11-13');

  // Re-running sync on the same day does not duplicate
  const syncedAgain = syncTodoCarryoversUpToDate(synced, '2026-11-14', {});
  assert.equal(syncedAgain.length, 2);

  // Removing a completed todo removes all instances sharing its originId
  const afterRemove = removeCompletedTodoFromList(synced, synced[1].id, 'todo-1');
  assert.equal(afterRemove.length, 0);
  assert.equal(resolveTodosForDate(afterRemove, '2026-11-14').length, 0);
  assert.equal(resolveTodosForDate(afterRemove, '2026-11-15').length, 0);

  // Dismissing carryover on 2026-11-14 prevents rollover on 2026-11-14 and 2026-11-15
  const nov15AfterDismiss = resolveTodosForDate(initial, '2026-11-15', {
    'todo-1': '2026-11-14',
  });
  assert.equal(nov15AfterDismiss.length, 0);

  // Retroactively completing on 2026-11-13 cleans up unedited carryover clone on 2026-11-14
  const cleaned = cleanupCarriedClonesAfterCompletion(synced, 'todo-1', '2026-11-13');
  assert.equal(cleaned.length, 1);
  assert.equal(cleaned[0].date, '2026-11-13');

  // Persisted completed count preserves total and completed progress even after auto-deletion
  const remainingResolved = resolveTodosForDate(
    [{ ...baseTodo, date: '2026-11-14' }],
    '2026-11-14',
  );
  const progressAfterOneCompleted = summarizeDayTodos(remainingResolved, 1);
  assert.equal(progressAfterOneCompleted.completedCount, 1);
  assert.equal(progressAfterOneCompleted.totalCount, 2);
});
