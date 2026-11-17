import type { WorkspaceSnapshot } from '../types/planner.ts';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmailAddress(email: string): string {
  return email.trim().toLowerCase();
}

export function validateEmailInput(email: string, options?: { required?: boolean }): string | null {
  const trimmed = email.trim();
  if (!trimmed) {
    return options?.required ? 'Vui lòng nhập địa chỉ email để liên kết Google Drive.' : null;
  }
  if (trimmed.length > 160) {
    return 'Địa chỉ email tối đa 160 ký tự.';
  }
  if (!EMAIL_REGEX.test(trimmed)) {
    return 'Địa chỉ email không hợp lệ (ví dụ: tenban@gmail.com).';
  }
  return null;
}

export function resolveGoogleWorkspaceId(email: string): string {
  const normalized = normalizeEmailAddress(email)
    .replace(/[^a-z0-9@._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `gdrive-${normalized || 'user'}`;
}

export function summarizeSnapshotCounts(snapshot: WorkspaceSnapshot | null | undefined): {
  tasks: number;
  incomes: number;
  students: number;
  todos: number;
  totalItems: number;
} {
  if (!snapshot) {
    return { tasks: 0, incomes: 0, students: 0, todos: 0, totalItems: 0 };
  }
  const tasks = Array.isArray(snapshot.tasks) ? snapshot.tasks.length : 0;
  const incomes = Array.isArray(snapshot.incomes) ? snapshot.incomes.length : 0;
  const students = Array.isArray(snapshot.students) ? snapshot.students.length : 0;
  const todos = Array.isArray(snapshot.todos) ? snapshot.todos.length : 0;
  return {
    tasks,
    incomes,
    students,
    todos,
    totalItems: tasks + incomes + students + todos,
  };
}

export function hasWorkspaceUserData(snapshot: WorkspaceSnapshot | null | undefined): boolean {
  if (!snapshot) return false;
  const counts = summarizeSnapshotCounts(snapshot);
  if (counts.totalItems > 0) return true;
  if (snapshot.dailyGoals && Object.keys(snapshot.dailyGoals).length > 0) return true;
  if (snapshot.monthlyIncomeTargets && Object.keys(snapshot.monthlyIncomeTargets).length > 0) return true;
  if (snapshot.dailyIncomeTargets && Object.keys(snapshot.dailyIncomeTargets).length > 0) return true;
  if (snapshot.completedTodoCountsByDate && Object.keys(snapshot.completedTodoCountsByDate).length > 0) {
    return true;
  }
  if (snapshot.avatarDataUrl && snapshot.avatarDataUrl.trim().length > 0) return true;
  if (snapshot.dailyNotes && snapshot.dailyNotes.length > 0) return true;
  if (snapshot.chatHistory && snapshot.chatHistory.length > 0) return true;
  if (
    snapshot.appearance &&
    (snapshot.appearance.themeMode === 'dark' ||
      (snapshot.appearance.backgroundColor &&
        snapshot.appearance.backgroundColor.toUpperCase() !== '#FFF4F8'))
  ) {
    return true;
  }
  return false;
}

function parseTimestampMs(iso: string | undefined): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

export interface ReconcileResult {
  snapshot: WorkspaceSnapshot;
  source: 'local' | 'remote';
  needsServerRestore: boolean;
}

/**
 * Bảo vệ dữ liệu đã nhập: KHÔNG bao giờ ghi đè snapshot cục bộ có dữ liệu
 * bằng một snapshot rỗng hoặc cũ hơn từ máy chủ sau khi restart/deploy.
 */
export function reconcileSnapshots(
  localSnapshot: WorkspaceSnapshot | null,
  remoteSnapshot: WorkspaceSnapshot | null,
): ReconcileResult {
  if (!localSnapshot && remoteSnapshot) {
    return {
      snapshot: remoteSnapshot,
      source: 'remote',
      needsServerRestore: false,
    };
  }
  if (localSnapshot && !remoteSnapshot) {
    return {
      snapshot: localSnapshot,
      source: 'local',
      needsServerRestore: hasWorkspaceUserData(localSnapshot),
    };
  }
  if (!localSnapshot && !remoteSnapshot) {
    throw new Error('Không có snapshot nào để đồng bộ.');
  }

  const local = localSnapshot!;
  const remote = remoteSnapshot!;
  const localHasData = hasWorkspaceUserData(local);
  const remoteHasData = hasWorkspaceUserData(remote);

  // Nếu máy chủ bị trống (ví dụ sau restart/xóa file DB) nhưng local vẫn còn dữ liệu đã nhập -> giữ local và khôi phục lên máy chủ
  if (localHasData && !remoteHasData) {
    return {
      snapshot: {
        ...local,
        revision: Math.max(local.revision || 1, (remote.revision || 1) + 1),
      },
      source: 'local',
      needsServerRestore: true,
    };
  }

  // Nếu local trống nhưng máy chủ có dữ liệu -> lấy từ máy chủ
  if (!localHasData && remoteHasData) {
    return {
      snapshot: remote,
      source: 'remote',
      needsServerRestore: false,
    };
  }

  // Nếu cả hai đều có dữ liệu -> ưu tiên bản có timestamp mới hơn hoặc revision cao hơn
  const localTime = parseTimestampMs(local.lastSavedAt);
  const remoteTime = parseTimestampMs(remote.lastSavedAt);
  const localRev = Number(local.revision || 0);
  const remoteRev = Number(remote.revision || 0);

  if (localTime > remoteTime || (localTime === remoteTime && localRev > remoteRev)) {
    return {
      snapshot: local,
      source: 'local',
      needsServerRestore: true,
    };
  }

  return {
    snapshot: remote,
    source: 'remote',
    needsServerRestore: false,
  };
}

export interface DriveBackupEnvelope {
  app: 'Plantea';
  schemaVersion: 1;
  exportedAt: string;
  snapshot: WorkspaceSnapshot;
}

export function buildDriveBackupEnvelope(
  snapshot: WorkspaceSnapshot,
  nowIso = new Date().toISOString(),
): DriveBackupEnvelope {
  return {
    app: 'Plantea',
    schemaVersion: 1,
    exportedAt: nowIso,
    snapshot,
  };
}

export function parseDriveBackupPayload(
  raw: unknown,
  targetWorkspaceId: string,
): WorkspaceSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const candidate =
    obj.app === 'Plantea' && obj.snapshot && typeof obj.snapshot === 'object'
      ? (obj.snapshot as Record<string, unknown>)
      : obj;

  if (!Array.isArray(candidate.tasks)) {
    return null;
  }

  return {
    workspaceId: targetWorkspaceId || (typeof candidate.workspaceId === 'string' ? candidate.workspaceId : ''),
    revision: Number.isFinite(Number(candidate.revision)) ? Math.max(1, Number(candidate.revision)) : 1,
    lastSavedAt: typeof candidate.lastSavedAt === 'string' ? candidate.lastSavedAt : new Date().toISOString(),
    lastEditedBy: typeof candidate.lastEditedBy === 'string' ? candidate.lastEditedBy : 'Google Drive',
    tasks: candidate.tasks as WorkspaceSnapshot['tasks'],
    incomes: Array.isArray(candidate.incomes) ? (candidate.incomes as WorkspaceSnapshot['incomes']) : [],
    students: Array.isArray(candidate.students) ? (candidate.students as WorkspaceSnapshot['students']) : [],
    todos: Array.isArray(candidate.todos) ? (candidate.todos as WorkspaceSnapshot['todos']) : [],
    dailyNotes: Array.isArray(candidate.dailyNotes)
      ? (candidate.dailyNotes as WorkspaceSnapshot['dailyNotes'])
      : [],
    dailyGoals:
      candidate.dailyGoals && typeof candidate.dailyGoals === 'object'
        ? (candidate.dailyGoals as Record<string, string>)
        : {},
    dismissedTodoCarryovers:
      candidate.dismissedTodoCarryovers && typeof candidate.dismissedTodoCarryovers === 'object'
        ? (candidate.dismissedTodoCarryovers as Record<string, string>)
        : {},
    completedTodoCountsByDate:
      candidate.completedTodoCountsByDate && typeof candidate.completedTodoCountsByDate === 'object'
        ? (candidate.completedTodoCountsByDate as Record<string, number>)
        : {},
    appearance:
      candidate.appearance && typeof candidate.appearance === 'object'
        ? (candidate.appearance as WorkspaceSnapshot['appearance'])
        : undefined,
    avatarDataUrl: typeof candidate.avatarDataUrl === 'string' ? candidate.avatarDataUrl : '',
    monthlyIncomeTargets:
      candidate.monthlyIncomeTargets && typeof candidate.monthlyIncomeTargets === 'object'
        ? (candidate.monthlyIncomeTargets as Record<string, number>)
        : {},
    dailyIncomeTargets:
      candidate.dailyIncomeTargets && typeof candidate.dailyIncomeTargets === 'object'
        ? (candidate.dailyIncomeTargets as Record<string, number>)
        : {},
    chatHistory: Array.isArray(candidate.chatHistory)
      ? (candidate.chatHistory as WorkspaceSnapshot['chatHistory'])
      : [],
  };
}
