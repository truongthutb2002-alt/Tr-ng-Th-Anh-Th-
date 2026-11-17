/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppearanceSettings,
  AuthSession,
  CalendarViewMode,
  CompletionStatus,
  DailyNoteInput,
  DriveSyncMetadata,
  IncomeEntry,
  IncomeInput,
  IncomeReceivedStatus,
  PlannerTask,
  StudentTuition,
  StudentTuitionInput,
  TaskInput,
  TodoInput,
  TuitionSessionInput,
  WorkspaceSnapshot,
} from './types/planner';
import {
  addDays,
  addMonths,
  DEFAULT_APP_BACKGROUND_COLOR,
  ensureNonConflictingTaskColors,
  getMonthKey,
  getWeekDates,
  normalizeHexColor,
  normalizeTaskIncomeName,
  parseDateKey,
  summarizeDailyIncome,
  summarizeIncome,
  summarizeMonthlyIncome,
  tasksToCsv,
  toDateKey,
} from './utils/schedule';
import { normalizeAvatarDataUrl } from './utils/avatar';
import {
  hasWorkspaceUserData,
  reconcileSnapshots,
  summarizeSnapshotCounts,
} from './utils/snapshotSync';
import {
  clearInMemoryDriveToken,
  getCachedDriveUserEmail,
  getDriveAccessToken,
  initDriveAuth,
  logoutGoogleDrive,
  signInWithGoogleForDrive,
} from './utils/firebaseAuth';
import {
  deletePlanteaMonthFromDrive,
  inspectPlanteaDriveState,
  PLANTEA_DRIVE_FILE_NAME,
  PLANTEA_DRIVE_FOLDER_NAME,
  writePlanteaDataToDrive,
} from './utils/googleDrive';
import {
  applyOfflineAppearance,
  applyOfflineAvatar,
  applyOfflineCarryoverDismiss,
  applyOfflineClearDayNotes,
  applyOfflineIncomeAdd,
  applyOfflineIncomeDelete,
  applyOfflineIncomeStatusUpdate,
  applyOfflineMonthlyTarget,
  applyOfflineNoteCreate,
  applyOfflineNoteDelete,
  applyOfflineNoteUpdate,
  applyOfflineSessionAdd,
  applyOfflineSessionDelete,
  applyOfflineSessionUpdate,
  applyOfflineStudentCreate,
  applyOfflineStudentDelete,
  applyOfflineStudentUpdate,
  applyOfflineTaskDelete,
  applyOfflineTaskPatch,
  applyOfflineTaskSave,
  applyOfflineTodoCreate,
  applyOfflineTodoDelete,
  applyOfflineTodoUpdate,
  clearMonthDataFromSnapshot,
  EMPTY_PENDING_SYNC_STATE,
  formatMonthKeyLabel,
  isNetworkFetchError,
  mergePendingSyncState,
  type PendingSyncState,
} from './utils/offlineWorkspace';
import { resolveTodosForDate, summarizeDayTodos } from './utils/todo';
import { getNotesForDate } from './utils/notes';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { TopBar } from './components/TopBar';
import { WorkspaceToolbar } from './components/WorkspaceToolbar';
import { MonthCalendar } from './components/MonthCalendar';
import { WeekCalendar } from './components/WeekCalendar';
import { DayScheduleTable } from './components/DayScheduleTable';
import { TodoListView } from './components/TodoListView';
import { TaskModal } from './components/TaskModal';
import { MiddleSummaryPanel } from './components/MiddleSummaryPanel';
import { IncomeCategoriesBox } from './components/IncomeCategoriesBox';
import { AccountAppearanceModal } from './components/AccountAppearanceModal';
import { DriveConfirmModal, type DriveConfirmPayload } from './components/DriveConfirmModal';
import { DailyNotesModal } from './components/DailyNotesModal';
import { LoginScreen } from './components/LoginScreen';
import { OfflineIndicator } from './components/OfflineIndicator';
import { TuitionManager, type TuitionJumpTarget } from './components/TuitionManager';

const AUTH_SESSION_KEY = 'plantea_auth_session';
const LEGACY_AUTH_SESSION_KEY = 'kittyplan_auth_session';
const OFFLINE_USERS_KEY = 'plantea_offline_users';

function getBackupKey(workspaceId: string): string {
  return `plantea_backup_${workspaceId}`;
}

function getDriveMetaKey(workspaceId: string): string {
  return `plantea_drive_meta_${workspaceId}`;
}

function getPendingSyncKey(workspaceId: string): string {
  return `plantea_pending_sync_${workspaceId}`;
}

function readPendingSyncState(workspaceId: string): PendingSyncState {
  if (!workspaceId) return EMPTY_PENDING_SYNC_STATE;
  try {
    const raw = localStorage.getItem(getPendingSyncKey(workspaceId));
    if (!raw) return EMPTY_PENDING_SYNC_STATE;
    const parsed = JSON.parse(raw) as Partial<PendingSyncState>;
    return {
      pendingServerSync: Boolean(parsed?.pendingServerSync),
      pendingDriveSync: Boolean(parsed?.pendingDriveSync),
      pendingDeleteMonths: Array.isArray(parsed?.pendingDeleteMonths)
        ? parsed.pendingDeleteMonths.filter((m): m is string => typeof m === 'string')
        : [],
      updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : '',
    };
  } catch {
    return EMPTY_PENDING_SYNC_STATE;
  }
}

function writePendingSyncState(workspaceId: string, state: PendingSyncState): void {
  if (!workspaceId) return;
  try {
    const isEmpty =
      !state.pendingServerSync &&
      !state.pendingDriveSync &&
      state.pendingDeleteMonths.length === 0;
    if (isEmpty) {
      localStorage.removeItem(getPendingSyncKey(workspaceId));
    } else {
      localStorage.setItem(getPendingSyncKey(workspaceId), JSON.stringify(state));
    }
  } catch {
    // ignore storage errors
  }
}

function countPendingItems(state: PendingSyncState): number {
  return (
    (state.pendingServerSync ? 1 : 0) +
    (state.pendingDriveSync ? 1 : 0) +
    state.pendingDeleteMonths.length
  );
}

function buildOfflineUserLookupKey(username: string, phone: string): string {
  return `${username.trim().toLowerCase()}::${phone.replace(/\s+/g, '')}`;
}

function rememberOfflineUserSession(session: AuthSession): void {
  if (!session.username || !session.phone) return;
  try {
    const raw = localStorage.getItem(OFFLINE_USERS_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, AuthSession>) : {};
    map[buildOfflineUserLookupKey(session.username, session.phone)] = session;
    localStorage.setItem(OFFLINE_USERS_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

function findOfflineUserSession(username: string, phone: string): AuthSession | null {
  try {
    const raw = localStorage.getItem(OFFLINE_USERS_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, AuthSession>;
    return map[buildOfflineUserLookupKey(username, phone)] || null;
  } catch {
    return null;
  }
}

function readDriveSyncMeta(workspaceId: string): DriveSyncMetadata | null {
  if (!workspaceId) return null;
  try {
    const raw = localStorage.getItem(getDriveMetaKey(workspaceId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DriveSyncMetadata>;
    if (parsed && typeof parsed.linkedEmail === 'string' && parsed.linkedEmail.trim()) {
      return {
        linkedEmail: parsed.linkedEmail.trim(),
        folderId: typeof parsed.folderId === 'string' ? parsed.folderId : '',
        folderName:
          typeof parsed.folderName === 'string' && parsed.folderName.trim()
            ? parsed.folderName.trim()
            : PLANTEA_DRIVE_FOLDER_NAME,
        fileId: typeof parsed.fileId === 'string' ? parsed.fileId : '',
        lastSyncedAt: typeof parsed.lastSyncedAt === 'string' ? parsed.lastSyncedAt : '',
        monthFolderCount:
          typeof parsed.monthFolderCount === 'number' ? parsed.monthFolderCount : undefined,
      };
    }
  } catch {
    // ignore corrupted metadata
  }
  return null;
}

function writeDriveSyncMeta(workspaceId: string, meta: DriveSyncMetadata | null): void {
  if (!workspaceId) return;
  try {
    if (meta) {
      localStorage.setItem(getDriveMetaKey(workspaceId), JSON.stringify(meta));
    } else {
      localStorage.removeItem(getDriveMetaKey(workspaceId));
    }
  } catch {
    // ignore storage errors
  }
}

function readAuthSession(): AuthSession | null {
  try {
    const raw =
      localStorage.getItem(AUTH_SESSION_KEY) ?? localStorage.getItem(LEGACY_AUTH_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    const hasPhone = typeof parsed?.phone === 'string' && parsed.phone.trim().length > 0;
    const isGoogleAuth =
      parsed?.authMethod === 'google' ||
      (typeof parsed?.email === 'string' && parsed.email.trim().length > 0);
    if (
      parsed &&
      typeof parsed.username === 'string' &&
      parsed.username.trim() &&
      typeof parsed.workspaceId === 'string' &&
      parsed.workspaceId.trim() &&
      parsed.workspaceId.trim() !== 'shared-kitty-planner' &&
      (hasPhone || isGoogleAuth)
    ) {
      return {
        username: parsed.username.trim(),
        phone: typeof parsed.phone === 'string' ? parsed.phone.trim() : '',
        email: typeof parsed.email === 'string' && parsed.email.trim() ? parsed.email.trim() : undefined,
        workspaceId: parsed.workspaceId.trim(),
        authMethod: parsed.authMethod === 'google' ? 'google' : 'account',
      };
    }
  } catch {
    // ignore invalid stored session
  }
  return null;
}

function writeAuthSession(session: AuthSession | null): void {
  try {
    if (session) {
      localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(AUTH_SESSION_KEY);
      localStorage.removeItem(LEGACY_AUTH_SESSION_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

function readLocalBackup(workspaceId: string): WorkspaceSnapshot | null {
  try {
    const raw =
      localStorage.getItem(getBackupKey(workspaceId)) ??
      localStorage.getItem(`kittyplan_backup_${workspaceId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkspaceSnapshot;
    if (parsed && Array.isArray(parsed.tasks)) {
      return {
        ...parsed,
        incomes: Array.isArray(parsed.incomes) ? parsed.incomes : [],
        students: Array.isArray(parsed.students) ? parsed.students : [],
        todos: Array.isArray(parsed.todos) ? parsed.todos : [],
        dailyNotes: Array.isArray(parsed.dailyNotes) ? parsed.dailyNotes : [],
        dailyGoals: parsed.dailyGoals && typeof parsed.dailyGoals === 'object' ? parsed.dailyGoals : {},
        dismissedTodoCarryovers:
          parsed.dismissedTodoCarryovers && typeof parsed.dismissedTodoCarryovers === 'object'
            ? parsed.dismissedTodoCarryovers
            : {},
        completedTodoCountsByDate:
          parsed.completedTodoCountsByDate &&
          typeof parsed.completedTodoCountsByDate === 'object'
            ? parsed.completedTodoCountsByDate
            : {},
        appearance: {
          themeMode: parsed.appearance?.themeMode === 'dark' ? 'dark' : 'light',
          backgroundColor:
            normalizeHexColor(parsed.appearance?.backgroundColor) ||
            DEFAULT_APP_BACKGROUND_COLOR,
        },
        avatarDataUrl: normalizeAvatarDataUrl(parsed.avatarDataUrl),
        monthlyIncomeTargets:
          parsed.monthlyIncomeTargets && typeof parsed.monthlyIncomeTargets === 'object'
            ? parsed.monthlyIncomeTargets
            : {},
        dailyIncomeTargets:
          parsed.dailyIncomeTargets && typeof parsed.dailyIncomeTargets === 'object'
            ? parsed.dailyIncomeTargets
            : {},
        chatHistory: Array.isArray(parsed.chatHistory) ? parsed.chatHistory : [],
      };
    }
  } catch {
    // ignore corrupted local cache
  }
  return null;
}

function writeLocalBackup(workspaceId: string, snapshot: WorkspaceSnapshot): void {
  try {
    localStorage.setItem(getBackupKey(workspaceId), JSON.stringify(snapshot));
  } catch {
    // ignore storage quota issues
  }
}

function createEmptySnapshot(workspaceId: string): WorkspaceSnapshot {
  return {
    workspaceId,
    revision: 0,
    lastSavedAt: '',
    lastEditedBy: 'Đang tải...',
    tasks: [],
    incomes: [],
    students: [],
    todos: [],
    dailyNotes: [],
    dailyGoals: {},
    dismissedTodoCarryovers: {},
    completedTodoCountsByDate: {},
    appearance: {
      themeMode: 'light',
      backgroundColor: DEFAULT_APP_BACKGROUND_COLOR,
    },
    avatarDataUrl: '',
    monthlyIncomeTargets: {},
    dailyIncomeTargets: {},
    chatHistory: [],
  };
}

export default function App() {
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => readAuthSession());
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [incomeSubView, setIncomeSubView] = useState<'stats' | 'tuition'>('stats');
  const [selectedDate, setSelectedDate] = useState<string>(() => toDateKey(new Date()));

  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot>(() => {
    const existingSession = readAuthSession();
    if (existingSession) {
      return (
        readLocalBackup(existingSession.workspaceId) ||
        createEmptySnapshot(existingSession.workspaceId)
      );
    }
    return createEmptySnapshot('');
  });

  const [isLoading, setIsLoading] = useState<boolean>(() => Boolean(readAuthSession()));
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [errorBanner, setErrorBanner] = useState<string>('');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isAddTodoModalOpen, setIsAddTodoModalOpen] = useState<boolean>(false);
  const [isNotesModalOpen, setIsNotesModalOpen] = useState<boolean>(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState<boolean>(false);
  const [editingTask, setEditingTask] = useState<PlannerTask | null>(null);
  const [modalDefaultDate, setModalDefaultDate] = useState<string>(() => toDateKey(new Date()));
  const [modalDefaultStart, setModalDefaultStart] = useState<string>('06:00');
  const [modalDefaultEnd, setModalDefaultEnd] = useState<string | undefined>(undefined);
  const [isSavingTask, setIsSavingTask] = useState<boolean>(false);
  const [tuitionJumpTarget, setTuitionJumpTarget] = useState<TuitionJumpTarget | null>(null);

  // Google Drive state (accessToken stays ONLY in memory inside firebaseAuth.ts)
  const [hasDriveToken, setHasDriveToken] = useState<boolean>(false);
  const [driveSyncMeta, setDriveSyncMeta] = useState<DriveSyncMetadata | null>(() => {
    const existingSession = readAuthSession();
    return existingSession ? readDriveSyncMeta(existingSession.workspaceId) : null;
  });
  const [isDriveBusy, setIsDriveBusy] = useState<boolean>(false);
  const [driveStatusMessage, setDriveStatusMessage] = useState<string>('');
  const [driveError, setDriveError] = useState<string>('');
  const [pendingDriveConfirm, setPendingDriveConfirm] = useState<DriveConfirmPayload | null>(null);
  const pendingDriveContextRef = useRef<{
    folderId: string;
    fileId: string;
    remoteSnapshot: WorkspaceSnapshot | null;
  }>({
    folderId: '',
    fileId: '',
    remoteSnapshot: null,
  });

  const appearanceSaveTimerRef = useRef<number | null>(null);
  const appearanceSeqRef = useRef<number>(0);

  const isOnline = useOnlineStatus();
  const [isSyncingOffline, setIsSyncingOffline] = useState<boolean>(false);
  const [pendingSyncState, setPendingSyncState] = useState<PendingSyncState>(() => {
    const existingSession = readAuthSession();
    return existingSession
      ? readPendingSyncState(existingSession.workspaceId)
      : EMPTY_PENDING_SYNC_STATE;
  });
  const [autoSyncNotice, setAutoSyncNotice] = useState<string>('');
  const syncInFlightRef = useRef<boolean>(false);
  const snapshotRef = useRef<WorkspaceSnapshot>(snapshot);
  snapshotRef.current = snapshot;

  const activeWorkspaceId = authSession?.workspaceId || '';
  const currentAccount = authSession?.username || 'Người dùng';
  const linkedEmail = authSession?.email || driveSyncMeta?.linkedEmail || '';

  const currentAppearance: AppearanceSettings = useMemo(
    () => ({
      themeMode: snapshot.appearance?.themeMode === 'dark' ? 'dark' : 'light',
      backgroundColor:
        normalizeHexColor(snapshot.appearance?.backgroundColor) ||
        DEFAULT_APP_BACKGROUND_COLOR,
    }),
    [snapshot.appearance],
  );

  // Sync themeMode (light/dark) and backgroundColor CSS variables onto document
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!authSession) {
      document.documentElement.classList.remove('plantea-dark');
      document.body.classList.remove('plantea-dark');
      document.documentElement.style.setProperty('--plantea-bg', DEFAULT_APP_BACKGROUND_COLOR);
      return;
    }
    document.documentElement.style.setProperty('--plantea-bg', currentAppearance.backgroundColor);
    const isDark = currentAppearance.themeMode === 'dark';
    document.documentElement.classList.toggle('plantea-dark', isDark);
    document.body.classList.toggle('plantea-dark', isDark);
  }, [authSession, currentAppearance]);

  useEffect(() => {
    const unsubscribe = initDriveAuth(
      () => {
        setHasDriveToken(true);
      },
      () => {
        setHasDriveToken(false);
      },
    );
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!activeWorkspaceId) {
      setDriveSyncMeta(null);
      return;
    }
    setDriveSyncMeta(readDriveSyncMeta(activeWorkspaceId));
  }, [activeWorkspaceId]);

  useEffect(() => {
    return () => {
      if (appearanceSaveTimerRef.current !== null) {
        window.clearTimeout(appearanceSaveTimerRef.current);
      }
    };
  }, []);

  const applyServerSnapshot = useCallback((next: WorkspaceSnapshot) => {
    const normalized: WorkspaceSnapshot = {
      ...next,
      tasks: ensureNonConflictingTaskColors(Array.isArray(next.tasks) ? next.tasks : []),
      incomes: Array.isArray(next.incomes) ? next.incomes : [],
      students: Array.isArray(next.students) ? next.students : [],
      todos: Array.isArray(next.todos) ? next.todos : [],
      dailyNotes: Array.isArray(next.dailyNotes) ? next.dailyNotes : [],
      dailyGoals: next.dailyGoals && typeof next.dailyGoals === 'object' ? next.dailyGoals : {},
      dismissedTodoCarryovers:
        next.dismissedTodoCarryovers && typeof next.dismissedTodoCarryovers === 'object'
          ? next.dismissedTodoCarryovers
          : {},
      completedTodoCountsByDate:
        next.completedTodoCountsByDate && typeof next.completedTodoCountsByDate === 'object'
          ? next.completedTodoCountsByDate
          : {},
      appearance: {
        themeMode: next.appearance?.themeMode === 'dark' ? 'dark' : 'light',
        backgroundColor:
          normalizeHexColor(next.appearance?.backgroundColor) ||
          DEFAULT_APP_BACKGROUND_COLOR,
      },
      avatarDataUrl: normalizeAvatarDataUrl(next.avatarDataUrl),
      monthlyIncomeTargets:
        next.monthlyIncomeTargets && typeof next.monthlyIncomeTargets === 'object'
          ? next.monthlyIncomeTargets
          : {},
      dailyIncomeTargets:
        next.dailyIncomeTargets && typeof next.dailyIncomeTargets === 'object'
          ? next.dailyIncomeTargets
          : {},
      chatHistory: Array.isArray(next.chatHistory) ? next.chatHistory : [],
    };
    snapshotRef.current = normalized;
    setSnapshot(normalized);
    writeLocalBackup(normalized.workspaceId, normalized);
  }, []);

  const persistPendingSync = useCallback((workspaceId: string, nextState: PendingSyncState) => {
    writePendingSyncState(workspaceId, nextState);
    setPendingSyncState(nextState);
  }, []);

  const commitOfflineMutation = useCallback(
    (
      mutator: (prev: WorkspaceSnapshot) => WorkspaceSnapshot,
      options?: { deletedMonthKey?: string },
    ): WorkspaceSnapshot => {
      const updated = mutator(snapshotRef.current);
      applyServerSnapshot(updated);
      if (updated.workspaceId) {
        const currentPending = readPendingSyncState(updated.workspaceId);
        const nextPending = mergePendingSyncState(currentPending, {
          pendingServerSync: true,
          pendingDriveSync: true,
          addDeleteMonth: options?.deletedMonthKey,
        });
        persistPendingSync(updated.workspaceId, nextPending);
      }
      setSaveStatus('saved');
      setErrorBanner('');
      return updated;
    },
    [applyServerSnapshot, persistPendingSync],
  );

  const persistDriveMeta = useCallback(
    (workspaceId: string, nextMeta: DriveSyncMetadata | null) => {
      writeDriveSyncMeta(workspaceId, nextMeta);
      setDriveSyncMeta(nextMeta);
    },
    [],
  );

  const restoreSnapshotOnServer = useCallback(
    async (workspaceId: string, actor: string, targetSnapshot: WorkspaceSnapshot) => {
      const res = await fetch('/api/workspace/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          actor,
          snapshot: targetSnapshot,
        }),
      });
      const data = (await res.json()) as { error?: string; snapshot?: WorkspaceSnapshot };
      if (!res.ok || !data.snapshot) {
        throw new Error(data.error || 'Không thể khôi phục dữ liệu lên máy chủ.');
      }
      return data.snapshot;
    },
    [],
  );

  const handleLogin = useCallback(
    async (username: string, phone: string, email: string) => {
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, phone, email }),
        });
        const data = (await res.json()) as {
          error?: string;
          user?: { username: string; phone: string; email?: string };
          workspaceId?: string;
          snapshot?: WorkspaceSnapshot;
        };
        if (!res.ok || !data.user || !data.workspaceId || !data.snapshot) {
          throw new Error(data.error || 'Không thể đăng nhập lúc này.');
        }

        const resolvedEmail = data.user.email || email.trim() || undefined;
        const nextSession: AuthSession = {
          username: data.user.username,
          phone: data.user.phone,
          email: resolvedEmail,
          workspaceId: data.workspaceId,
          authMethod: 'account',
        };
        writeAuthSession(nextSession);
        rememberOfflineUserSession(nextSession);
        setAuthSession(nextSession);

        const cached = readLocalBackup(data.workspaceId);
        const pending = readPendingSyncState(data.workspaceId);
        setPendingSyncState(pending);
        const reconciled =
          pending.pendingServerSync && cached
            ? { snapshot: cached, source: 'local' as const, needsServerRestore: true }
            : reconcileSnapshots(cached, data.snapshot);

        if (reconciled.needsServerRestore) {
          applyServerSnapshot(reconciled.snapshot);
          try {
            const restored = await restoreSnapshotOnServer(
              data.workspaceId,
              data.user.username,
              reconciled.snapshot,
            );
            applyServerSnapshot(restored);
            persistPendingSync(
              data.workspaceId,
              mergePendingSyncState(pending, { pendingServerSync: false }),
            );
          } catch {
            // keep preserved local snapshot even if server restore fails transiently
          }
        } else {
          applyServerSnapshot(reconciled.snapshot);
        }

        if (resolvedEmail) {
          const existingMeta = readDriveSyncMeta(data.workspaceId);
          persistDriveMeta(data.workspaceId, {
            linkedEmail: resolvedEmail,
            folderId: existingMeta?.folderId || '',
            folderName: existingMeta?.folderName || PLANTEA_DRIVE_FOLDER_NAME,
            fileId: existingMeta?.fileId || '',
            lastSyncedAt: existingMeta?.lastSyncedAt || '',
          });
        }

        setIsLoading(false);
        setSaveStatus('saved');
        setErrorBanner('');
        setDriveError('');
        setDriveStatusMessage('');
      } catch (err) {
        if (isNetworkFetchError(err)) {
          const offlineSession = findOfflineUserSession(username, phone);
          if (offlineSession) {
            const finalSession: AuthSession = email.trim()
              ? { ...offlineSession, email: email.trim() }
              : offlineSession;
            writeAuthSession(finalSession);
            setAuthSession(finalSession);
            const cached = readLocalBackup(finalSession.workspaceId);
            if (cached) {
              applyServerSnapshot(cached);
            } else {
              applyServerSnapshot(createEmptySnapshot(finalSession.workspaceId));
            }
            setPendingSyncState(readPendingSyncState(finalSession.workspaceId));
            setIsLoading(false);
            setSaveStatus('saved');
            setErrorBanner('');
            return;
          }
          throw new Error(
            'Đang ngoại tuyến. Bạn chỉ có thể đăng nhập bằng tài khoản đã từng mở trên thiết bị này khi chưa có mạng.',
          );
        }
        throw err;
      }
    },
    [applyServerSnapshot, persistDriveMeta, persistPendingSync, restoreSnapshotOnServer],
  );

  const handleRegister = useCallback(
    async (username: string, phone: string, confirmPhone: string, email: string) => {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, phone, confirmPhone, email }),
      });
      const data = (await res.json()) as {
        error?: string;
        user?: { username: string; phone: string; email?: string };
        workspaceId?: string;
        snapshot?: WorkspaceSnapshot;
      };
      if (!res.ok || !data.user || !data.workspaceId || !data.snapshot) {
        throw new Error(data.error || 'Không thể tạo tài khoản lúc này.');
      }

      const resolvedEmail = data.user.email || email.trim() || undefined;
      const nextSession: AuthSession = {
        username: data.user.username,
        phone: data.user.phone,
        email: resolvedEmail,
        workspaceId: data.workspaceId,
        authMethod: 'account',
      };
      writeAuthSession(nextSession);
      rememberOfflineUserSession(nextSession);
      setAuthSession(nextSession);
      applyServerSnapshot(data.snapshot);
      persistPendingSync(data.workspaceId, EMPTY_PENDING_SYNC_STATE);

      if (resolvedEmail) {
        persistDriveMeta(data.workspaceId, {
          linkedEmail: resolvedEmail,
          folderId: '',
          folderName: PLANTEA_DRIVE_FOLDER_NAME,
          fileId: '',
          lastSyncedAt: '',
        });
      }

      setIsLoading(false);
      setSaveStatus('saved');
      setErrorBanner('');
      setDriveError('');
      setDriveStatusMessage('');
    },
    [applyServerSnapshot, persistDriveMeta, persistPendingSync],
  );

  const handleGoogleDriveLogin = useCallback(
    async (params: { email: string; username: string; phone: string }) => {
      const authResult = await signInWithGoogleForDrive(params.email || undefined);
      setHasDriveToken(true);

      const useExistingAccount = Boolean(params.username.trim() && params.phone.trim());
      const endpoint = useExistingAccount ? '/api/auth/login' : '/api/auth/google';
      const payload = useExistingAccount
        ? {
            username: params.username.trim(),
            phone: params.phone.trim(),
            email: authResult.email,
          }
        : {
            email: authResult.email,
            displayName: params.username.trim() || authResult.user.displayName || '',
          };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        error?: string;
        user?: { username: string; phone: string; email?: string };
        workspaceId?: string;
        snapshot?: WorkspaceSnapshot;
      };
      if (!res.ok || !data.user || !data.workspaceId || !data.snapshot) {
        throw new Error(data.error || 'Không thể liên kết tài khoản Plantea với Google Drive.');
      }

      const nextSession: AuthSession = {
        username: data.user.username,
        phone: data.user.phone || '',
        email: authResult.email || data.user.email,
        workspaceId: data.workspaceId,
        authMethod: useExistingAccount ? 'account' : 'google',
      };
      writeAuthSession(nextSession);
      setAuthSession(nextSession);

      const cached = readLocalBackup(data.workspaceId);
      const reconciled = reconcileSnapshots(cached, data.snapshot);
      let activeSnapshot = reconciled.snapshot;
      if (reconciled.needsServerRestore) {
        applyServerSnapshot(activeSnapshot);
        try {
          activeSnapshot = await restoreSnapshotOnServer(
            data.workspaceId,
            nextSession.username,
            activeSnapshot,
          );
        } catch {
          // keep local snapshot
        }
      }
      applyServerSnapshot(activeSnapshot);

      setIsLoading(false);
      setSaveStatus('saved');
      setErrorBanner('');
      setDriveError('');

      // Sau khi người dùng đã cấp phép -> tự động tìm hoặc tạo thư mục "Plantea" trên Google Drive
      const driveState = await inspectPlanteaDriveState(authResult.accessToken, data.workspaceId);
      const existingMeta = readDriveSyncMeta(data.workspaceId);
      persistDriveMeta(data.workspaceId, {
        linkedEmail: authResult.email,
        folderId: driveState.folderId,
        folderName: PLANTEA_DRIVE_FOLDER_NAME,
        fileId: driveState.fileId,
        lastSyncedAt: driveState.remoteModifiedTime || existingMeta?.lastSyncedAt || '',
        monthFolderCount: driveState.monthFolderCount,
      });

      const localHasData = hasWorkspaceUserData(activeSnapshot);
      const remoteHasData = hasWorkspaceUserData(driveState.remoteSnapshot);

      if (driveState.remoteSnapshot && remoteHasData && !localHasData) {
        const restored = await restoreSnapshotOnServer(
          data.workspaceId,
          nextSession.username,
          driveState.remoteSnapshot,
        );
        applyServerSnapshot(restored);
        setDriveStatusMessage(
          'Đã cấp phép Google Drive, kết nối thư mục "Plantea" và khôi phục dữ liệu của bạn.',
        );
        return;
      }

      if (driveState.remoteSnapshot && remoteHasData && localHasData) {
        pendingDriveContextRef.current = {
          folderId: driveState.folderId,
          fileId: driveState.fileId,
          remoteSnapshot: driveState.remoteSnapshot,
        };
        setPendingDriveConfirm({
          mode: 'restore_from_drive',
          linkedEmail: authResult.email,
          folderName: PLANTEA_DRIVE_FOLDER_NAME,
          fileName: PLANTEA_DRIVE_FILE_NAME,
          fileAlreadyExists: true,
          localSummary: summarizeSnapshotCounts(activeSnapshot),
          remoteSummary: summarizeSnapshotCounts(driveState.remoteSnapshot),
          remoteModifiedTime: driveState.remoteModifiedTime,
        });
        setIsAccountModalOpen(true);
        return;
      }

      if (!driveState.fileId && localHasData) {
        pendingDriveContextRef.current = {
          folderId: driveState.folderId,
          fileId: '',
          remoteSnapshot: null,
        };
        setPendingDriveConfirm({
          mode: 'save_to_drive',
          linkedEmail: authResult.email,
          folderName: PLANTEA_DRIVE_FOLDER_NAME,
          fileName: PLANTEA_DRIVE_FILE_NAME,
          fileAlreadyExists: false,
          localSummary: summarizeSnapshotCounts(activeSnapshot),
          remoteSummary: null,
        });
        setIsAccountModalOpen(true);
        setDriveStatusMessage(
          driveState.folderCreated
            ? 'Đã tạo thư mục "Plantea" trên Google Drive. Vui lòng xác nhận để lưu dữ liệu hiện tại.'
            : 'Đã kết nối thư mục "Plantea" trên Google Drive. Vui lòng xác nhận để lưu dữ liệu.',
        );
        return;
      }

      setDriveStatusMessage(
        driveState.folderCreated
          ? 'Đã cấp phép Google Drive và tạo thành công thư mục "Plantea".'
          : 'Đã cấp phép Google Drive và kết nối thư mục "Plantea".',
      );
    },
    [applyServerSnapshot, persistDriveMeta, restoreSnapshotOnServer],
  );

  const handleLogout = useCallback(() => {
    if (appearanceSaveTimerRef.current !== null) {
      window.clearTimeout(appearanceSaveTimerRef.current);
      appearanceSaveTimerRef.current = null;
    }
    const wasGoogleAuth = authSession?.authMethod === 'google';
    clearInMemoryDriveToken();
    setHasDriveToken(false);
    if (wasGoogleAuth) {
      logoutGoogleDrive().catch(() => {});
    }
    writeAuthSession(null);
    setAuthSession(null);
    setDriveSyncMeta(null);
    setDriveStatusMessage('');
    setDriveError('');
    setPendingDriveConfirm(null);
    setSnapshot(createEmptySnapshot(''));
    setIsLoading(false);
    setIsModalOpen(false);
    setIsNotesModalOpen(false);
    setIsAccountModalOpen(false);
    setEditingTask(null);
    setErrorBanner('');
  }, [authSession?.authMethod]);

  const handleUpdateLinkedEmail = useCallback(
    (nextEmail: string) => {
      const trimmed = nextEmail.trim();
      if (!authSession || !trimmed) return;
      const updatedSession: AuthSession = {
        ...authSession,
        email: trimmed,
      };
      writeAuthSession(updatedSession);
      setAuthSession(updatedSession);
      persistDriveMeta(authSession.workspaceId, {
        linkedEmail: trimmed,
        folderId: driveSyncMeta?.folderId || '',
        folderName: driveSyncMeta?.folderName || PLANTEA_DRIVE_FOLDER_NAME,
        fileId: driveSyncMeta?.fileId || '',
        lastSyncedAt: driveSyncMeta?.lastSyncedAt || '',
        monthFolderCount: driveSyncMeta?.monthFolderCount,
      });
    },
    [authSession, driveSyncMeta, persistDriveMeta],
  );

  const handleUpdateProfile = useCallback(
    async (params: { newUsername: string; newPhone: string; newEmail: string }) => {
      if (!authSession) return;
      setSaveStatus('saving');
      try {
        const res = await fetch('/api/auth/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId: authSession.workspaceId,
            newUsername: params.newUsername.trim(),
            newPhone: params.newPhone.trim(),
            newEmail: params.newEmail.trim(),
          }),
        });
        const data = (await res.json()) as {
          error?: string;
          user?: { username: string; phone: string; email?: string };
          workspaceId?: string;
          snapshot?: WorkspaceSnapshot;
        };
        if (!res.ok || !data.user || !data.snapshot) {
          throw new Error(data.error || 'Không thể cập nhật thông tin tài khoản.');
        }

        const resolvedEmail = data.user.email || params.newEmail.trim() || undefined;
        const updatedSession: AuthSession = {
          ...authSession,
          username: data.user.username,
          phone: data.user.phone || '',
          email: resolvedEmail,
        };
        writeAuthSession(updatedSession);
        setAuthSession(updatedSession);
        applyServerSnapshot(data.snapshot);

        if (resolvedEmail) {
          const existingMeta = readDriveSyncMeta(authSession.workspaceId);
          persistDriveMeta(authSession.workspaceId, {
            linkedEmail: resolvedEmail,
            folderId: existingMeta?.folderId || '',
            folderName: existingMeta?.folderName || PLANTEA_DRIVE_FOLDER_NAME,
            fileId: existingMeta?.fileId || '',
            lastSyncedAt: existingMeta?.lastSyncedAt || '',
            monthFolderCount: existingMeta?.monthFolderCount,
          });
        }
        setSaveStatus('saved');
      } catch (err) {
        setSaveStatus('error');
        throw err;
      }
    },
    [authSession, applyServerSnapshot, persistDriveMeta],
  );

  const handleAuthorizeDriveInApp = useCallback(
    async (emailHint?: string) => {
      if (!authSession) return;
      setIsDriveBusy(true);
      setDriveError('');
      setDriveStatusMessage('');
      try {
        const result = await signInWithGoogleForDrive(emailHint || authSession.email);
        setHasDriveToken(true);

        const updatedSession: AuthSession = {
          ...authSession,
          email: result.email || authSession.email,
        };
        writeAuthSession(updatedSession);
        setAuthSession(updatedSession);

        const driveState = await inspectPlanteaDriveState(
          result.accessToken,
          authSession.workspaceId,
        );
        const currentMeta = readDriveSyncMeta(authSession.workspaceId);
        persistDriveMeta(authSession.workspaceId, {
          linkedEmail: result.email,
          folderId: driveState.folderId,
          folderName: PLANTEA_DRIVE_FOLDER_NAME,
          fileId: driveState.fileId,
          lastSyncedAt: driveState.remoteModifiedTime || currentMeta?.lastSyncedAt || '',
          monthFolderCount: driveState.monthFolderCount,
        });

        const currentPending = readPendingSyncState(authSession.workspaceId);
        const hasPendingOfflineUpload =
          currentPending.pendingServerSync ||
          currentPending.pendingDriveSync ||
          currentPending.pendingDeleteMonths.length > 0;
        if (hasPendingOfflineUpload) {
          setDriveStatusMessage(
            'Đã cấp phép Google Drive — đang tự động sao lưu các thay đổi ngoại tuyến...',
          );
          return;
        }

        const localHasData = hasWorkspaceUserData(snapshot);
        const remoteHasData = hasWorkspaceUserData(driveState.remoteSnapshot);

        if (driveState.remoteSnapshot && remoteHasData && !localHasData) {
          const restored = await restoreSnapshotOnServer(
            authSession.workspaceId,
            authSession.username,
            driveState.remoteSnapshot,
          );
          applyServerSnapshot(restored);
          setDriveStatusMessage(
            'Đã cấp phép Google Drive, kết nối thư mục "Plantea" và khôi phục dữ liệu của bạn.',
          );
          return;
        }

        if (driveState.remoteSnapshot && remoteHasData && localHasData) {
          pendingDriveContextRef.current = {
            folderId: driveState.folderId,
            fileId: driveState.fileId,
            remoteSnapshot: driveState.remoteSnapshot,
          };
          setPendingDriveConfirm({
            mode: 'restore_from_drive',
            linkedEmail: result.email,
            folderName: PLANTEA_DRIVE_FOLDER_NAME,
            fileName: PLANTEA_DRIVE_FILE_NAME,
            fileAlreadyExists: true,
            localSummary: summarizeSnapshotCounts(snapshot),
            remoteSummary: summarizeSnapshotCounts(driveState.remoteSnapshot),
            remoteModifiedTime: driveState.remoteModifiedTime,
          });
          setDriveStatusMessage(
            driveState.folderCreated
              ? 'Đã tạo thư mục "Plantea" trên Google Drive.'
              : 'Đã kết nối thư mục "Plantea" trên Google Drive.',
          );
          return;
        }

        setDriveStatusMessage(
          driveState.folderCreated
            ? 'Đã cấp phép Google Drive và tạo thư mục "Plantea" thành công.'
            : 'Đã cấp phép Google Drive và kết nối thư mục "Plantea".',
        );
      } catch (err) {
        setDriveError(
          err instanceof Error ? err.message : 'Không thể cấp phép Google Drive lúc này.',
        );
      } finally {
        setIsDriveBusy(false);
      }
    },
    [authSession, snapshot, applyServerSnapshot, persistDriveMeta, restoreSnapshotOnServer],
  );

  const handleRequestSaveToDrive = useCallback(async () => {
    if (!authSession) return;
    setIsDriveBusy(true);
    setDriveError('');
    setDriveStatusMessage('');
    try {
      const token = await getDriveAccessToken();
      if (!token) {
        setHasDriveToken(false);
        setDriveError(
          'Phiên cấp phép Google Drive chưa hoạt động. Vui lòng nhấn nút Sign in with Google để cấp phép.',
        );
        return;
      }
      const state = await inspectPlanteaDriveState(token, authSession.workspaceId);
      const targetEmail =
        getCachedDriveUserEmail() || driveSyncMeta?.linkedEmail || authSession.email || 'Google Drive';

      pendingDriveContextRef.current = {
        folderId: state.folderId,
        fileId: state.fileId,
        remoteSnapshot: state.remoteSnapshot,
      };
      persistDriveMeta(authSession.workspaceId, {
        linkedEmail: targetEmail,
        folderId: state.folderId,
        folderName: PLANTEA_DRIVE_FOLDER_NAME,
        fileId: state.fileId,
        lastSyncedAt: state.remoteModifiedTime || driveSyncMeta?.lastSyncedAt || '',
        monthFolderCount: state.monthFolderCount,
      });

      setPendingDriveConfirm({
        mode: 'save_to_drive',
        linkedEmail: targetEmail,
        folderName: PLANTEA_DRIVE_FOLDER_NAME,
        fileName: PLANTEA_DRIVE_FILE_NAME,
        fileAlreadyExists: Boolean(state.fileId),
        localSummary: summarizeSnapshotCounts(snapshot),
        remoteSummary: state.remoteSnapshot
          ? summarizeSnapshotCounts(state.remoteSnapshot)
          : null,
        remoteModifiedTime: state.remoteModifiedTime,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể kiểm tra thư mục Plantea trên Google Drive.';
      if (msg.includes('hết hạn')) {
        clearInMemoryDriveToken();
        setHasDriveToken(false);
      }
      setDriveError(msg);
    } finally {
      setIsDriveBusy(false);
    }
  }, [authSession, driveSyncMeta, snapshot, persistDriveMeta]);

  const handleRequestLoadFromDrive = useCallback(async () => {
    if (!authSession) return;
    setIsDriveBusy(true);
    setDriveError('');
    setDriveStatusMessage('');
    try {
      const token = await getDriveAccessToken();
      if (!token) {
        setHasDriveToken(false);
        setDriveError(
          'Phiên cấp phép Google Drive chưa hoạt động. Vui lòng nhấn nút Sign in with Google để cấp phép.',
        );
        return;
      }
      const state = await inspectPlanteaDriveState(token, authSession.workspaceId);
      const targetEmail =
        getCachedDriveUserEmail() || driveSyncMeta?.linkedEmail || authSession.email || 'Google Drive';

      persistDriveMeta(authSession.workspaceId, {
        linkedEmail: targetEmail,
        folderId: state.folderId,
        folderName: PLANTEA_DRIVE_FOLDER_NAME,
        fileId: state.fileId,
        lastSyncedAt: state.remoteModifiedTime || driveSyncMeta?.lastSyncedAt || '',
        monthFolderCount: state.monthFolderCount,
      });

      if (!state.remoteSnapshot) {
        setDriveStatusMessage(
          'Chưa có tệp sao lưu nào trong thư mục "Plantea" trên Google Drive của bạn.',
        );
        return;
      }

      pendingDriveContextRef.current = {
        folderId: state.folderId,
        fileId: state.fileId,
        remoteSnapshot: state.remoteSnapshot,
      };
      setPendingDriveConfirm({
        mode: 'restore_from_drive',
        linkedEmail: targetEmail,
        folderName: PLANTEA_DRIVE_FOLDER_NAME,
        fileName: PLANTEA_DRIVE_FILE_NAME,
        fileAlreadyExists: true,
        localSummary: summarizeSnapshotCounts(snapshot),
        remoteSummary: summarizeSnapshotCounts(state.remoteSnapshot),
        remoteModifiedTime: state.remoteModifiedTime,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể đọc dữ liệu từ Google Drive.';
      if (msg.includes('hết hạn')) {
        clearInMemoryDriveToken();
        setHasDriveToken(false);
      }
      setDriveError(msg);
    } finally {
      setIsDriveBusy(false);
    }
  }, [authSession, driveSyncMeta, snapshot, persistDriveMeta]);

  const handleConfirmDriveAction = useCallback(async () => {
    if (!authSession || !pendingDriveConfirm) return;
    setIsDriveBusy(true);
    setDriveError('');
    try {
      if (pendingDriveConfirm.mode === 'save_to_drive') {
        const token = await getDriveAccessToken();
        if (!token) {
          clearInMemoryDriveToken();
          setHasDriveToken(false);
          setPendingDriveConfirm(null);
          setDriveError(
            'Phiên cấp phép Google Drive đã hết hạn. Vui lòng nhấn nút Sign in with Google để cấp phép lại.',
          );
          return;
        }
        const savedMeta = await writePlanteaDataToDrive({
          accessToken: token,
          snapshot,
          linkedEmail: pendingDriveConfirm.linkedEmail,
          existingFolderId: pendingDriveContextRef.current.folderId,
          existingFileId: pendingDriveContextRef.current.fileId,
        });
        persistDriveMeta(authSession.workspaceId, savedMeta);
        setPendingDriveConfirm(null);
        setDriveStatusMessage(
          'Đã lưu toàn bộ dữ liệu vào thư mục "Plantea" trên Google Drive thành công.',
        );
      } else {
        const remoteSnap = pendingDriveContextRef.current.remoteSnapshot;
        if (!remoteSnap) {
          setPendingDriveConfirm(null);
          return;
        }
        const restored = await restoreSnapshotOnServer(
          authSession.workspaceId,
          authSession.username,
          remoteSnap,
        );
        applyServerSnapshot(restored);
        const existingMeta = readDriveSyncMeta(authSession.workspaceId);
        persistDriveMeta(authSession.workspaceId, {
          linkedEmail: pendingDriveConfirm.linkedEmail,
          folderId: pendingDriveContextRef.current.folderId || existingMeta?.folderId || '',
          folderName: PLANTEA_DRIVE_FOLDER_NAME,
          fileId: pendingDriveContextRef.current.fileId || existingMeta?.fileId || '',
          lastSyncedAt: new Date().toISOString(),
          monthFolderCount: existingMeta?.monthFolderCount,
        });
        setPendingDriveConfirm(null);
        setDriveStatusMessage(
          'Đã khôi phục dữ liệu từ thư mục "Plantea" trên Google Drive thành công.',
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Thao tác với Google Drive thất bại.';
      if (msg.includes('hết hạn')) {
        clearInMemoryDriveToken();
        setHasDriveToken(false);
      }
      setDriveError(msg);
      setPendingDriveConfirm(null);
    } finally {
      setIsDriveBusy(false);
    }
  }, [
    authSession,
    pendingDriveConfirm,
    snapshot,
    applyServerSnapshot,
    persistDriveMeta,
    restoreSnapshotOnServer,
  ]);

  // Sync any pending offline changes & month deletions automatically when online or Drive is authorized
  const syncPendingChangesOnReconnect = useCallback(async () => {
    if (!authSession || !isOnline || syncInFlightRef.current) return;
    const workspaceId = authSession.workspaceId;
    let pending = readPendingSyncState(workspaceId);
    if (
      !pending.pendingServerSync &&
      !pending.pendingDriveSync &&
      pending.pendingDeleteMonths.length === 0
    ) {
      return;
    }

    syncInFlightRef.current = true;
    setIsSyncingOffline(true);
    try {
      let currentSnap = snapshotRef.current;

      // 1. Đẩy các thay đổi ngoại tuyến lên máy chủ trước
      if (pending.pendingServerSync) {
        const restored = await restoreSnapshotOnServer(
          workspaceId,
          authSession.username,
          currentSnap,
        );
        applyServerSnapshot(restored);
        currentSnap = restored;
        pending = mergePendingSyncState(pending, { pendingServerSync: false });
        persistPendingSync(workspaceId, pending);
      }

      // 2. Tự động sao lưu / xóa tháng trên Google Drive nếu đã liên kết và có token
      const hasDriveWork =
        pending.pendingDriveSync || pending.pendingDeleteMonths.length > 0;
      if (hasDriveWork) {
        const token = await getDriveAccessToken();
        const emailTarget =
          linkedEmail || getCachedDriveUserEmail() || 'Google Drive';

        if (token) {
          let latestMeta = readDriveSyncMeta(workspaceId);
          const deletedMonthsDone: string[] = [];

          for (const mk of pending.pendingDeleteMonths) {
            latestMeta = await deletePlanteaMonthFromDrive({
              accessToken: token,
              monthKey: mk,
              updatedSnapshot: currentSnap,
              linkedEmail: emailTarget,
              existingFolderId: latestMeta?.folderId,
              existingFileId: latestMeta?.fileId,
            });
            persistDriveMeta(workspaceId, latestMeta);
            deletedMonthsDone.push(mk);
          }

          if (pending.pendingDriveSync) {
            latestMeta = await writePlanteaDataToDrive({
              accessToken: token,
              snapshot: currentSnap,
              linkedEmail: emailTarget,
              existingFolderId: latestMeta?.folderId,
              existingFileId: latestMeta?.fileId,
              excludedMonthKeys: pending.pendingDeleteMonths,
            });
            persistDriveMeta(workspaceId, latestMeta);
          }

          pending = mergePendingSyncState(pending, {
            pendingDriveSync: false,
            clearDeleteMonths: deletedMonthsDone,
          });
          persistPendingSync(workspaceId, pending);
          setDriveStatusMessage(
            'Đã có mạng — tự động sao lưu toàn bộ thay đổi lên Google Drive thành công.',
          );
          setAutoSyncNotice(
            'Đã kết nối mạng — tự động sao lưu dữ liệu lên Google Drive thành công.',
          );
        } else if (!linkedEmail) {
          // Tài khoản không liên kết Google Drive -> hoàn tất đồng bộ máy chủ là đủ
          pending = mergePendingSyncState(pending, {
            pendingDriveSync: false,
            clearDeleteMonths: pending.pendingDeleteMonths,
          });
          persistPendingSync(workspaceId, pending);
          setAutoSyncNotice(
            'Đã kết nối mạng — tự động sao lưu thay đổi ngoại tuyến lên hệ thống thành công.',
          );
        }
      } else {
        setAutoSyncNotice(
          'Đã kết nối mạng — tự động đồng bộ thay đổi ngoại tuyến thành công.',
        );
      }
      setErrorBanner('');
    } catch (err) {
      if (!isNetworkFetchError(err)) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('hết hạn')) {
          clearInMemoryDriveToken();
          setHasDriveToken(false);
        } else if (msg) {
          setDriveError(msg);
        }
      }
    } finally {
      syncInFlightRef.current = false;
      setIsSyncingOffline(false);
    }
  }, [
    authSession,
    isOnline,
    linkedEmail,
    applyServerSnapshot,
    persistDriveMeta,
    persistPendingSync,
    restoreSnapshotOnServer,
  ]);

  useEffect(() => {
    if (!authSession || !isOnline) return;
    void syncPendingChangesOnReconnect();
  }, [authSession, isOnline, hasDriveToken, syncPendingChangesOnReconnect]);

  // Load persisted data for the logged-in account (NEVER wipes local data with an empty server snapshot)
  useEffect(() => {
    if (!authSession) return;
    let active = true;
    const workspaceId = authSession.workspaceId;
    const actorName = authSession.username;
    rememberOfflineUserSession(authSession);

    const cached = readLocalBackup(workspaceId);
    const pending = readPendingSyncState(workspaceId);
    setPendingSyncState(pending);

    if (cached) {
      applyServerSnapshot(cached);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    async function fetchInitial() {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        if (active) {
          setIsLoading(false);
          setSaveStatus('saved');
          setErrorBanner('');
        }
        return;
      }

      try {
        const res = await fetch(`/api/tasks?workspaceId=${encodeURIComponent(workspaceId)}`);
        if (!res.ok) throw new Error('Không thể tải dữ liệu của tài khoản.');
        const data = (await res.json()) as WorkspaceSnapshot;
        if (!active) return;

        // Nếu đang có thay đổi ngoại tuyến chưa đẩy lên máy chủ -> KHÔNG ghi đè bằng bản máy chủ cũ
        const currentPending = readPendingSyncState(workspaceId);
        const reconciled =
          currentPending.pendingServerSync && cached
            ? { snapshot: cached, source: 'local' as const, needsServerRestore: true }
            : reconcileSnapshots(cached, data);

        if (reconciled.needsServerRestore) {
          applyServerSnapshot(reconciled.snapshot);
          try {
            const restored = await restoreSnapshotOnServer(
              workspaceId,
              actorName,
              reconciled.snapshot,
            );
            if (active) {
              applyServerSnapshot(restored);
              persistPendingSync(
                workspaceId,
                mergePendingSyncState(readPendingSyncState(workspaceId), {
                  pendingServerSync: false,
                }),
              );
            }
          } catch {
            // keep local preserved snapshot even if server restore fails transiently
          }
        } else {
          applyServerSnapshot(reconciled.snapshot);
        }

        if (active) {
          setIsLoading(false);
          setSaveStatus('saved');
          setErrorBanner('');
        }
      } catch (err) {
        if (active) {
          setIsLoading(false);
          if (cached || isNetworkFetchError(err)) {
            setSaveStatus('saved');
            setErrorBanner('');
          } else {
            setSaveStatus('error');
            setErrorBanner(
              err instanceof Error
                ? err.message
                : 'Không thể kết nối máy chủ, đang hiển thị bản sao lưu gần nhất của tài khoản.',
            );
          }
        }
      }
    }

    fetchInitial();

    return () => {
      active = false;
    };
  }, [authSession, applyServerSnapshot, persistPendingSync, restoreSnapshotOnServer]);

  const handlePrevPeriod = () => {
    if (viewMode === 'month') setSelectedDate((d) => addMonths(d, -1));
    else if (viewMode === 'week') setSelectedDate((d) => addDays(d, -7));
    else setSelectedDate((d) => addDays(d, -1));
  };

  const handleNextPeriod = () => {
    if (viewMode === 'month') setSelectedDate((d) => addMonths(d, 1));
    else if (viewMode === 'week') setSelectedDate((d) => addDays(d, 7));
    else setSelectedDate((d) => addDays(d, 1));
  };

  const handleToday = () => {
    setSelectedDate(toDateKey(new Date()));
  };

  const handleSelectDay = (dateKey: string) => {
    setSelectedDate(dateKey);
    setViewMode('day');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const openAddTaskModal = (dateKey = selectedDate, startTime = '06:00', endTime?: string) => {
    setEditingTask(null);
    setModalDefaultDate(dateKey);
    setModalDefaultStart(startTime);
    setModalDefaultEnd(endTime);
    setIsModalOpen(true);
  };

  const openEditTaskModal = (task: PlannerTask) => {
    setEditingTask(task);
    setModalDefaultDate(task.date);
    setModalDefaultStart(task.startTime);
    setModalDefaultEnd(undefined);
    setIsModalOpen(true);
  };

  const handleNavigateToSessionTask = (
    dateKey: string,
    studentName: string,
    sourceTaskId?: string,
    sessionContent?: string,
  ) => {
    setSelectedDate(dateKey);
    setViewMode('day');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    const dayTasks = snapshot.tasks.filter((t) => t.date === dateKey && !t.isOff);
    let matchedTask: PlannerTask | undefined;

    if (sourceTaskId) {
      matchedTask = snapshot.tasks.find((t) => t.id === sourceTaskId);
    }

    if (!matchedTask) {
      const normStudent = normalizeTaskIncomeName(studentName);
      const normContent = (sessionContent || '').trim().toLowerCase();
      const exactTitleMatches = dayTasks.filter(
        (t) => normalizeTaskIncomeName(t.title) === normStudent,
      );

      if (exactTitleMatches.length > 0) {
        matchedTask =
          (normContent
            ? exactTitleMatches.find(
                (t) =>
                  (t.lessonName || '').trim().toLowerCase() === normContent ||
                  (t.notes || '').trim().toLowerCase() === normContent,
              )
            : undefined) || exactTitleMatches[0];
      } else if (normStudent) {
        matchedTask = dayTasks.find((t) => {
          const normTitle = normalizeTaskIncomeName(t.title);
          return normTitle.includes(normStudent) || normStudent.includes(normTitle);
        });
      }
    }

    if (matchedTask) {
      openEditTaskModal(matchedTask);
    }
  };

  const handleGoToTuitionSheet = (dateKey: string, studentName: string) => {
    const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : selectedDate;
    setIsModalOpen(false);
    setEditingTask(null);
    setSelectedDate(safeDate);
    setViewMode('tuition');
    setIncomeSubView('tuition');
    setTuitionJumpTarget({
      dateKey: safeDate,
      studentName: studentName.trim(),
      nonce: Date.now(),
    });
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSaveTask = async (input: TaskInput, existingId?: string) => {
    setIsSavingTask(true);
    setSaveStatus('saving');
    const saveOffline = () => {
      commitOfflineMutation((prev) =>
        applyOfflineTaskSave(prev, input, existingId, currentAccount),
      );
      setSelectedDate(input.date);
      setIsModalOpen(false);
      setEditingTask(null);
    };

    try {
      if (!isOnline || navigator.onLine === false) {
        saveOffline();
        return;
      }
      const url = existingId ? `/api/tasks/${encodeURIComponent(existingId)}` : '/api/tasks';
      const method = existingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...input,
          workspaceId: activeWorkspaceId,
          actor: currentAccount,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Lưu thông tin thất bại.');
      }
      if (data.snapshot) {
        applyServerSnapshot(data.snapshot);
      }
      setSaveStatus('saved');
      setSelectedDate(input.date);
      setIsModalOpen(false);
      setEditingTask(null);
    } catch (err) {
      if (isNetworkFetchError(err)) {
        saveOffline();
        return;
      }
      setSaveStatus('error');
      throw err;
    } finally {
      setIsSavingTask(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    setIsSavingTask(true);
    setSaveStatus('saving');
    const deleteOffline = () => {
      commitOfflineMutation((prev) => applyOfflineTaskDelete(prev, taskId, currentAccount));
      setIsModalOpen(false);
      setEditingTask(null);
    };

    try {
      if (!isOnline || navigator.onLine === false) {
        deleteOffline();
        return;
      }
      const res = await fetch(
        `/api/tasks/${encodeURIComponent(taskId)}?workspaceId=${encodeURIComponent(activeWorkspaceId)}&actor=${encodeURIComponent(currentAccount)}`,
        { method: 'DELETE' },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Xóa task thất bại.');
      }
      if (data.snapshot) {
        applyServerSnapshot(data.snapshot);
      }
      setSaveStatus('saved');
      setIsModalOpen(false);
      setEditingTask(null);
    } catch (err) {
      if (isNetworkFetchError(err)) {
        deleteOffline();
        return;
      }
      setSaveStatus('error');
      setErrorBanner(err instanceof Error ? err.message : 'Không thể xóa task.');
    } finally {
      setIsSavingTask(false);
    }
  };

  const handleToggleStatus = async (task: PlannerTask, nextStatus: CompletionStatus) => {
    setSaveStatus('saving');
    const patchOffline = () => {
      commitOfflineMutation((prev) =>
        applyOfflineTaskPatch(prev, task.id, { status: nextStatus }, currentAccount),
      );
    };

    try {
      if (!isOnline || navigator.onLine === false) {
        patchOffline();
        return;
      }
      const res = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: nextStatus,
          workspaceId: activeWorkspaceId,
          actor: currentAccount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể cập nhật trạng thái.');
      if (data.snapshot) {
        applyServerSnapshot(data.snapshot);
      }
      setSaveStatus('saved');
    } catch (err) {
      if (isNetworkFetchError(err)) {
        patchOffline();
        return;
      }
      setSaveStatus('error');
      setErrorBanner(err instanceof Error ? err.message : 'Lỗi cập nhật trạng thái.');
    }
  };

  const handleUpdateTaskIncome = async (task: PlannerTask, nextIncome: number) => {
    setSaveStatus('saving');
    const patchOffline = () => {
      commitOfflineMutation((prev) =>
        applyOfflineTaskPatch(prev, task.id, { income: nextIncome }, currentAccount),
      );
    };

    try {
      if (!isOnline || navigator.onLine === false) {
        patchOffline();
        return;
      }
      const res = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          income: nextIncome,
          workspaceId: activeWorkspaceId,
          actor: currentAccount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể cập nhật thu nhập.');
      if (data.snapshot) {
        applyServerSnapshot(data.snapshot);
      }
      setSaveStatus('saved');
    } catch (err) {
      if (isNetworkFetchError(err)) {
        patchOffline();
        return;
      }
      setSaveStatus('error');
      setErrorBanner(err instanceof Error ? err.message : 'Lỗi cập nhật thu nhập.');
    }
  };

  const handleAddIncome = async (input: IncomeInput) => {
    setSaveStatus('saving');
    const addOffline = () => {
      commitOfflineMutation((prev) => applyOfflineIncomeAdd(prev, input, currentAccount));
    };

    try {
      if (!isOnline || navigator.onLine === false) {
        addOffline();
        return;
      }
      const res = await fetch('/api/incomes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...input,
          workspaceId: activeWorkspaceId,
          actor: currentAccount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể lưu nguồn thu.');
      if (data.snapshot) applyServerSnapshot(data.snapshot);
      setSaveStatus('saved');
    } catch (err) {
      if (isNetworkFetchError(err)) {
        addOffline();
        return;
      }
      setSaveStatus('error');
      throw err;
    }
  };

  const handleToggleIncomeStatus = async (
    entry: IncomeEntry,
    nextStatus: IncomeReceivedStatus,
  ) => {
    setSaveStatus('saving');
    const toggleOffline = () => {
      commitOfflineMutation((prev) =>
        applyOfflineIncomeStatusUpdate(prev, entry.id, nextStatus, currentAccount),
      );
    };

    try {
      if (!isOnline || navigator.onLine === false) {
        toggleOffline();
        return;
      }
      const res = await fetch(`/api/incomes/${encodeURIComponent(entry.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receivedStatus: nextStatus,
          workspaceId: activeWorkspaceId,
          actor: currentAccount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể cập nhật tình trạng thu.');
      if (data.snapshot) applyServerSnapshot(data.snapshot);
      setSaveStatus('saved');
    } catch (err) {
      if (isNetworkFetchError(err)) {
        toggleOffline();
        return;
      }
      setSaveStatus('error');
      setErrorBanner(err instanceof Error ? err.message : 'Lỗi cập nhật nguồn thu.');
    }
  };

  const handleDeleteIncome = async (incomeId: string) => {
    setSaveStatus('saving');
    const deleteOffline = () => {
      commitOfflineMutation((prev) => applyOfflineIncomeDelete(prev, incomeId, currentAccount));
    };

    try {
      if (!isOnline || navigator.onLine === false) {
        deleteOffline();
        return;
      }
      const res = await fetch(
        `/api/incomes/${encodeURIComponent(incomeId)}?workspaceId=${encodeURIComponent(activeWorkspaceId)}&actor=${encodeURIComponent(currentAccount)}`,
        { method: 'DELETE' },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể xóa nguồn thu.');
      if (data.snapshot) applyServerSnapshot(data.snapshot);
      setSaveStatus('saved');
    } catch (err) {
      if (isNetworkFetchError(err)) {
        deleteOffline();
        return;
      }
      setSaveStatus('error');
      setErrorBanner(err instanceof Error ? err.message : 'Lỗi xóa nguồn thu.');
    }
  };

  const handleCreateStudent = async (input: StudentTuitionInput): Promise<StudentTuition | null> => {
    setSaveStatus('saving');
    const createOffline = () => {
      let createdStudent: StudentTuition | null = null;
      commitOfflineMutation((prev) => {
        const res = applyOfflineStudentCreate(prev, input, currentAccount);
        createdStudent = res.student;
        return res.snapshot;
      });
      return createdStudent;
    };

    try {
      if (!isOnline || navigator.onLine === false) {
        return createOffline();
      }
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...input,
          workspaceId: activeWorkspaceId,
          actor: currentAccount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể thêm học sinh.');
      if (data.snapshot) applyServerSnapshot(data.snapshot);
      setSaveStatus('saved');
      return (data.student as StudentTuition) || null;
    } catch (err) {
      if (isNetworkFetchError(err)) {
        return createOffline();
      }
      setSaveStatus('error');
      throw err;
    }
  };

  const handleUpdateStudent = async (studentId: string, input: StudentTuitionInput) => {
    setSaveStatus('saving');
    const updateOffline = () => {
      commitOfflineMutation((prev) =>
        applyOfflineStudentUpdate(prev, studentId, input, currentAccount),
      );
    };

    try {
      if (!isOnline || navigator.onLine === false) {
        updateOffline();
        return;
      }
      const res = await fetch(`/api/students/${encodeURIComponent(studentId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...input,
          workspaceId: activeWorkspaceId,
          actor: currentAccount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể cập nhật thông tin học sinh.');
      if (data.snapshot) applyServerSnapshot(data.snapshot);
      setSaveStatus('saved');
    } catch (err) {
      if (isNetworkFetchError(err)) {
        updateOffline();
        return;
      }
      setSaveStatus('error');
      throw err;
    }
  };

  const handleDeleteStudent = async (studentId: string) => {
    setSaveStatus('saving');
    const deleteOffline = () => {
      commitOfflineMutation((prev) =>
        applyOfflineStudentDelete(prev, studentId, currentAccount),
      );
    };

    try {
      if (!isOnline || navigator.onLine === false) {
        deleteOffline();
        return;
      }
      const res = await fetch(
        `/api/students/${encodeURIComponent(studentId)}?workspaceId=${encodeURIComponent(activeWorkspaceId)}&actor=${encodeURIComponent(currentAccount)}`,
        { method: 'DELETE' },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể xóa học sinh.');
      if (data.snapshot) applyServerSnapshot(data.snapshot);
      setSaveStatus('saved');
    } catch (err) {
      if (isNetworkFetchError(err)) {
        deleteOffline();
        return;
      }
      setSaveStatus('error');
      setErrorBanner(err instanceof Error ? err.message : 'Lỗi xóa học sinh.');
    }
  };

  const handleAddSession = async (studentId: string, input: TuitionSessionInput) => {
    setSaveStatus('saving');
    const addOffline = () => {
      commitOfflineMutation((prev) =>
        applyOfflineSessionAdd(prev, studentId, input, currentAccount),
      );
    };

    try {
      if (!isOnline || navigator.onLine === false) {
        addOffline();
        return;
      }
      const res = await fetch(`/api/students/${encodeURIComponent(studentId)}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...input,
          workspaceId: activeWorkspaceId,
          actor: currentAccount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể thêm buổi học.');
      if (data.snapshot) applyServerSnapshot(data.snapshot);
      setSaveStatus('saved');
    } catch (err) {
      if (isNetworkFetchError(err)) {
        addOffline();
        return;
      }
      setSaveStatus('error');
      throw err;
    }
  };

  const handleUpdateSession = async (
    studentId: string,
    sessionId: string,
    input: Partial<TuitionSessionInput>,
  ) => {
    setSaveStatus('saving');
    const updateOffline = () => {
      commitOfflineMutation((prev) =>
        applyOfflineSessionUpdate(prev, studentId, sessionId, input, currentAccount),
      );
    };

    try {
      if (!isOnline || navigator.onLine === false) {
        updateOffline();
        return;
      }
      const res = await fetch(
        `/api/students/${encodeURIComponent(studentId)}/sessions/${encodeURIComponent(sessionId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...input,
            workspaceId: activeWorkspaceId,
            actor: currentAccount,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể cập nhật buổi học.');
      if (data.snapshot) applyServerSnapshot(data.snapshot);
      setSaveStatus('saved');
    } catch (err) {
      if (isNetworkFetchError(err)) {
        updateOffline();
        return;
      }
      setSaveStatus('error');
      setErrorBanner(err instanceof Error ? err.message : 'Lỗi cập nhật buổi học.');
    }
  };

  const handleDeleteSession = async (studentId: string, sessionId: string) => {
    setSaveStatus('saving');
    const deleteOffline = () => {
      commitOfflineMutation((prev) =>
        applyOfflineSessionDelete(prev, studentId, sessionId, currentAccount),
      );
    };

    try {
      if (!isOnline || navigator.onLine === false) {
        deleteOffline();
        return;
      }
      const res = await fetch(
        `/api/students/${encodeURIComponent(studentId)}/sessions/${encodeURIComponent(sessionId)}?workspaceId=${encodeURIComponent(activeWorkspaceId)}&actor=${encodeURIComponent(currentAccount)}`,
        { method: 'DELETE' },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể xóa buổi học.');
      if (data.snapshot) applyServerSnapshot(data.snapshot);
      setSaveStatus('saved');
    } catch (err) {
      if (isNetworkFetchError(err)) {
        deleteOffline();
        return;
      }
      setSaveStatus('error');
      setErrorBanner(err instanceof Error ? err.message : 'Lỗi xóa buổi học.');
    }
  };

  const handleCreateTodo = async (input: TodoInput) => {
    setSaveStatus('saving');
    const createOffline = () => {
      commitOfflineMutation((prev) => applyOfflineTodoCreate(prev, input, currentAccount));
    };

    try {
      if (!isOnline || navigator.onLine === false) {
        createOffline();
        return;
      }
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...input,
          workspaceId: activeWorkspaceId,
          actor: currentAccount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể thêm công việc.');
      if (data.snapshot) applyServerSnapshot(data.snapshot);
      setSaveStatus('saved');
    } catch (err) {
      if (isNetworkFetchError(err)) {
        createOffline();
        return;
      }
      setSaveStatus('error');
      throw err;
    }
  };

  const handleUpdateTodo = async (todoId: string, patch: Partial<TodoInput>) => {
    setSaveStatus('saving');
    const updateOffline = () => {
      commitOfflineMutation((prev) =>
        applyOfflineTodoUpdate(prev, todoId, patch, currentAccount),
      );
    };

    try {
      if (!isOnline || navigator.onLine === false) {
        updateOffline();
        return;
      }
      const res = await fetch(`/api/todos/${encodeURIComponent(todoId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...patch,
          workspaceId: activeWorkspaceId,
          actor: currentAccount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể cập nhật công việc.');
      if (data.snapshot) applyServerSnapshot(data.snapshot);
      setSaveStatus('saved');
    } catch (err) {
      if (isNetworkFetchError(err)) {
        updateOffline();
        return;
      }
      setSaveStatus('error');
      setErrorBanner(err instanceof Error ? err.message : 'Lỗi cập nhật công việc.');
    }
  };

  const handleDeleteTodo = async (todoId: string) => {
    setSaveStatus('saving');
    const deleteOffline = () => {
      commitOfflineMutation((prev) => applyOfflineTodoDelete(prev, todoId, currentAccount));
    };

    try {
      if (!isOnline || navigator.onLine === false) {
        deleteOffline();
        return;
      }
      const res = await fetch(
        `/api/todos/${encodeURIComponent(todoId)}?workspaceId=${encodeURIComponent(activeWorkspaceId)}&actor=${encodeURIComponent(currentAccount)}`,
        { method: 'DELETE' },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể xóa công việc.');
      if (data.snapshot) applyServerSnapshot(data.snapshot);
      setSaveStatus('saved');
    } catch (err) {
      if (isNetworkFetchError(err)) {
        deleteOffline();
        return;
      }
      setSaveStatus('error');
      setErrorBanner(err instanceof Error ? err.message : 'Lỗi xóa công việc.');
    }
  };

  const handleDismissCarryover = async (originId: string, dateKey: string) => {
    setSaveStatus('saving');
    const dismissOffline = () => {
      commitOfflineMutation((prev) =>
        applyOfflineCarryoverDismiss(prev, originId, dateKey, currentAccount),
      );
    };

    try {
      if (!isOnline || navigator.onLine === false) {
        dismissOffline();
        return;
      }
      const res = await fetch('/api/todos/dismiss-carryover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originId,
          date: dateKey,
          workspaceId: activeWorkspaceId,
          actor: currentAccount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể xóa công việc.');
      if (data.snapshot) applyServerSnapshot(data.snapshot);
      setSaveStatus('saved');
    } catch (err) {
      if (isNetworkFetchError(err)) {
        dismissOffline();
        return;
      }
      setSaveStatus('error');
      setErrorBanner(err instanceof Error ? err.message : 'Lỗi xóa công việc.');
    }
  };

  const handleCreateNote = async (input: DailyNoteInput) => {
    setSaveStatus('saving');
    const createOffline = () => {
      commitOfflineMutation((prev) => applyOfflineNoteCreate(prev, input, currentAccount));
    };

    try {
      if (!isOnline || navigator.onLine === false) {
        createOffline();
        return;
      }
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...input,
          workspaceId: activeWorkspaceId,
          actor: currentAccount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể thêm ghi chú.');
      if (data.snapshot) applyServerSnapshot(data.snapshot);
      setSaveStatus('saved');
    } catch (err) {
      if (isNetworkFetchError(err)) {
        createOffline();
        return;
      }
      setSaveStatus('error');
      throw err;
    }
  };

  const handleUpdateNote = async (noteId: string, patch: Partial<DailyNoteInput>) => {
    setSaveStatus('saving');
    const updateOffline = () => {
      commitOfflineMutation((prev) =>
        applyOfflineNoteUpdate(prev, noteId, patch, currentAccount),
      );
    };

    try {
      if (!isOnline || navigator.onLine === false) {
        updateOffline();
        return;
      }
      const res = await fetch(`/api/notes/${encodeURIComponent(noteId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...patch,
          workspaceId: activeWorkspaceId,
          actor: currentAccount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể cập nhật ghi chú.');
      if (data.snapshot) applyServerSnapshot(data.snapshot);
      setSaveStatus('saved');
    } catch (err) {
      if (isNetworkFetchError(err)) {
        updateOffline();
        return;
      }
      setSaveStatus('error');
      setErrorBanner(err instanceof Error ? err.message : 'Lỗi cập nhật ghi chú.');
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    setSaveStatus('saving');
    const deleteOffline = () => {
      commitOfflineMutation((prev) => applyOfflineNoteDelete(prev, noteId, currentAccount));
    };

    try {
      if (!isOnline || navigator.onLine === false) {
        deleteOffline();
        return;
      }
      const res = await fetch(
        `/api/notes/${encodeURIComponent(noteId)}?workspaceId=${encodeURIComponent(activeWorkspaceId)}&actor=${encodeURIComponent(currentAccount)}`,
        { method: 'DELETE' },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể xóa ghi chú.');
      if (data.snapshot) applyServerSnapshot(data.snapshot);
      setSaveStatus('saved');
    } catch (err) {
      if (isNetworkFetchError(err)) {
        deleteOffline();
        return;
      }
      setSaveStatus('error');
      setErrorBanner(err instanceof Error ? err.message : 'Lỗi xóa ghi chú.');
    }
  };

  const handleClearDayNotes = async (dateKey: string) => {
    setSaveStatus('saving');
    const clearOffline = () => {
      commitOfflineMutation((prev) =>
        applyOfflineClearDayNotes(prev, dateKey, currentAccount),
      );
    };

    try {
      if (!isOnline || navigator.onLine === false) {
        clearOffline();
        return;
      }
      const res = await fetch(
        `/api/notes?workspaceId=${encodeURIComponent(activeWorkspaceId)}&date=${encodeURIComponent(dateKey)}&actor=${encodeURIComponent(currentAccount)}`,
        { method: 'DELETE' },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể xóa toàn bộ ghi chú.');
      if (data.snapshot) applyServerSnapshot(data.snapshot);
      setSaveStatus('saved');
    } catch (err) {
      if (isNetworkFetchError(err)) {
        clearOffline();
        return;
      }
      setSaveStatus('error');
      setErrorBanner(err instanceof Error ? err.message : 'Lỗi xóa ghi chú.');
    }
  };

  const handleUpdateAppearance = useCallback(
    (next: AppearanceSettings) => {
      const normalized: AppearanceSettings = {
        themeMode: next.themeMode === 'dark' ? 'dark' : 'light',
        backgroundColor:
          normalizeHexColor(next.backgroundColor) || DEFAULT_APP_BACKGROUND_COLOR,
      };
      const updatedOffline = applyOfflineAppearance(
        snapshotRef.current,
        normalized,
        currentAccount,
      );
      applyServerSnapshot(updatedOffline);

      if (!activeWorkspaceId) return;
      if (!isOnline || navigator.onLine === false) {
        const nextPending = mergePendingSyncState(readPendingSyncState(activeWorkspaceId), {
          pendingServerSync: true,
          pendingDriveSync: true,
        });
        persistPendingSync(activeWorkspaceId, nextPending);
        setSaveStatus('saved');
        return;
      }

      const seq = ++appearanceSeqRef.current;
      setSaveStatus('saving');
      if (appearanceSaveTimerRef.current !== null) {
        window.clearTimeout(appearanceSaveTimerRef.current);
      }
      appearanceSaveTimerRef.current = window.setTimeout(async () => {
        try {
          const res = await fetch('/api/workspace/appearance', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...normalized,
              workspaceId: activeWorkspaceId,
              actor: currentAccount,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Không thể lưu giao diện.');
          if (seq === appearanceSeqRef.current && data.snapshot) {
            applyServerSnapshot(data.snapshot);
          }
          if (seq === appearanceSeqRef.current) {
            setSaveStatus('saved');
          }
        } catch (err) {
          if (seq === appearanceSeqRef.current) {
            if (isNetworkFetchError(err)) {
              const nextPending = mergePendingSyncState(readPendingSyncState(activeWorkspaceId), {
                pendingServerSync: true,
                pendingDriveSync: true,
              });
              persistPendingSync(activeWorkspaceId, nextPending);
              setSaveStatus('saved');
            } else {
              setSaveStatus('error');
              setErrorBanner(err instanceof Error ? err.message : 'Lỗi lưu giao diện.');
            }
          }
        }
      }, 220);
    },
    [activeWorkspaceId, currentAccount, isOnline, applyServerSnapshot, persistPendingSync],
  );

  const handleUpdateAvatar = useCallback(
    async (nextAvatarDataUrl: string) => {
      const normalizedAvatar = normalizeAvatarDataUrl(nextAvatarDataUrl);
      setSaveStatus('saving');
      const saveOffline = () => {
        commitOfflineMutation((prev) =>
          applyOfflineAvatar(prev, normalizedAvatar, currentAccount),
        );
      };

      try {
        if (!isOnline || navigator.onLine === false) {
          saveOffline();
          return;
        }
        const res = await fetch('/api/workspace/avatar', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            avatarDataUrl: normalizedAvatar,
            workspaceId: activeWorkspaceId,
            actor: currentAccount,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Không thể cập nhật ảnh đại diện.');
        if (data.snapshot) {
          applyServerSnapshot(data.snapshot);
        }
        setSaveStatus('saved');
      } catch (err) {
        if (isNetworkFetchError(err)) {
          saveOffline();
          return;
        }
        setSaveStatus('error');
        throw err;
      }
    },
    [activeWorkspaceId, currentAccount, isOnline, applyServerSnapshot, commitOfflineMutation],
  );

  const handleSaveMonthlyTarget = useCallback(
    async (monthKey: string, amount: number) => {
      setSaveStatus('saving');
      const saveOffline = () => {
        commitOfflineMutation((prev) =>
          applyOfflineMonthlyTarget(prev, monthKey, amount, currentAccount),
        );
      };

      try {
        if (!isOnline || navigator.onLine === false) {
          saveOffline();
          return;
        }
        const res = await fetch('/api/workspace/income-targets', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            monthKey,
            monthlyTarget: amount,
            workspaceId: activeWorkspaceId,
            actor: currentAccount,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Không thể lưu thu nhập mục tiêu tháng.');
        if (data.snapshot) applyServerSnapshot(data.snapshot);
        setSaveStatus('saved');
      } catch (err) {
        if (isNetworkFetchError(err)) {
          saveOffline();
          return;
        }
        setSaveStatus('error');
        throw err;
      }
    },
    [activeWorkspaceId, currentAccount, isOnline, applyServerSnapshot, commitOfflineMutation],
  );

  const handleClearMonth = useCallback(
    async (monthKey: string) => {
      if (!activeWorkspaceId) return;
      const monthLabel = formatMonthKeyLabel(monthKey);
      setSaveStatus('saving');

      const clearOffline = () => {
        commitOfflineMutation(
          (prev) => clearMonthDataFromSnapshot(prev, monthKey, currentAccount),
          { deletedMonthKey: monthKey },
        );
        setAutoSyncNotice(
          `Đã xóa toàn bộ thông tin ${monthLabel} trên thiết bị. Sẽ tự đồng bộ khi có mạng.`,
        );
      };

      try {
        if (!isOnline || navigator.onLine === false) {
          clearOffline();
          return;
        }

        const res = await fetch(
          `/api/workspace/month?workspaceId=${encodeURIComponent(activeWorkspaceId)}&monthKey=${encodeURIComponent(monthKey)}&actor=${encodeURIComponent(currentAccount)}`,
          { method: 'DELETE' },
        );
        const data = (await res.json()) as { error?: string; snapshot?: WorkspaceSnapshot };
        if (!res.ok || !data.snapshot) {
          throw new Error(data.error || `Không thể xóa dữ liệu ${monthLabel}.`);
        }

        const updatedSnap = data.snapshot;
        applyServerSnapshot(updatedSnap);
        setSaveStatus('saved');

        const token = await getDriveAccessToken();
        if (token) {
          const currentMeta = readDriveSyncMeta(activeWorkspaceId);
          const nextMeta = await deletePlanteaMonthFromDrive({
            accessToken: token,
            monthKey,
            updatedSnapshot: updatedSnap,
            linkedEmail: linkedEmail || getCachedDriveUserEmail() || 'Google Drive',
            existingFolderId: currentMeta?.folderId,
            existingFileId: currentMeta?.fileId,
          });
          persistDriveMeta(activeWorkspaceId, nextMeta);
          setDriveStatusMessage(
            `Đã xóa toàn bộ thông tin ${monthLabel} trên ứng dụng và trên Google Drive.`,
          );
          setAutoSyncNotice(
            `Đã xóa toàn bộ thông tin ${monthLabel} trên ứng dụng và Google Drive.`,
          );
        } else if (linkedEmail) {
          const currentPending = readPendingSyncState(activeWorkspaceId);
          persistPendingSync(
            activeWorkspaceId,
            mergePendingSyncState(currentPending, {
              pendingDriveSync: false,
              addDeleteMonth: monthKey,
            }),
          );
          setAutoSyncNotice(
            `Đã xóa dữ liệu ${monthLabel} trên ứng dụng. Vui lòng cấp phép Google Drive để xóa thư mục tháng trên Drive.`,
          );
        } else {
          setAutoSyncNotice(`Đã xóa toàn bộ thông tin ${monthLabel} trên ứng dụng.`);
        }
      } catch (err) {
        if (isNetworkFetchError(err)) {
          clearOffline();
          return;
        }
        setSaveStatus('error');
        throw err;
      }
    },
    [
      activeWorkspaceId,
      currentAccount,
      isOnline,
      linkedEmail,
      applyServerSnapshot,
      commitOfflineMutation,
      persistDriveMeta,
      persistPendingSync,
    ],
  );

  const handleExportCsv = () => {
    const csv = tasksToCsv(snapshot.tasks);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plantea-lich-thu-nhap-${selectedDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const periodSummary = useMemo(() => {
    if (viewMode === 'todo') {
      const resolvedTodos = resolveTodosForDate(
        snapshot.todos || [],
        selectedDate,
        snapshot.dismissedTodoCarryovers || {},
      );
      const persistedCompleted = snapshot.completedTodoCountsByDate?.[selectedDate] || 0;
      const todoSummary = summarizeDayTodos(resolvedTodos, persistedCompleted);
      return {
        total: 0,
        completed: 0,
        pending: 0,
        completedCount: todoSummary.completedCount,
        totalCount: todoSummary.totalCount,
      };
    }
    const allTasks = snapshot.tasks;
    if (viewMode === 'day') {
      return summarizeIncome(allTasks.filter((t) => t.date === selectedDate));
    }
    if (viewMode === 'week') {
      const weekSet = new Set(getWeekDates(selectedDate));
      return summarizeIncome(allTasks.filter((t) => weekSet.has(t.date)));
    }
    const sel = parseDateKey(selectedDate);
    const monthPrefix = `${sel.getFullYear()}-${String(sel.getMonth() + 1).padStart(2, '0')}-`;
    return summarizeIncome(allTasks.filter((t) => t.date.startsWith(monthPrefix)));
  }, [
    snapshot.tasks,
    snapshot.todos,
    snapshot.dismissedTodoCarryovers,
    snapshot.completedTodoCountsByDate,
    viewMode,
    selectedDate,
  ]);

  const monthlyIncomeSummary = useMemo(
    () => summarizeMonthlyIncome(snapshot.tasks, snapshot.incomes || [], selectedDate),
    [snapshot.tasks, snapshot.incomes, selectedDate],
  );

  const dailyIncomeSummary = useMemo(
    () => summarizeDailyIncome(snapshot.tasks, selectedDate),
    [snapshot.tasks, selectedDate],
  );

  const activeMonthKey = getMonthKey(selectedDate);
  const activeMonthlyTarget = snapshot.monthlyIncomeTargets?.[activeMonthKey] ?? 0;
  const selectedDayNotesCount = useMemo(
    () => getNotesForDate(snapshot.dailyNotes, selectedDate).length,
    [snapshot.dailyNotes, selectedDate],
  );

  if (!authSession) {
    return (
      <>
        <LoginScreen
          onLogin={handleLogin}
          onRegister={handleRegister}
          onGoogleDriveLogin={handleGoogleDriveLogin}
        />
        {!isOnline && (
          <OfflineIndicator
            isOnline={isOnline}
            isSyncing={false}
            pendingCount={0}
            needsDriveReauth={false}
            syncNotice=""
          />
        )}
      </>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col text-[#3D1A2B]"
      style={
        currentAppearance.themeMode === 'light'
          ? { backgroundColor: currentAppearance.backgroundColor }
          : undefined
      }
    >
      <TopBar
        viewMode={viewMode}
        currentAccount={currentAccount}
        avatarDataUrl={snapshot.avatarDataUrl}
        driveLinked={Boolean(linkedEmail)}
        hasDriveToken={hasDriveToken}
        onChangeView={setViewMode}
        onExportCsv={handleExportCsv}
        onOpenAccountModal={() => setIsAccountModalOpen(true)}
      />

      <WorkspaceToolbar
        viewMode={viewMode}
        onChangeView={setViewMode}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        onOpenAddTodo={() => setIsAddTodoModalOpen(true)}
        onOpenNotes={() => setIsNotesModalOpen(true)}
        dayNotesCount={selectedDayNotesCount}
        onPrevPeriod={handlePrevPeriod}
        onNextPeriod={handleNextPeriod}
        onToday={handleToday}
        completedCount={periodSummary.completedCount}
        totalCount={periodSummary.totalCount}
      />

      {errorBanner && (
        <div
          role="alert"
          className="mx-auto mt-3 w-full max-w-[1440px] px-4 sm:px-6"
        >
          <div className="rounded-2xl border border-[#F39EC1] bg-[#FFE3EE] px-4 py-2.5 text-xs font-semibold text-[#9D174D]">
            {errorBanner}
          </div>
        </div>
      )}

      <main
        id="calendar-workspace"
        className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col xl:flex-row items-start gap-5 px-4 py-4 sm:px-6"
      >
        {viewMode === 'tuition' ? (
          <div className="w-full space-y-4">
            {/* Trình đơn thả xuống chọn mục trong thẻ Thu nhập: Học phí & Thống kê */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-[#F5BDD6] bg-white px-4 py-3 shadow-xs">
              <div className="flex items-center gap-2.5">
                <label
                  htmlFor="income-subview-select"
                  className="text-xs sm:text-sm font-bold text-[#7C5266] whitespace-nowrap"
                >
                  Chế độ thu nhập:
                </label>
                <select
                  id="income-subview-select"
                  aria-label="Chọn mục trong Thu nhập"
                  value={incomeSubView}
                  onChange={(e) => setIncomeSubView(e.target.value as 'stats' | 'tuition')}
                  className="rounded-2xl border border-[#F39EC1] bg-[#FFF0F6] px-3.5 py-1.5 text-xs sm:text-sm font-extrabold text-[#9D174D] cursor-pointer focus:border-[#E11D64] focus:outline-none"
                >
                  <option value="stats">Thống kê</option>
                  <option value="tuition">Học phí</option>
                </select>
              </div>

              {incomeSubView === 'stats' && (
                <div className="flex flex-wrap items-center gap-2">
                  <label
                    htmlFor="income-stats-date"
                    className="text-xs font-bold text-[#7C5266] whitespace-nowrap"
                  >
                    Ngày / Tháng:
                  </label>
                  <input
                    id="income-stats-date"
                    type="date"
                    value={selectedDate}
                    onChange={(e) => {
                      if (e.target.value) setSelectedDate(e.target.value);
                    }}
                    className="rounded-2xl border border-[#F5BDD6] bg-[#FFF8FB] px-3 py-1.5 text-xs font-bold text-[#3D1A2B] font-mono-tabular focus:border-[#E11D64] focus:outline-none cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={handleToday}
                    className="rounded-2xl border border-[#F5BDD6] bg-white px-3 py-1.5 text-xs font-bold text-[#9D174D] hover:bg-[#FFE3EE] cursor-pointer whitespace-nowrap"
                  >
                    Hôm nay
                  </button>
                </div>
              )}
            </div>

            {isLoading ? (
              <div className="w-full rounded-3xl border border-[#F5BDD6] bg-white p-8 space-y-4">
                <div className="h-6 w-48 animate-pulse rounded-xl bg-[#FFE3EE]" />
                <div className="h-72 w-full animate-pulse rounded-2xl bg-[#FFF0F6]" />
              </div>
            ) : incomeSubView === 'tuition' ? (
              <TuitionManager
                students={snapshot.students || []}
                selectedDate={selectedDate}
                jumpTarget={tuitionJumpTarget}
                onCreateStudent={handleCreateStudent}
                onUpdateStudent={handleUpdateStudent}
                onDeleteStudent={handleDeleteStudent}
                onAddSession={handleAddSession}
                onUpdateSession={handleUpdateSession}
                onDeleteSession={handleDeleteSession}
                onNavigateToSessionTask={handleNavigateToSessionTask}
              />
            ) : (
              <div className="flex flex-col lg:flex-row items-start gap-5">
                <MiddleSummaryPanel
                  selectedDate={selectedDate}
                  monthlyIncomeSummary={monthlyIncomeSummary}
                  dailyIncomeSummary={dailyIncomeSummary}
                  monthlyTarget={activeMonthlyTarget}
                  onSaveMonthlyTarget={handleSaveMonthlyTarget}
                />

                <div className="min-w-0 w-full flex-1">
                  <IncomeCategoriesBox
                    selectedDate={selectedDate}
                    tasks={snapshot.tasks}
                    incomes={snapshot.incomes || []}
                    onAddIncome={handleAddIncome}
                    onToggleIncomeStatus={handleToggleIncomeStatus}
                    onDeleteIncome={handleDeleteIncome}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="min-w-0 w-full flex-1">
            {isLoading ? (
              <div className="rounded-3xl border border-[#F5BDD6] bg-white p-8 space-y-4">
                <div className="h-6 w-48 animate-pulse rounded-xl bg-[#FFE3EE]" />
                <div className="h-72 w-full animate-pulse rounded-2xl bg-[#FFF0F6]" />
              </div>
            ) : viewMode === 'month' ? (
              <MonthCalendar
                selectedDate={selectedDate}
                onSelectDay={handleSelectDay}
                onDeleteMonth={handleClearMonth}
                driveLinked={Boolean(linkedEmail)}
              />
            ) : viewMode === 'week' ? (
              <WeekCalendar
                selectedDate={selectedDate}
                tasks={snapshot.tasks}
                onSelectDay={handleSelectDay}
                onAddTaskForDate={(dateKey) => openAddTaskModal(dateKey, '06:00')}
                onEditTask={openEditTaskModal}
              />
            ) : viewMode === 'todo' ? (
              <TodoListView
                selectedDate={selectedDate}
                todos={snapshot.todos || []}
                dismissedTodoCarryovers={snapshot.dismissedTodoCarryovers || {}}
                isAddModalOpen={isAddTodoModalOpen}
                onCloseAddModal={() => setIsAddTodoModalOpen(false)}
                onCreateTodo={handleCreateTodo}
                onUpdateTodo={handleUpdateTodo}
                onDeleteTodo={handleDeleteTodo}
                onDismissCarryover={handleDismissCarryover}
              />
            ) : (
              <DayScheduleTable
                selectedDate={selectedDate}
                tasks={snapshot.tasks}
                onAddTaskAtSlot={(startTime, endTime) =>
                  openAddTaskModal(selectedDate, startTime, endTime)
                }
                onEditTask={openEditTaskModal}
                onToggleTaskStatus={handleToggleStatus}
                onUpdateTaskIncome={handleUpdateTaskIncome}
              />
            )}
          </div>
        )}
      </main>

      <TaskModal
        isOpen={isModalOpen}
        editingTask={editingTask}
        existingTasks={snapshot.tasks}
        defaultDate={modalDefaultDate}
        defaultStartTime={modalDefaultStart}
        defaultEndTime={modalDefaultEnd}
        backgroundColor={currentAppearance.backgroundColor}
        isSaving={isSavingTask}
        onClose={() => {
          setIsModalOpen(false);
          setEditingTask(null);
        }}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
        onGoToTuitionSheet={handleGoToTuitionSheet}
      />

      <DailyNotesModal
        isOpen={isNotesModalOpen}
        selectedDate={selectedDate}
        notes={snapshot.dailyNotes || []}
        onClose={() => setIsNotesModalOpen(false)}
        onCreateNote={handleCreateNote}
        onUpdateNote={handleUpdateNote}
        onDeleteNote={handleDeleteNote}
        onClearDayNotes={handleClearDayNotes}
      />

      <AccountAppearanceModal
        isOpen={isAccountModalOpen}
        currentAccount={currentAccount}
        currentPhone={authSession.phone}
        linkedEmail={linkedEmail}
        avatarDataUrl={snapshot.avatarDataUrl}
        saveStatus={saveStatus}
        lastSavedAt={snapshot.lastSavedAt}
        appearance={currentAppearance}
        hasDriveToken={hasDriveToken}
        driveSyncMeta={driveSyncMeta}
        isDriveBusy={isDriveBusy}
        driveStatusMessage={driveStatusMessage}
        driveError={driveError}
        onAuthorizeDrive={handleAuthorizeDriveInApp}
        onRequestSaveToDrive={handleRequestSaveToDrive}
        onRequestLoadFromDrive={handleRequestLoadFromDrive}
        onUpdateLinkedEmail={handleUpdateLinkedEmail}
        onUpdateProfile={handleUpdateProfile}
        onUpdateAppearance={handleUpdateAppearance}
        onUpdateAvatar={handleUpdateAvatar}
        onLogout={handleLogout}
        onClose={() => setIsAccountModalOpen(false)}
      />

      <DriveConfirmModal
        payload={pendingDriveConfirm}
        isSubmitting={isDriveBusy}
        onConfirm={handleConfirmDriveAction}
        onCancel={() => {
          if (!isDriveBusy) {
            setPendingDriveConfirm(null);
          }
        }}
      />

      <OfflineIndicator
        isOnline={isOnline}
        isSyncing={isSyncingOffline}
        pendingCount={countPendingItems(pendingSyncState)}
        needsDriveReauth={
          isOnline &&
          !hasDriveToken &&
          Boolean(linkedEmail) &&
          (pendingSyncState.pendingDriveSync || pendingSyncState.pendingDeleteMonths.length > 0)
        }
        syncNotice={autoSyncNotice}
        onSyncNowWithGoogle={() => {
          void handleAuthorizeDriveInApp(linkedEmail);
        }}
        onDismissNotice={() => setAutoSyncNotice('')}
      />
    </div>
  );
}
