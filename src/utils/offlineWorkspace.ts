import type {
  AppearanceSettings,
  CompletionStatus,
  DailyNoteInput,
  DailyNoteItem,
  IncomeEntry,
  IncomeInput,
  IncomeReceivedStatus,
  PlannerTask,
  StudentTuition,
  StudentTuitionInput,
  TaskInput,
  TodoInput,
  TodoItem,
  TuitionSession,
  TuitionSessionInput,
  WorkspaceSnapshot,
} from '../types/planner.ts';
import {
  DEFAULT_APP_BACKGROUND_COLOR,
  OFF_TASK_COLOR,
  ensureNonConflictingTaskColors,
  normalizeHexColor,
  pickAvailablePastelColor,
  syncWorkspaceIncomesWithTasks,
  validateIncomeInput,
  validateTaskInput,
} from './schedule.ts';
import {
  DEFAULT_TUITION_COLOR,
  syncWorkspaceStudentsWithTasks,
  validateStudentTuitionInput,
  validateTuitionSessionInput,
} from './tuition.ts';
import {
  cleanupCarriedClonesAfterCompletion,
  getTodoOriginId,
  normalizeTodoPriority,
  normalizeTodoStatus,
  removeCompletedTodoFromList,
  syncTodoCarryoversUpToDate,
  validateTodoInput,
} from './todo.ts';
import { normalizeDailyNoteKind, validateDailyNoteInput } from './notes.ts';
import { normalizeAvatarDataUrl, validateAvatarDataUrl } from './avatar.ts';

function genId(prefix: string): string {
  const uid =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${uid}`;
}

function getLocalTodayKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface PendingSyncState {
  pendingServerSync: boolean;
  pendingDriveSync: boolean;
  pendingDeleteMonths: string[];
  updatedAt: string;
}

export const EMPTY_PENDING_SYNC_STATE: PendingSyncState = {
  pendingServerSync: false,
  pendingDriveSync: false,
  pendingDeleteMonths: [],
  updatedAt: '',
};

export function normalizeMonthKey(raw: string): string | null {
  const trimmed = raw.trim();
  return /^\d{4}-\d{2}$/.test(trimmed) ? trimmed : null;
}

export function formatMonthKeyLabel(monthKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey.trim());
  if (!match) return monthKey;
  return `Tháng ${Number(match[2])}/${match[1]}`;
}

/**
 * Xóa toàn bộ dữ liệu thuộc một tháng (YYYY-MM) khỏi snapshot:
 * tasks, thu nhập tháng đó, buổi học học phí trong tháng đó (và thẻ học sinh thuộc tháng đó nếu không còn buổi học ở tháng khác),
 * việc cần làm (todos), ghi chú theo ngày, mục tiêu ngày, bộ đếm hoàn thành và mục tiêu thu nhập tháng/ngày.
 * Bảo toàn nguyên vẹn mọi tháng khác, tài khoản, giao diện và ảnh đại diện.
 */
export function clearMonthDataFromSnapshot(
  snapshot: WorkspaceSnapshot,
  monthKey: string,
  actor = 'Người dùng',
  nowIso = new Date().toISOString(),
): WorkspaceSnapshot {
  const validMonthKey = normalizeMonthKey(monthKey);
  if (!validMonthKey) {
    throw new Error('Tháng cần xóa không hợp lệ (định dạng YYYY-MM).');
  }

  const prefix = `${validMonthKey}-`;
  const targetMonthNumber = Number(validMonthKey.slice(5, 7));

  const removedTaskIds = new Set(
    (snapshot.tasks || [])
      .filter((t) => typeof t.date === 'string' && t.date.startsWith(prefix))
      .map((t) => t.id),
  );

  const nextTasks = (snapshot.tasks || []).filter(
    (t) => !(typeof t.date === 'string' && t.date.startsWith(prefix)),
  );

  const nextIncomes = (snapshot.incomes || []).filter((inc) => inc.month !== validMonthKey);

  const nextStudents: StudentTuition[] = [];
  for (const st of snapshot.students || []) {
    const remainingSessions = (st.sessions || []).filter(
      (ses) => !(typeof ses.date === 'string' && ses.date.startsWith(prefix)),
    );
    const cleanedDismissed = st.dismissedSyncedTaskIds?.filter((id) => !removedTaskIds.has(id));
    if (st.month === targetMonthNumber && remainingSessions.length === 0) {
      // Học sinh thuộc riêng tháng bị xóa và không còn buổi học ở tháng khác -> xóa cùng dữ liệu tháng
      continue;
    }
    nextStudents.push({
      ...st,
      sessions: remainingSessions,
      ...(cleanedDismissed && cleanedDismissed.length > 0
        ? { dismissedSyncedTaskIds: cleanedDismissed }
        : { dismissedSyncedTaskIds: undefined }),
      updatedAt:
        remainingSessions.length !== (st.sessions || []).length ? nowIso : st.updatedAt,
    });
  }

  const nextTodos = (snapshot.todos || []).filter(
    (todo) => !(typeof todo.date === 'string' && todo.date.startsWith(prefix)),
  );

  const nextNotes = (snapshot.dailyNotes || []).filter(
    (note) => !(typeof note.date === 'string' && note.date.startsWith(prefix)),
  );

  const nextDailyGoals: Record<string, string> = {};
  for (const [k, v] of Object.entries(snapshot.dailyGoals || {})) {
    if (!k.startsWith(prefix)) {
      nextDailyGoals[k] = v;
    }
  }

  const nextCompletedCounts: Record<string, number> = {};
  for (const [k, v] of Object.entries(snapshot.completedTodoCountsByDate || {})) {
    if (!k.startsWith(prefix)) {
      nextCompletedCounts[k] = v;
    }
  }

  const nextMonthlyTargets: Record<string, number> = {};
  for (const [k, v] of Object.entries(snapshot.monthlyIncomeTargets || {})) {
    if (k !== validMonthKey) {
      nextMonthlyTargets[k] = v;
    }
  }

  const nextDailyTargets: Record<string, number> = {};
  for (const [k, v] of Object.entries(snapshot.dailyIncomeTargets || {})) {
    if (!k.startsWith(prefix)) {
      nextDailyTargets[k] = v;
    }
  }

  const syncedIncomes = syncWorkspaceIncomesWithTasks(nextTasks, nextIncomes, nowIso);
  const syncedStudents = syncWorkspaceStudentsWithTasks(nextTasks, nextStudents, nowIso);

  return {
    ...snapshot,
    revision: (snapshot.revision || 0) + 1,
    lastSavedAt: nowIso,
    lastEditedBy: actor,
    tasks: nextTasks,
    incomes: syncedIncomes,
    students: syncedStudents,
    todos: nextTodos,
    dailyNotes: nextNotes,
    dailyGoals: nextDailyGoals,
    completedTodoCountsByDate: nextCompletedCounts,
    monthlyIncomeTargets: nextMonthlyTargets,
    dailyIncomeTargets: nextDailyTargets,
  };
}

function finalizeSnapshotUpdate(
  snapshot: WorkspaceSnapshot,
  actor: string,
  nowIso: string,
  partial: Partial<WorkspaceSnapshot>,
): WorkspaceSnapshot {
  const nextTasks = partial.tasks ?? snapshot.tasks ?? [];
  const coloredTasks = ensureNonConflictingTaskColors(nextTasks);
  const syncedIncomes = syncWorkspaceIncomesWithTasks(
    coloredTasks,
    partial.incomes ?? snapshot.incomes ?? [],
    nowIso,
  );
  const syncedStudents = syncWorkspaceStudentsWithTasks(
    coloredTasks,
    partial.students ?? snapshot.students ?? [],
    nowIso,
  );

  return {
    ...snapshot,
    ...partial,
    tasks: coloredTasks,
    incomes: syncedIncomes,
    students: syncedStudents,
    revision: (snapshot.revision || 0) + 1,
    lastSavedAt: nowIso,
    lastEditedBy: actor,
  };
}

export function applyOfflineTaskSave(
  snapshot: WorkspaceSnapshot,
  input: TaskInput,
  existingId: string | undefined,
  actor: string,
  nowIso = new Date().toISOString(),
): WorkspaceSnapshot {
  const isOff = Boolean(input.isOff);
  const isAllDay = Boolean(input.isAllDay);
  const bgHex = snapshot.appearance?.backgroundColor;
  const rawNormalized: TaskInput = {
    date: input.date.trim(),
    title: isOff ? (input.title.trim() || 'Off') : input.title.trim(),
    lessonName: isOff ? '' : (input.lessonName || '').trim(),
    startTime: isAllDay ? '06:00' : input.startTime.trim(),
    endTime: isAllDay ? '24:00' : input.endTime.trim(),
    income: isOff ? 0 : Math.round(Number(input.income) || 0),
    status: isOff ? 'pending' : input.status,
    isOff,
    isAllDay,
    color: isOff
      ? OFF_TASK_COLOR
      : normalizeHexColor(input.color) ||
        pickAvailablePastelColor(snapshot.tasks, input, existingId, 0, bgHex),
    notes: isOff ? '' : (input.notes || '').trim(),
    link: isOff ? '' : (input.link || '').trim(),
  };

  const errors = validateTaskInput(rawNormalized, snapshot.tasks, existingId, bgHex);
  if (Object.keys(errors).length > 0) {
    throw new Error(Object.values(errors)[0] || 'Dữ liệu task không hợp lệ.');
  }

  let nextTasks: PlannerTask[];
  let nextStudents = snapshot.students || [];

  if (existingId) {
    const idx = snapshot.tasks.findIndex((t) => t.id === existingId);
    if (idx < 0) {
      throw new Error('Không tìm thấy task để cập nhật.');
    }
    const existing = snapshot.tasks[idx];
    const updated: PlannerTask = {
      ...existing,
      ...rawNormalized,
      createdBy: actor,
      updatedAt: nowIso,
    };
    nextTasks = [...snapshot.tasks];
    nextTasks[idx] = updated;
    nextStudents = nextStudents.map((st) =>
      st.dismissedSyncedTaskIds?.includes(existingId)
        ? {
            ...st,
            dismissedSyncedTaskIds: st.dismissedSyncedTaskIds.filter((id) => id !== existingId),
          }
        : st,
    );
  } else {
    const created: PlannerTask = {
      id: genId('task'),
      ...rawNormalized,
      createdBy: actor,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    nextTasks = [...snapshot.tasks, created];
  }

  return finalizeSnapshotUpdate(snapshot, actor, nowIso, {
    tasks: nextTasks,
    students: nextStudents,
  });
}

export function applyOfflineTaskPatch(
  snapshot: WorkspaceSnapshot,
  taskId: string,
  patch: { status?: CompletionStatus; income?: number },
  actor: string,
  nowIso = new Date().toISOString(),
): WorkspaceSnapshot {
  const idx = snapshot.tasks.findIndex((t) => t.id === taskId);
  if (idx < 0) throw new Error('Không tìm thấy task.');
  const existing = snapshot.tasks[idx];
  const updated: PlannerTask = {
    ...existing,
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.income !== undefined ? { income: Math.max(0, Math.round(patch.income)) } : {}),
    createdBy: actor,
    updatedAt: nowIso,
  };
  const nextTasks = [...snapshot.tasks];
  nextTasks[idx] = updated;
  return finalizeSnapshotUpdate(snapshot, actor, nowIso, { tasks: nextTasks });
}

export function applyOfflineTaskDelete(
  snapshot: WorkspaceSnapshot,
  taskId: string,
  actor: string,
  nowIso = new Date().toISOString(),
): WorkspaceSnapshot {
  const nextTasks = snapshot.tasks.filter((t) => t.id !== taskId);
  return finalizeSnapshotUpdate(snapshot, actor, nowIso, { tasks: nextTasks });
}

export function applyOfflineIncomeAdd(
  snapshot: WorkspaceSnapshot,
  input: IncomeInput,
  actor: string,
  nowIso = new Date().toISOString(),
): WorkspaceSnapshot {
  const sanitized: IncomeInput = {
    month: input.month.trim(),
    sourceName: input.sourceName.trim(),
    amount: Math.round(Number(input.amount) || 0),
    receivedStatus: input.receivedStatus === 'received' ? 'received' : 'unreceived',
  };
  const errors = validateIncomeInput(sanitized);
  if (Object.keys(errors).length > 0) {
    throw new Error(Object.values(errors)[0] || 'Dữ liệu nguồn thu không hợp lệ.');
  }
  const entry: IncomeEntry = {
    id: genId('inc'),
    ...sanitized,
    createdBy: actor,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  return finalizeSnapshotUpdate(snapshot, actor, nowIso, {
    incomes: [entry, ...(snapshot.incomes || [])],
  });
}

export function applyOfflineIncomeStatusUpdate(
  snapshot: WorkspaceSnapshot,
  incomeId: string,
  nextStatus: IncomeReceivedStatus,
  actor: string,
  nowIso = new Date().toISOString(),
): WorkspaceSnapshot {
  const nextIncomes = (snapshot.incomes || []).map((inc) =>
    inc.id === incomeId ? { ...inc, receivedStatus: nextStatus, updatedAt: nowIso } : inc,
  );
  return finalizeSnapshotUpdate(snapshot, actor, nowIso, { incomes: nextIncomes });
}

export function applyOfflineIncomeDelete(
  snapshot: WorkspaceSnapshot,
  incomeId: string,
  actor: string,
  nowIso = new Date().toISOString(),
): WorkspaceSnapshot {
  const nextIncomes = (snapshot.incomes || []).filter((inc) => inc.id !== incomeId);
  return finalizeSnapshotUpdate(snapshot, actor, nowIso, { incomes: nextIncomes });
}

export function applyOfflineStudentCreate(
  snapshot: WorkspaceSnapshot,
  input: StudentTuitionInput,
  actor: string,
  nowIso = new Date().toISOString(),
): { snapshot: WorkspaceSnapshot; student: StudentTuition } {
  const sanitized: Required<StudentTuitionInput> = {
    studentName: input.studentName.trim(),
    studySchedule: input.studySchedule.trim(),
    feePerSession: Math.round(Number(input.feePerSession) || 0),
    month: input.month ?? new Date().getMonth() + 1,
    themeColor:
      input.themeColor && /^#[0-9a-f]{6}$/i.test(input.themeColor.trim())
        ? input.themeColor.trim()
        : DEFAULT_TUITION_COLOR,
  };
  const errors = validateStudentTuitionInput(sanitized);
  if (Object.keys(errors).length > 0) {
    throw new Error(Object.values(errors)[0] || 'Thông tin học sinh không hợp lệ.');
  }
  const student: StudentTuition = {
    id: genId('stu'),
    ...sanitized,
    sessions: [],
    createdBy: actor,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const nextSnap = finalizeSnapshotUpdate(snapshot, actor, nowIso, {
    students: [...(snapshot.students || []), student],
  });
  const saved = nextSnap.students?.find((s) => s.id === student.id) || student;
  return { snapshot: nextSnap, student: saved };
}

export function applyOfflineStudentUpdate(
  snapshot: WorkspaceSnapshot,
  studentId: string,
  input: StudentTuitionInput,
  actor: string,
  nowIso = new Date().toISOString(),
): WorkspaceSnapshot {
  const students = snapshot.students || [];
  const idx = students.findIndex((s) => s.id === studentId);
  if (idx < 0) throw new Error('Không tìm thấy học sinh.');
  const existing = students[idx];
  const merged = {
    studentName: input.studentName.trim(),
    studySchedule: input.studySchedule.trim(),
    feePerSession: Math.round(Number(input.feePerSession) || 0),
    month: input.month ?? existing.month,
    themeColor:
      input.themeColor && /^#[0-9a-f]{6}$/i.test(input.themeColor.trim())
        ? input.themeColor.trim()
        : existing.themeColor,
  };
  const errors = validateStudentTuitionInput(merged);
  if (Object.keys(errors).length > 0) {
    throw new Error(Object.values(errors)[0] || 'Thông tin học sinh không hợp lệ.');
  }
  const nextStudents = [...students];
  nextStudents[idx] = { ...existing, ...merged, updatedAt: nowIso };
  return finalizeSnapshotUpdate(snapshot, actor, nowIso, { students: nextStudents });
}

export function applyOfflineStudentDelete(
  snapshot: WorkspaceSnapshot,
  studentId: string,
  actor: string,
  nowIso = new Date().toISOString(),
): WorkspaceSnapshot {
  const nextStudents = (snapshot.students || []).filter((s) => s.id !== studentId);
  return finalizeSnapshotUpdate(snapshot, actor, nowIso, { students: nextStudents });
}

export function applyOfflineSessionAdd(
  snapshot: WorkspaceSnapshot,
  studentId: string,
  input: TuitionSessionInput,
  actor: string,
  nowIso = new Date().toISOString(),
): WorkspaceSnapshot {
  const errors = validateTuitionSessionInput(input);
  if (Object.keys(errors).length > 0) {
    throw new Error(Object.values(errors)[0] || 'Dữ liệu buổi học không hợp lệ.');
  }
  const students = snapshot.students || [];
  const idx = students.findIndex((s) => s.id === studentId);
  if (idx < 0) throw new Error('Không tìm thấy học sinh.');
  const session: TuitionSession = {
    id: genId('ses'),
    date: input.date.trim(),
    content: input.content.trim(),
    status: input.status,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const nextStudents = [...students];
  nextStudents[idx] = {
    ...students[idx],
    sessions: [...students[idx].sessions, session],
    updatedAt: nowIso,
  };
  return finalizeSnapshotUpdate(snapshot, actor, nowIso, { students: nextStudents });
}

export function applyOfflineSessionUpdate(
  snapshot: WorkspaceSnapshot,
  studentId: string,
  sessionId: string,
  patch: Partial<TuitionSessionInput>,
  actor: string,
  nowIso = new Date().toISOString(),
): WorkspaceSnapshot {
  const students = snapshot.students || [];
  const idx = students.findIndex((s) => s.id === studentId);
  if (idx < 0) throw new Error('Không tìm thấy học sinh.');
  const existing = students[idx];
  const sIdx = existing.sessions.findIndex((s) => s.id === sessionId);
  if (sIdx < 0) throw new Error('Không tìm thấy buổi học.');
  const prevSes = existing.sessions[sIdx];
  const merged: TuitionSessionInput = {
    date: (patch.date ?? prevSes.date).trim(),
    content: (patch.content ?? prevSes.content).trim(),
    status: patch.status ?? prevSes.status,
  };
  const errors = validateTuitionSessionInput(merged);
  if (Object.keys(errors).length > 0) {
    throw new Error(Object.values(errors)[0] || 'Dữ liệu buổi học không hợp lệ.');
  }
  const nextSessions = [...existing.sessions];
  nextSessions[sIdx] = { ...prevSes, ...merged, updatedAt: nowIso };
  const nextStudents = [...students];
  nextStudents[idx] = { ...existing, sessions: nextSessions, updatedAt: nowIso };
  return finalizeSnapshotUpdate(snapshot, actor, nowIso, { students: nextStudents });
}

export function applyOfflineSessionDelete(
  snapshot: WorkspaceSnapshot,
  studentId: string,
  sessionId: string,
  actor: string,
  nowIso = new Date().toISOString(),
): WorkspaceSnapshot {
  const students = snapshot.students || [];
  const idx = students.findIndex((s) => s.id === studentId);
  if (idx < 0) throw new Error('Không tìm thấy học sinh.');
  const existing = students[idx];
  const target = existing.sessions.find((s) => s.id === sessionId);
  if (!target) throw new Error('Buổi học không tồn tại.');
  const nextDismissed = target.sourceTaskId
    ? Array.from(new Set([...(existing.dismissedSyncedTaskIds ?? []), target.sourceTaskId]))
    : existing.dismissedSyncedTaskIds;
  const nextStudents = [...students];
  nextStudents[idx] = {
    ...existing,
    sessions: existing.sessions.filter((s) => s.id !== sessionId),
    ...(nextDismissed ? { dismissedSyncedTaskIds: nextDismissed } : {}),
    updatedAt: nowIso,
  };
  return finalizeSnapshotUpdate(snapshot, actor, nowIso, { students: nextStudents });
}

export function applyOfflineTodoCreate(
  snapshot: WorkspaceSnapshot,
  input: TodoInput,
  actor: string,
  nowIso = new Date().toISOString(),
): WorkspaceSnapshot {
  const sanitized: TodoInput = {
    date: input.date.trim() || getLocalTodayKey(),
    title: input.title.trim(),
    notes: (input.notes || '').trim(),
    status: normalizeTodoStatus(input.status),
    priority: normalizeTodoPriority(input.priority),
    originId: input.originId,
    carriedFromDate: input.carriedFromDate,
  };
  const errors = validateTodoInput(sanitized);
  if (Object.keys(errors).length > 0) {
    throw new Error(Object.values(errors)[0] || 'Dữ liệu công việc không hợp lệ.');
  }

  const id = genId('todo');
  const originId = sanitized.originId || id;
  const dismissed = { ...(snapshot.dismissedTodoCarryovers || {}) };
  const counts = { ...(snapshot.completedTodoCountsByDate || {}) };

  if (sanitized.status === 'completed') {
    const remaining = removeCompletedTodoFromList(snapshot.todos || [], id, originId);
    dismissed[originId] = sanitized.date;
    counts[sanitized.date] = (counts[sanitized.date] || 0) + 1;
    return finalizeSnapshotUpdate(snapshot, actor, nowIso, {
      todos: remaining,
      dismissedTodoCarryovers: dismissed,
      completedTodoCountsByDate: counts,
    });
  }

  let nextTodos = [...(snapshot.todos || [])];
  const sameIdx = nextTodos.findIndex(
    (item) => getTodoOriginId(item) === originId && item.date === sanitized.date,
  );
  if (sameIdx >= 0) {
    nextTodos[sameIdx] = {
      ...nextTodos[sameIdx],
      title: sanitized.title,
      ...(sanitized.notes ? { notes: sanitized.notes } : { notes: undefined }),
      status: sanitized.status,
      priority: sanitized.priority,
      updatedAt: nowIso,
    };
  } else {
    const created: TodoItem = {
      id,
      originId,
      date: sanitized.date,
      title: sanitized.title,
      ...(sanitized.notes ? { notes: sanitized.notes } : {}),
      status: sanitized.status,
      priority: sanitized.priority,
      ...(sanitized.carriedFromDate ? { carriedFromDate: sanitized.carriedFromDate } : {}),
      createdBy: actor,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    nextTodos.push(created);
  }

  nextTodos = syncTodoCarryoversUpToDate(nextTodos, getLocalTodayKey(), dismissed, nowIso);
  return finalizeSnapshotUpdate(snapshot, actor, nowIso, {
    todos: nextTodos,
  });
}

export function applyOfflineTodoUpdate(
  snapshot: WorkspaceSnapshot,
  todoId: string,
  patch: Partial<TodoInput>,
  actor: string,
  nowIso = new Date().toISOString(),
): WorkspaceSnapshot {
  const todos = snapshot.todos || [];
  const idx = todos.findIndex((item) => item.id === todoId);
  if (idx < 0) throw new Error('Không tìm thấy công việc để cập nhật.');
  const existing = todos[idx];
  const merged: TodoInput = {
    date: (patch.date ?? existing.date).trim(),
    title: (patch.title ?? existing.title).trim(),
    notes: (patch.notes ?? existing.notes ?? '').trim(),
    status: normalizeTodoStatus(patch.status ?? existing.status),
    priority: normalizeTodoPriority(patch.priority ?? existing.priority),
    originId: existing.originId ?? existing.id,
    carriedFromDate: existing.carriedFromDate,
  };
  const errors = validateTodoInput(merged);
  if (Object.keys(errors).length > 0) {
    throw new Error(Object.values(errors)[0] || 'Dữ liệu công việc không hợp lệ.');
  }

  const originId = getTodoOriginId(existing);
  const counts = { ...(snapshot.completedTodoCountsByDate || {}) };

  if (merged.status === 'completed') {
    const cleaned = cleanupCarriedClonesAfterCompletion(
      removeCompletedTodoFromList(todos, todoId, originId),
      originId,
      merged.date,
    );
    counts[merged.date] = (counts[merged.date] || 0) + 1;
    return finalizeSnapshotUpdate(snapshot, actor, nowIso, {
      todos: cleaned,
      completedTodoCountsByDate: counts,
    });
  }

  let nextTodos = [...todos];
  nextTodos[idx] = {
    ...existing,
    ...merged,
    ...(merged.notes ? { notes: merged.notes } : { notes: undefined }),
    originId,
    updatedAt: nowIso,
  };
  nextTodos = syncTodoCarryoversUpToDate(
    nextTodos,
    getLocalTodayKey(),
    snapshot.dismissedTodoCarryovers || {},
    nowIso,
  );
  return finalizeSnapshotUpdate(snapshot, actor, nowIso, { todos: nextTodos });
}

export function applyOfflineTodoDelete(
  snapshot: WorkspaceSnapshot,
  todoId: string,
  actor: string,
  nowIso = new Date().toISOString(),
): WorkspaceSnapshot {
  const todos = snapshot.todos || [];
  const target = todos.find((t) => t.id === todoId);
  if (!target) throw new Error('Công việc không tồn tại.');
  const dismissed = { ...(snapshot.dismissedTodoCarryovers || {}) };
  if (target.carriedFromDate) {
    dismissed[getTodoOriginId(target)] = target.date;
  }
  return finalizeSnapshotUpdate(snapshot, actor, nowIso, {
    todos: todos.filter((t) => t.id !== todoId),
    dismissedTodoCarryovers: dismissed,
  });
}

export function applyOfflineCarryoverDismiss(
  snapshot: WorkspaceSnapshot,
  originId: string,
  dateKey: string,
  actor: string,
  nowIso = new Date().toISOString(),
): WorkspaceSnapshot {
  const dismissed = {
    ...(snapshot.dismissedTodoCarryovers || {}),
    [originId]: dateKey,
  };
  const nextTodos = (snapshot.todos || []).filter(
    (item) => !(getTodoOriginId(item) === originId && item.date >= dateKey && Boolean(item.carriedFromDate)),
  );
  return finalizeSnapshotUpdate(snapshot, actor, nowIso, {
    todos: nextTodos,
    dismissedTodoCarryovers: dismissed,
  });
}

export function applyOfflineNoteCreate(
  snapshot: WorkspaceSnapshot,
  input: DailyNoteInput,
  actor: string,
  nowIso = new Date().toISOString(),
): WorkspaceSnapshot {
  const sanitized: DailyNoteInput = {
    date: input.date.trim(),
    kind: normalizeDailyNoteKind(input.kind),
    content: input.content.trim(),
    checked: input.kind === 'checklist' ? Boolean(input.checked) : false,
  };
  const errors = validateDailyNoteInput(sanitized);
  if (Object.keys(errors).length > 0) {
    throw new Error(Object.values(errors)[0] || 'Dữ liệu ghi chú không hợp lệ.');
  }
  const created: DailyNoteItem = {
    id: genId('note'),
    date: sanitized.date,
    kind: sanitized.kind,
    content: sanitized.content,
    ...(sanitized.kind === 'checklist' ? { checked: Boolean(sanitized.checked) } : {}),
    createdBy: actor,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  return finalizeSnapshotUpdate(snapshot, actor, nowIso, {
    dailyNotes: [...(snapshot.dailyNotes || []), created],
  });
}

export function applyOfflineNoteUpdate(
  snapshot: WorkspaceSnapshot,
  noteId: string,
  patch: Partial<DailyNoteInput>,
  actor: string,
  nowIso = new Date().toISOString(),
): WorkspaceSnapshot {
  const notes = snapshot.dailyNotes || [];
  const idx = notes.findIndex((n) => n.id === noteId);
  if (idx < 0) throw new Error('Không tìm thấy ghi chú để cập nhật.');
  const existing = notes[idx];
  const merged: DailyNoteInput = {
    date: (patch.date ?? existing.date).trim(),
    kind: normalizeDailyNoteKind(patch.kind ?? existing.kind),
    content: (patch.content ?? existing.content).trim(),
    checked: patch.checked !== undefined ? Boolean(patch.checked) : Boolean(existing.checked),
  };
  const errors = validateDailyNoteInput(merged);
  if (Object.keys(errors).length > 0) {
    throw new Error(Object.values(errors)[0] || 'Dữ liệu ghi chú không hợp lệ.');
  }
  const nextNotes = [...notes];
  nextNotes[idx] = {
    ...existing,
    date: merged.date,
    kind: merged.kind,
    content: merged.content,
    ...(merged.kind === 'checklist' ? { checked: Boolean(merged.checked) } : { checked: undefined }),
    updatedAt: nowIso,
  };
  return finalizeSnapshotUpdate(snapshot, actor, nowIso, { dailyNotes: nextNotes });
}

export function applyOfflineNoteDelete(
  snapshot: WorkspaceSnapshot,
  noteId: string,
  actor: string,
  nowIso = new Date().toISOString(),
): WorkspaceSnapshot {
  const notes = snapshot.dailyNotes || [];
  const filtered = notes.filter((n) => n.id !== noteId);
  return finalizeSnapshotUpdate(snapshot, actor, nowIso, { dailyNotes: filtered });
}

export function applyOfflineClearDayNotes(
  snapshot: WorkspaceSnapshot,
  dateKey: string,
  actor: string,
  nowIso = new Date().toISOString(),
): WorkspaceSnapshot {
  const filtered = (snapshot.dailyNotes || []).filter((n) => n.date !== dateKey);
  return finalizeSnapshotUpdate(snapshot, actor, nowIso, { dailyNotes: filtered });
}

export function applyOfflineMonthlyTarget(
  snapshot: WorkspaceSnapshot,
  monthKey: string,
  amount: number,
  actor: string,
  nowIso = new Date().toISOString(),
): WorkspaceSnapshot {
  const nextMonthly = { ...(snapshot.monthlyIncomeTargets || {}) };
  if (amount <= 0) {
    delete nextMonthly[monthKey];
  } else {
    nextMonthly[monthKey] = Math.round(amount);
  }
  return finalizeSnapshotUpdate(snapshot, actor, nowIso, {
    monthlyIncomeTargets: nextMonthly,
  });
}

export function applyOfflineAppearance(
  snapshot: WorkspaceSnapshot,
  next: AppearanceSettings,
  actor: string,
  nowIso = new Date().toISOString(),
): WorkspaceSnapshot {
  const normalized: AppearanceSettings = {
    themeMode: next.themeMode === 'dark' ? 'dark' : 'light',
    backgroundColor: normalizeHexColor(next.backgroundColor) || DEFAULT_APP_BACKGROUND_COLOR,
  };
  return finalizeSnapshotUpdate(snapshot, actor, nowIso, { appearance: normalized });
}

export function applyOfflineAvatar(
  snapshot: WorkspaceSnapshot,
  nextAvatarDataUrl: string,
  actor: string,
  nowIso = new Date().toISOString(),
): WorkspaceSnapshot {
  const err = validateAvatarDataUrl(nextAvatarDataUrl);
  if (err) throw new Error(err);
  return finalizeSnapshotUpdate(snapshot, actor, nowIso, {
    avatarDataUrl: normalizeAvatarDataUrl(nextAvatarDataUrl),
  });
}

export function isNetworkFetchError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }
  if (err instanceof TypeError) return true;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes('failed to fetch') ||
      msg.includes('networkerror') ||
      msg.includes('network request failed') ||
      msg.includes('load failed') ||
      msg.includes('offline')
    );
  }
  return false;
}

export function mergePendingSyncState(
  current: PendingSyncState,
  update: {
    pendingServerSync?: boolean;
    pendingDriveSync?: boolean;
    addDeleteMonth?: string;
    clearDeleteMonths?: string[];
  },
  nowIso = new Date().toISOString(),
): PendingSyncState {
  const deleteSet = new Set(current.pendingDeleteMonths || []);
  if (update.addDeleteMonth) {
    const mk = normalizeMonthKey(update.addDeleteMonth);
    if (mk) deleteSet.add(mk);
  }
  if (update.clearDeleteMonths) {
    for (const mk of update.clearDeleteMonths) {
      deleteSet.delete(mk);
    }
  }
  return {
    pendingServerSync:
      update.pendingServerSync !== undefined
        ? update.pendingServerSync
        : current.pendingServerSync,
    pendingDriveSync:
      update.pendingDriveSync !== undefined ? update.pendingDriveSync : current.pendingDriveSync,
    pendingDeleteMonths: Array.from(deleteSet).sort(),
    updatedAt: nowIso,
  };
}
