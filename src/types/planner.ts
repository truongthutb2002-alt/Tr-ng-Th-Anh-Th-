export type CompletionStatus = 'pending' | 'in_progress' | 'completed' | 'absent';

export type IncomeReceivedStatus = 'received' | 'unreceived';

export type CalendarViewMode = 'month' | 'week' | 'day' | 'todo' | 'tuition';

export type TodoStatus = 'pending' | 'in_progress' | 'completed';

export type TodoPriority = 'default' | 'priority' | 'later' | 'yesterday';

export interface TodoItem {
  id: string;
  originId?: string;
  date: string; // YYYY-MM-DD
  title: string;
  notes?: string;
  status: TodoStatus;
  priority: TodoPriority;
  carriedFromDate?: string; // YYYY-MM-DD if pushed from previous day
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TodoInput {
  date: string;
  title: string;
  notes?: string;
  status: TodoStatus;
  priority: TodoPriority;
  originId?: string;
  carriedFromDate?: string;
}

export type DailyNoteKind = 'checklist' | 'text';

export interface DailyNoteItem {
  id: string;
  date: string; // YYYY-MM-DD
  kind: DailyNoteKind;
  content: string;
  checked?: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailyNoteInput {
  date: string;
  kind: DailyNoteKind;
  content: string;
  checked?: boolean;
}

export type TuitionSessionStatus = 'completed' | 'absent';

export interface TuitionSession {
  id: string;
  date: string; // YYYY-MM-DD
  content: string;
  status: TuitionSessionStatus;
  sourceTaskId?: string;
  sourceTaskSignature?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TuitionSessionInput {
  date: string;
  content: string;
  status: TuitionSessionStatus;
}

export interface StudentTuition {
  id: string;
  studentName: string;
  studySchedule: string;
  feePerSession: number;
  month: number; // 1 - 12
  themeColor: string; // hex color code
  sessions: TuitionSession[];
  dismissedSyncedTaskIds?: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudentTuitionInput {
  studentName: string;
  studySchedule: string;
  feePerSession: number;
  month?: number;
  themeColor?: string;
}

export interface UserAccount {
  id: string;
  username: string;
  phone: string;
  email?: string;
  normalizedUsername: string;
  normalizedPhone: string;
  workspaceId: string;
  lastLoginAt: string;
  createdAt: string;
}

export interface AuthSession {
  username: string;
  phone: string;
  email?: string;
  workspaceId: string;
  authMethod?: 'account' | 'google';
}

export interface DriveSyncMetadata {
  linkedEmail: string;
  folderId: string;
  folderName: string;
  fileId: string;
  lastSyncedAt: string;
  monthFolderCount?: number;
}

export interface PlannerTask {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  lessonName?: string;
  startTime: string; // HH:MM (24h, 15-min increments)
  endTime: string; // HH:MM (24h, 15-min increments)
  income: number; // VND
  status: CompletionStatus;
  isOff?: boolean;
  isAllDay?: boolean;
  color?: string; // Hex pastel color (#RRGGBB) or OFF_TASK_COLOR (#9CA3AF)
  notes: string;
  link: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskInput {
  date: string;
  title: string;
  lessonName?: string;
  startTime: string;
  endTime: string;
  income: number;
  status: CompletionStatus;
  isOff?: boolean;
  isAllDay?: boolean;
  color?: string;
  notes: string;
  link: string;
}

export interface IncomeEntry {
  id: string;
  month: string; // YYYY-MM
  sourceName: string;
  amount: number; // VND
  receivedStatus: IncomeReceivedStatus;
  syncedFromTasks?: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface IncomeInput {
  month: string;
  sourceName: string;
  amount: number;
  receivedStatus: IncomeReceivedStatus;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  createdTask?: PlannerTask | null;
}

export type ThemeMode = 'light' | 'dark';

export interface AppearanceSettings {
  themeMode: ThemeMode;
  backgroundColor: string; // Hex color (#RRGGBB)
}

export interface WorkspaceSnapshot {
  workspaceId: string;
  revision: number;
  lastSavedAt: string;
  lastEditedBy: string;
  tasks: PlannerTask[];
  incomes: IncomeEntry[];
  students?: StudentTuition[];
  todos?: TodoItem[];
  dailyNotes?: DailyNoteItem[];
  dailyGoals?: Record<string, string>;
  dismissedTodoCarryovers?: Record<string, string>;
  completedTodoCountsByDate?: Record<string, number>;
  appearance?: AppearanceSettings;
  avatarDataUrl?: string;
  monthlyIncomeTargets?: Record<string, number>;
  dailyIncomeTargets?: Record<string, number>;
  chatHistory?: ChatMessage[];
}
