import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { GoogleGenAI, Type } from '@google/genai';
import type {
  PlannerTask,
  WorkspaceSnapshot,
  CompletionStatus,
  IncomeEntry,
  IncomeReceivedStatus,
  StudentTuition,
  TuitionSession,
  TuitionSessionStatus,
  TodoItem,
  DailyNoteItem,
  UserAccount,
  ChatMessage,
} from './src/types/planner.ts';
import {
  validateTaskInput,
  validateIncomeInput,
  validateRegistrationInput,
  validateLoginInput,
  normalizeUsername,
  normalizePhoneNumber,
  buildAccountKey,
  resolveAccountWorkspaceId,
  summarizeIncome,
  syncWorkspaceIncomesWithTasks,
  formatCurrencyVnd,
  formatSlotLabel,
  ensureNonConflictingTaskColors,
  normalizeHexColor,
  OFF_TASK_COLOR,
  pickAvailablePastelColor,
  DEFAULT_APP_BACKGROUND_COLOR,
} from './src/utils/schedule.ts';
import {
  DEFAULT_TUITION_COLOR,
  syncWorkspaceStudentsWithTasks,
  validateStudentTuitionInput,
  validateTuitionSessionInput,
} from './src/utils/tuition.ts';
import {
  cleanupCarriedClonesAfterCompletion,
  getTodoOriginId,
  normalizeTodoPriority,
  normalizeTodoStatus,
  removeCompletedTodoFromList,
  syncTodoCarryoversUpToDate,
  validateTodoInput,
} from './src/utils/todo.ts';
import {
  normalizeAvatarDataUrl,
  validateAvatarDataUrl,
} from './src/utils/avatar.ts';
import {
  normalizeEmailAddress,
  parseDriveBackupPayload,
  resolveGoogleWorkspaceId,
  validateEmailInput,
} from './src/utils/snapshotSync.ts';
import {
  sanitizeDailyNoteFields,
  validateDailyNoteInput,
} from './src/utils/notes.ts';
import {
  clearMonthDataFromSnapshot,
  normalizeMonthKey,
} from './src/utils/offlineWorkspace.ts';

const PORT = Number(process.env.PORT || 3000);
const DEFAULT_WORKSPACE_ID = 'default-kitty-planner';
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'planner-db.json');

interface DatabaseSchema {
  workspaces: Record<string, WorkspaceSnapshot>;
  users?: Record<string, UserAccount>;
}

function getLocalTodayDateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function createEmptyWorkspace(workspaceId: string): WorkspaceSnapshot {
  return {
    workspaceId,
    revision: 1,
    lastSavedAt: new Date().toISOString(),
    lastEditedBy: 'Hệ thống',
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

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadDatabase(): DatabaseSchema {
  ensureDataDir();
  if (!fs.existsSync(DB_FILE)) {
    const initial: DatabaseSchema = {
      workspaces: {},
      users: {},
    };
    saveDatabaseAtomic(initial);
    return initial;
  }

  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as DatabaseSchema;
    if (!parsed || typeof parsed !== 'object' || !parsed.workspaces) {
      throw new Error('Invalid DB shape');
    }
    if (!parsed.users || typeof parsed.users !== 'object') {
      parsed.users = {};
    }
    return parsed;
  } catch (err) {
    console.error('Failed to read DB file, backing up and reinitializing:', err);
    if (fs.existsSync(DB_FILE)) {
      fs.copyFileSync(DB_FILE, `${DB_FILE}.corrupt.${Date.now()}`);
    }
    const fallback: DatabaseSchema = {
      workspaces: {},
      users: {},
    };
    saveDatabaseAtomic(fallback);
    return fallback;
  }
}

function saveDatabaseAtomic(db: DatabaseSchema): void {
  ensureDataDir();
  const tmpPath = `${DB_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(tmpPath, DB_FILE);
}

const dbState: DatabaseSchema = loadDatabase();

function getWorkspace(workspaceId = DEFAULT_WORKSPACE_ID): WorkspaceSnapshot {
  const safeId = workspaceId.trim() || DEFAULT_WORKSPACE_ID;
  if (!dbState.workspaces[safeId]) {
    dbState.workspaces[safeId] = createEmptyWorkspace(safeId);
    saveDatabaseAtomic(dbState);
  }
  const ws = dbState.workspaces[safeId];
  if (!Array.isArray(ws.tasks)) {
    ws.tasks = [];
    saveDatabaseAtomic(dbState);
  }
  if (!Array.isArray(ws.incomes)) {
    ws.incomes = [];
    saveDatabaseAtomic(dbState);
  }
  if (!Array.isArray(ws.students)) {
    ws.students = [];
    saveDatabaseAtomic(dbState);
  }
  if (!Array.isArray(ws.todos)) {
    ws.todos = [];
    saveDatabaseAtomic(dbState);
  }
  if (!Array.isArray(ws.dailyNotes)) {
    ws.dailyNotes = [];
    saveDatabaseAtomic(dbState);
  }
  if (!ws.dailyGoals || typeof ws.dailyGoals !== 'object') {
    ws.dailyGoals = {};
    saveDatabaseAtomic(dbState);
  }
  if (!ws.dismissedTodoCarryovers || typeof ws.dismissedTodoCarryovers !== 'object') {
    ws.dismissedTodoCarryovers = {};
    saveDatabaseAtomic(dbState);
  }
  if (!ws.completedTodoCountsByDate || typeof ws.completedTodoCountsByDate !== 'object') {
    ws.completedTodoCountsByDate = {};
    saveDatabaseAtomic(dbState);
  }
  if (!ws.appearance || typeof ws.appearance !== 'object') {
    ws.appearance = {
      themeMode: 'light',
      backgroundColor: DEFAULT_APP_BACKGROUND_COLOR,
    };
    saveDatabaseAtomic(dbState);
  } else {
    const validMode = ws.appearance.themeMode === 'dark' ? 'dark' : 'light';
    const validBg = normalizeHexColor(ws.appearance.backgroundColor) || DEFAULT_APP_BACKGROUND_COLOR;
    if (ws.appearance.themeMode !== validMode || ws.appearance.backgroundColor !== validBg) {
      ws.appearance = { themeMode: validMode, backgroundColor: validBg };
      saveDatabaseAtomic(dbState);
    }
  }
  const normalizedAvatar = normalizeAvatarDataUrl(ws.avatarDataUrl);
  if (ws.avatarDataUrl !== normalizedAvatar) {
    ws.avatarDataUrl = normalizedAvatar;
    saveDatabaseAtomic(dbState);
  }
  if (!ws.monthlyIncomeTargets || typeof ws.monthlyIncomeTargets !== 'object') {
    ws.monthlyIncomeTargets = {};
    saveDatabaseAtomic(dbState);
  }
  if (!ws.dailyIncomeTargets || typeof ws.dailyIncomeTargets !== 'object') {
    ws.dailyIncomeTargets = {};
    saveDatabaseAtomic(dbState);
  }
  if (!Array.isArray(ws.chatHistory)) {
    ws.chatHistory = [];
  }
  const coloredTasks = ensureNonConflictingTaskColors(ws.tasks);
  const syncedIncomes = syncWorkspaceIncomesWithTasks(coloredTasks, ws.incomes);
  const syncedStudents = syncWorkspaceStudentsWithTasks(coloredTasks, ws.students);
  const activeTodos = ws.todos.filter((item) => item.status !== 'completed');
  const syncedTodos = syncTodoCarryoversUpToDate(
    activeTodos,
    getLocalTodayDateKey(),
    ws.dismissedTodoCarryovers,
  );
  if (
    coloredTasks !== ws.tasks ||
    syncedIncomes !== ws.incomes ||
    syncedStudents !== ws.students ||
    activeTodos.length !== ws.todos.length ||
    syncedTodos !== activeTodos
  ) {
    ws.tasks = coloredTasks;
    ws.incomes = syncedIncomes;
    ws.students = syncedStudents;
    ws.todos = syncedTodos;
    saveDatabaseAtomic(dbState);
  }
  return ws;
}

function sanitizeTodoFields(body: Record<string, unknown>) {
  const date = typeof body.date === 'string' && body.date.trim() ? body.date.trim() : getLocalTodayDateKey();
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 240) : '';
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 1000) : '';
  const status = normalizeTodoStatus(body.status);
  const priority = normalizeTodoPriority(body.priority);
  const originId = typeof body.originId === 'string' && body.originId.trim() ? body.originId.trim() : undefined;
  const carriedFromDate =
    typeof body.carriedFromDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.carriedFromDate.trim())
      ? body.carriedFromDate.trim()
      : undefined;
  return { date, title, notes, status, priority, originId, carriedFromDate };
}

function normalizeStatus(status: unknown): CompletionStatus {
  if (
    status === 'completed' ||
    status === 'in_progress' ||
    status === 'pending' ||
    status === 'absent'
  ) {
    return status;
  }
  return 'pending';
}

function normalizeReceivedStatus(status: unknown): IncomeReceivedStatus {
  return status === 'received' ? 'received' : 'unreceived';
}

function sanitizeIncomeFields(body: Record<string, unknown>) {
  const month =
    typeof body.month === 'string' && body.month.trim()
      ? body.month.trim()
      : getLocalTodayDateKey().slice(0, 7);
  const sourceName = typeof body.sourceName === 'string' ? body.sourceName.trim().slice(0, 120) : '';
  const rawAmount = Number(body.amount ?? 0);
  const amount = Number.isFinite(rawAmount) && rawAmount >= 0 ? Math.round(rawAmount) : -1;
  const receivedStatus = normalizeReceivedStatus(body.receivedStatus);
  return { month, sourceName, amount, receivedStatus };
}

function sanitizeTaskFields(body: Record<string, unknown>) {
  const isOff = Boolean(body.isOff);
  const isAllDay = Boolean(body.isAllDay);
  const date = typeof body.date === 'string' ? body.date.trim() : getLocalTodayDateKey();
  const rawTitle = typeof body.title === 'string' ? body.title.trim().slice(0, 140) : '';
  const title = isOff ? (rawTitle || 'Off') : rawTitle;
  const lessonName = isOff
    ? ''
    : typeof body.lessonName === 'string'
      ? body.lessonName.trim().slice(0, 300)
      : '';
  const startTime = isAllDay
    ? '06:00'
    : typeof body.startTime === 'string'
      ? body.startTime.trim()
      : '';
  const endTime = isAllDay
    ? '24:00'
    : typeof body.endTime === 'string'
      ? body.endTime.trim()
      : '';
  const rawIncome = Number(body.income ?? 0);
  const income = isOff
    ? 0
    : Number.isFinite(rawIncome) && rawIncome >= 0
      ? Math.round(rawIncome)
      : -1;
  const status = isOff ? 'pending' : normalizeStatus(body.status);
  const rawColor = typeof body.color === 'string' ? body.color.trim() : '';
  const color = isOff ? OFF_TASK_COLOR : rawColor ? (normalizeHexColor(rawColor) ?? rawColor) : '';
  const notes = isOff
    ? ''
    : typeof body.notes === 'string'
      ? body.notes.trim().slice(0, 1000)
      : '';
  const link = isOff
    ? ''
    : typeof body.link === 'string'
      ? body.link.trim().slice(0, 500)
      : '';
  return {
    date,
    title,
    lessonName,
    startTime,
    endTime,
    income,
    status,
    isOff,
    isAllDay,
    color,
    notes,
    link,
  };
}

function normalizeTuitionStatus(status: unknown): TuitionSessionStatus {
  return status === 'absent' ? 'absent' : 'completed';
}

function sanitizeStudentFields(body: Record<string, unknown>) {
  const studentName =
    typeof body.studentName === 'string' ? body.studentName.trim().slice(0, 100) : '';
  const studySchedule =
    typeof body.studySchedule === 'string' ? body.studySchedule.trim().slice(0, 160) : '';
  const rawFee = Number(body.feePerSession ?? 0);
  const feePerSession = Number.isFinite(rawFee) && rawFee >= 0 ? Math.round(rawFee) : -1;
  const rawMonth =
    body.month !== undefined ? Number(body.month) : new Date().getMonth() + 1;
  const month = Number.isInteger(rawMonth) ? rawMonth : -1;
  const rawColor = typeof body.themeColor === 'string' ? body.themeColor.trim() : '';
  const themeColor = /^#[0-9a-f]{6}$/i.test(rawColor) ? rawColor : DEFAULT_TUITION_COLOR;
  return { studentName, studySchedule, feePerSession, month, themeColor };
}

function sanitizeTuitionSessionFields(body: Record<string, unknown>) {
  const date = typeof body.date === 'string' ? body.date.trim() : getLocalTodayDateKey();
  const content = typeof body.content === 'string' ? body.content.trim().slice(0, 300) : '';
  const status = normalizeTuitionStatus(body.status);
  return { date, content, status };
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function buildFallbackAssistantReply(
  message: string,
  tasks: PlannerTask[],
  selectedDate: string,
): { reply: string; createTaskData?: { title: string; date: string; startTime: string; endTime: string; income: number; status: CompletionStatus; notes: string; link: string } } {
  const lower = message.toLowerCase();
  const dayTasks = tasks.filter((t) => t.date === selectedDate);
  const daySummary = summarizeIncome(dayTasks);
  const totalSummary = summarizeIncome(tasks);

  // Simple Vietnamese command detection for adding a task
  const addMatch = /(?:thêm|tạo|nhắc|lên lịch)\s+(?:task\s+)?(.+?)\s+(?:từ|lúc)\s+(\d{1,2})(?:h|:)?(\d{0,2})\s+(?:đến|tới|-)\s+(\d{1,2})(?:h|:)?(\d{0,2})/i.exec(message);
  if (addMatch) {
    const rawTitle = addMatch[1].trim();
    const sh = String(Number(addMatch[2])).padStart(2, '0');
    const sm = String(Number(addMatch[3] || 0)).padStart(2, '0');
    const eh = String(Number(addMatch[4])).padStart(2, '0');
    const em = String(Number(addMatch[5] || 0)).padStart(2, '0');
    const incomeMatch = /(\d+(?:[.,]\d+)?)\s*(k|nghìn|ngàn|tr|triệu|đ|vnd)?/i.exec(
      message.slice(addMatch.index + addMatch[0].length),
    );
    let parsedIncome = 0;
    if (incomeMatch) {
      const base = Number(incomeMatch[1].replace(',', '.'));
      const unit = (incomeMatch[2] || '').toLowerCase();
      if (unit === 'k' || unit === 'nghìn' || unit === 'ngàn') parsedIncome = Math.round(base * 1000);
      else if (unit === 'tr' || unit === 'triệu') parsedIncome = Math.round(base * 1000000);
      else parsedIncome = Math.round(base);
    }
    return {
      reply: `Meow! Kitty đã thêm task "${rawTitle}" vào ngày ${selectedDate} (${sh}:${sm} – ${eh}:${em}) với thu nhập ${formatCurrencyVnd(parsedIncome)} và sao lưu lên hệ thống rồi nhé!`,
      createTaskData: {
        title: rawTitle,
        date: selectedDate,
        startTime: `${sh}:${sm}`,
        endTime: `${eh}:${em}`,
        income: parsedIncome,
        status: 'pending',
        notes: 'Tạo qua Kitty Chatbot',
        link: '',
      },
    };
  }

  if (lower.includes('thu nhập') || lower.includes('tiền') || lower.includes('doanh thu')) {
    return {
      reply: `Hôm nay (${selectedDate}) bạn có ${dayTasks.length} task với tổng thu nhập dự kiến ${formatCurrencyVnd(daySummary.total)} (đã hoàn thành: ${formatCurrencyVnd(daySummary.completed)}). Toàn bộ lịch đã lưu đang có tổng thu nhập ${formatCurrencyVnd(totalSummary.total)}.`,
    };
  }

  if (dayTasks.length === 0) {
    return {
      reply: `Ngày ${selectedDate} hiện chưa có task nào. Bạn có thể bấm "+ Thêm Task" hoặc nhắn cho Kitty kiểu: "Thêm task Họp nhóm từ 9h đến 10h thu nhập 300k" để Kitty lưu ngay giúp bạn nha!`,
    };
  }

  const lines = dayTasks
    .slice(0, 5)
    .map((t) => `• ${formatSlotLabel(t.startTime)}–${formatSlotLabel(t.endTime)}: ${t.title} (${formatCurrencyVnd(t.income)})`)
    .join('\n');
  return {
    reply: `Lịch ngày ${selectedDate} của bạn hiện có ${dayTasks.length} task:\n${lines}\nTổng thu nhập ngày: ${formatCurrencyVnd(daySummary.total)}. Mọi thay đổi đều được sao lưu tự động trên cơ sở dữ liệu!`,
  };
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  // Create a new account (username + phone + confirmPhone + optional email) with private data storage
  app.post('/api/auth/register', (req, res) => {
    const body = (req.body || {}) as {
      username?: string;
      phone?: string;
      confirmPhone?: string;
      email?: string;
    };
    const username = (body.username || '').trim();
    const phone = (body.phone || '').trim();
    const confirmPhone = (body.confirmPhone || '').trim();
    const email = (body.email || '').trim();

    const errors = validateRegistrationInput({ username, phone, confirmPhone });
    const emailErr = validateEmailInput(email);
    if (emailErr) errors.email = emailErr;
    if (Object.keys(errors).length > 0) {
      const firstErr = Object.values(errors)[0];
      res.status(400).json({ error: firstErr, fields: errors });
      return;
    }

    if (!dbState.users) {
      dbState.users = {};
    }

    const normalizedUsername = normalizeUsername(username);
    const normalizedPhone = normalizePhoneNumber(phone);
    const normalizedEmail = email ? normalizeEmailAddress(email) : '';
    const accountKey = buildAccountKey(username, phone);

    if (dbState.users[accountKey]) {
      res.status(409).json({
        error: 'Tài khoản này đã tồn tại. Vui lòng chuyển sang tab Đăng nhập.',
      });
      return;
    }

    const nowIso = new Date().toISOString();
    const workspaceId = resolveAccountWorkspaceId(username, phone);
    const user: UserAccount = {
      id: `usr-${crypto.randomUUID()}`,
      username,
      phone: normalizedPhone,
      ...(normalizedEmail ? { email: normalizedEmail } : {}),
      normalizedUsername,
      normalizedPhone,
      workspaceId,
      lastLoginAt: nowIso,
      createdAt: nowIso,
    };
    dbState.users[accountKey] = user;

    const snapshot = getWorkspace(workspaceId);
    saveDatabaseAtomic(dbState);

    res.status(201).json({ user, workspaceId, snapshot });
  });

  // Sign in with registered username + phone (+ optional email update) and load that account's isolated snapshot
  app.post('/api/auth/login', (req, res) => {
    const body = (req.body || {}) as { username?: string; phone?: string; email?: string };
    const username = (body.username || '').trim();
    const phone = (body.phone || '').trim();
    const email = (body.email || '').trim();

    const errors = validateLoginInput({ username, phone });
    const emailErr = validateEmailInput(email);
    if (emailErr) errors.email = emailErr;
    if (Object.keys(errors).length > 0) {
      const firstErr = Object.values(errors)[0];
      res.status(400).json({ error: firstErr, fields: errors });
      return;
    }

    if (!dbState.users) {
      dbState.users = {};
    }

    const normalizedUsername = normalizeUsername(username);
    const normalizedEmail = email ? normalizeEmailAddress(email) : '';
    const accountKey = buildAccountKey(username, phone);
    const existing = dbState.users[accountKey];

    if (!existing) {
      const hasUsernameMatch = Object.values(dbState.users).some(
        (u) => u && u.normalizedUsername === normalizedUsername && Boolean(u.normalizedPhone),
      );
      if (hasUsernameMatch) {
        res.status(401).json({
          error: 'Số điện thoại không khớp với tên đăng nhập này.',
        });
        return;
      }
      res.status(404).json({
        error: 'Tài khoản chưa tồn tại. Vui lòng chọn Tạo tài khoản trước.',
      });
      return;
    }

    const nowIso = new Date().toISOString();
    existing.lastLoginAt = nowIso;
    if (normalizedEmail) {
      existing.email = normalizedEmail;
    }
    dbState.users[accountKey] = existing;

    const snapshot = getWorkspace(existing.workspaceId);
    saveDatabaseAtomic(dbState);

    res.json({ user: existing, workspaceId: existing.workspaceId, snapshot });
  });

  // Sign in / resolve workspace for Google-authenticated user (never wipes existing data)
  app.post('/api/auth/google', (req, res) => {
    const body = (req.body || {}) as {
      email?: string;
      displayName?: string;
      preferredWorkspaceId?: string;
    };
    const email = normalizeEmailAddress(body.email || '');
    const emailErr = validateEmailInput(email, { required: true });
    if (emailErr) {
      res.status(400).json({ error: emailErr });
      return;
    }

    if (!dbState.users) {
      dbState.users = {};
    }

    const displayName = (body.displayName || '').trim() || email.split('@')[0] || 'Người dùng';
    const preferredWorkspaceId = (body.preferredWorkspaceId || '').trim();
    const accountKey = `google::${email}`;
    const existing = dbState.users[accountKey];
    const workspaceId =
      preferredWorkspaceId || existing?.workspaceId || resolveGoogleWorkspaceId(email);
    const nowIso = new Date().toISOString();

    const user: UserAccount = existing
      ? {
          ...existing,
          username: existing.username || displayName,
          email,
          workspaceId,
          lastLoginAt: nowIso,
        }
      : {
          id: `usr-${crypto.randomUUID()}`,
          username: displayName,
          phone: '',
          email,
          normalizedUsername: normalizeUsername(displayName),
          normalizedPhone: '',
          workspaceId,
          lastLoginAt: nowIso,
          createdAt: nowIso,
        };

    dbState.users[accountKey] = user;
    const snapshot = getWorkspace(workspaceId);
    saveDatabaseAtomic(dbState);

    res.json({ user, workspaceId, snapshot });
  });

  // Update logged-in account profile (username, phone, Google Drive email) WITHOUT losing workspace data
  app.put('/api/auth/profile', (req, res) => {
    const body = (req.body || {}) as {
      workspaceId?: string;
      newUsername?: string;
      newPhone?: string;
      newEmail?: string;
    };

    const workspaceId = (body.workspaceId || '').trim();
    const newUsername = (body.newUsername || '').trim();
    const newPhoneRaw = (body.newPhone || '').trim();
    const newEmailRaw = (body.newEmail || '').trim();

    if (!workspaceId) {
      res.status(400).json({ error: 'Không xác định được tài khoản cần cập nhật.' });
      return;
    }

    if (!newUsername || newUsername.length < 2) {
      res.status(400).json({ error: 'Tên đăng nhập phải có ít nhất 2 ký tự.' });
      return;
    }

    const emailErr = validateEmailInput(newEmailRaw);
    if (emailErr) {
      res.status(400).json({ error: emailErr });
      return;
    }

    if (!dbState.users) {
      dbState.users = {};
    }

    const existingEntry = Object.entries(dbState.users).find(
      ([, u]) => u && u.workspaceId === workspaceId,
    );
    const existingUser = existingEntry?.[1];
    const isGoogleOnlyNoPhone = Boolean(
      existingUser && !existingUser.normalizedPhone && !newPhoneRaw,
    );

    let normalizedPhone = '';
    if (!isGoogleOnlyNoPhone) {
      const loginErrs = validateLoginInput({ username: newUsername, phone: newPhoneRaw });
      if (loginErrs.username || loginErrs.phone) {
        res.status(400).json({ error: loginErrs.username || loginErrs.phone });
        return;
      }
      normalizedPhone = normalizePhoneNumber(newPhoneRaw);
    }

    const normalizedUsername = normalizeUsername(newUsername);
    const normalizedEmail = newEmailRaw ? normalizeEmailAddress(newEmailRaw) : '';
    const isGoogleKey = existingEntry?.[0]?.startsWith('google::');
    const nextAccountKey =
      isGoogleKey && !normalizedPhone && normalizedEmail
        ? `google::${normalizedEmail}`
        : normalizedPhone
          ? buildAccountKey(newUsername, normalizedPhone)
          : existingEntry?.[0] || `google::${normalizedEmail || workspaceId}`;

    const conflicting = dbState.users[nextAccountKey];
    if (conflicting && conflicting.workspaceId !== workspaceId) {
      res.status(409).json({
        error: 'Tên đăng nhập và số điện thoại này đã thuộc về một tài khoản khác.',
      });
      return;
    }

    const nowIso = new Date().toISOString();
    const updatedUser: UserAccount = {
      id: existingUser?.id || `usr-${crypto.randomUUID()}`,
      username: newUsername,
      phone: normalizedPhone,
      ...(normalizedEmail ? { email: normalizedEmail } : {}),
      normalizedUsername,
      normalizedPhone,
      workspaceId,
      lastLoginAt: nowIso,
      createdAt: existingUser?.createdAt || nowIso,
    };

    if (existingEntry && existingEntry[0] !== nextAccountKey) {
      delete dbState.users[existingEntry[0]];
    }
    dbState.users[nextAccountKey] = updatedUser;

    const ws = getWorkspace(workspaceId);
    ws.lastEditedBy = newUsername;
    ws.lastSavedAt = nowIso;
    ws.revision += 1;
    saveDatabaseAtomic(dbState);

    res.json({ user: updatedUser, workspaceId, snapshot: ws });
  });

  // Read latest snapshot from DB
  app.get('/api/tasks', (req, res) => {
    const workspaceId =
      typeof req.query.workspaceId === 'string' && req.query.workspaceId.trim()
        ? req.query.workspaceId.trim()
        : DEFAULT_WORKSPACE_ID;
    const snapshot = getWorkspace(workspaceId);
    res.json(snapshot);
  });

  // Create task & persist immediately
  app.post('/api/tasks', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const workspaceId =
      typeof body.workspaceId === 'string' && body.workspaceId.trim()
        ? body.workspaceId.trim()
        : DEFAULT_WORKSPACE_ID;
    const actor = typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim() : 'Người dùng';

    const ws = getWorkspace(workspaceId);
    const bgHex = ws.appearance?.backgroundColor;
    const rawInput = sanitizeTaskFields(body);
    const resolvedColor = rawInput.isOff
      ? OFF_TASK_COLOR
      : rawInput.color || pickAvailablePastelColor(ws.tasks, rawInput, undefined, 0, bgHex);
    const input = { ...rawInput, color: resolvedColor };

    const errors = validateTaskInput(input, ws.tasks, undefined, bgHex);
    if (Object.keys(errors).length > 0) {
      const firstError =
        errors.endTime || errors.startTime || errors.color || Object.values(errors)[0] || 'Dữ liệu không hợp lệ.';
      res.status(400).json({ error: firstError, fields: errors });
      return;
    }

    const nowIso = new Date().toISOString();
    const newTask: PlannerTask = {
      id: typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `task-${crypto.randomUUID()}`,
      ...input,
      createdBy: actor,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    ws.tasks = [...ws.tasks, newTask];
    ws.incomes = syncWorkspaceIncomesWithTasks(ws.tasks, ws.incomes, nowIso);
    ws.students = syncWorkspaceStudentsWithTasks(ws.tasks, ws.students || [], nowIso);
    ws.revision += 1;
    ws.lastSavedAt = nowIso;
    ws.lastEditedBy = actor;
    saveDatabaseAtomic(dbState);

    res.status(201).json({ task: newTask, snapshot: ws });
  });

  // Update task & persist immediately
  app.put('/api/tasks/:id', (req, res) => {
    const taskId = req.params.id;
    const body = (req.body || {}) as Record<string, unknown>;
    const workspaceId =
      typeof body.workspaceId === 'string' && body.workspaceId.trim()
        ? body.workspaceId.trim()
        : DEFAULT_WORKSPACE_ID;
    const actor = typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim() : 'Người dùng';

    const ws = getWorkspace(workspaceId);
    const existingIdx = ws.tasks.findIndex((t) => t.id === taskId);
    if (existingIdx < 0) {
      res.status(404).json({ error: 'Không tìm thấy task để cập nhật.' });
      return;
    }

    const existing = ws.tasks[existingIdx];
    const nextIsOff = body.isOff !== undefined ? Boolean(body.isOff) : Boolean(existing.isOff);
    const nextIsAllDay =
      body.isAllDay !== undefined ? Boolean(body.isAllDay) : Boolean(existing.isAllDay);
    const mergedRaw = sanitizeTaskFields({
      date: body.date ?? existing.date,
      title: body.title ?? (nextIsOff ? 'Off' : existing.title),
      lessonName: body.lessonName ?? existing.lessonName ?? '',
      startTime: body.startTime ?? existing.startTime,
      endTime: body.endTime ?? existing.endTime,
      income: body.income ?? existing.income,
      status: body.status ?? existing.status,
      isOff: nextIsOff,
      isAllDay: nextIsAllDay,
      color:
        nextIsOff
          ? OFF_TASK_COLOR
          : body.color ?? (existing.color === OFF_TASK_COLOR ? '' : existing.color ?? ''),
      notes: body.notes ?? existing.notes,
      link: body.link ?? existing.link,
    });
    const bgHex = ws.appearance?.backgroundColor;
    const merged = {
      ...mergedRaw,
      color: mergedRaw.isOff
        ? OFF_TASK_COLOR
        : mergedRaw.color || pickAvailablePastelColor(ws.tasks, mergedRaw, taskId, 0, bgHex),
    };

    const isScheduleOrColorChange =
      body.color !== undefined ||
      body.isOff !== undefined ||
      body.isAllDay !== undefined ||
      body.date !== undefined ||
      body.startTime !== undefined ||
      body.endTime !== undefined;
    const errors = validateTaskInput(
      merged,
      isScheduleOrColorChange ? ws.tasks : undefined,
      taskId,
      bgHex,
    );
    if (Object.keys(errors).length > 0) {
      const firstError =
        errors.endTime || errors.startTime || errors.color || Object.values(errors)[0] || 'Dữ liệu không hợp lệ.';
      res.status(400).json({ error: firstError, fields: errors });
      return;
    }

    const nowIso = new Date().toISOString();
    const updatedTask: PlannerTask = {
      ...existing,
      ...merged,
      createdBy: actor,
      updatedAt: nowIso,
    };

    const nextTasks = [...ws.tasks];
    nextTasks[existingIdx] = updatedTask;
    ws.tasks = nextTasks;
    ws.incomes = syncWorkspaceIncomesWithTasks(ws.tasks, ws.incomes, nowIso);
    const undismissedStudents = (ws.students || []).map((st) =>
      st.dismissedSyncedTaskIds?.includes(taskId)
        ? {
            ...st,
            dismissedSyncedTaskIds: st.dismissedSyncedTaskIds.filter((id) => id !== taskId),
          }
        : st,
    );
    ws.students = syncWorkspaceStudentsWithTasks(ws.tasks, undismissedStudents, nowIso);
    ws.revision += 1;
    ws.lastSavedAt = nowIso;
    ws.lastEditedBy = actor;
    saveDatabaseAtomic(dbState);

    res.json({ task: updatedTask, snapshot: ws });
  });

  // Delete task & persist immediately
  app.delete('/api/tasks/:id', (req, res) => {
    const taskId = req.params.id;
    const workspaceId =
      typeof req.query.workspaceId === 'string' && req.query.workspaceId.trim()
        ? req.query.workspaceId.trim()
        : DEFAULT_WORKSPACE_ID;
    const actor =
      typeof req.query.actor === 'string' && req.query.actor.trim()
        ? req.query.actor.trim()
        : 'Người dùng';

    const ws = getWorkspace(workspaceId);
    const filtered = ws.tasks.filter((t) => t.id !== taskId);
    if (filtered.length === ws.tasks.length) {
      res.status(404).json({ error: 'Task không tồn tại.' });
      return;
    }

    const nowIso = new Date().toISOString();
    ws.tasks = filtered;
    ws.incomes = syncWorkspaceIncomesWithTasks(ws.tasks, ws.incomes, nowIso);
    ws.students = syncWorkspaceStudentsWithTasks(ws.tasks, ws.students || [], nowIso);
    ws.revision += 1;
    ws.lastSavedAt = nowIso;
    ws.lastEditedBy = actor;
    saveDatabaseAtomic(dbState);

    res.json({ deletedId: taskId, snapshot: ws });
  });

  // Create income category entry
  app.post('/api/incomes', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const workspaceId =
      typeof body.workspaceId === 'string' && body.workspaceId.trim()
        ? body.workspaceId.trim()
        : DEFAULT_WORKSPACE_ID;
    const actor = typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim() : 'Người dùng';

    const input = sanitizeIncomeFields(body);
    const errors = validateIncomeInput(input);
    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: 'Dữ liệu nguồn thu không hợp lệ.', fields: errors });
      return;
    }

    const ws = getWorkspace(workspaceId);
    const nowIso = new Date().toISOString();
    const newIncome: IncomeEntry = {
      id: `inc-${crypto.randomUUID()}`,
      ...input,
      createdBy: actor,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    ws.incomes = syncWorkspaceIncomesWithTasks(ws.tasks, [newIncome, ...ws.incomes], nowIso);
    const savedIncome = ws.incomes.find((item) => item.id === newIncome.id) || newIncome;
    ws.revision += 1;
    ws.lastSavedAt = nowIso;
    ws.lastEditedBy = actor;
    saveDatabaseAtomic(dbState);

    res.status(201).json({ income: savedIncome, snapshot: ws });
  });

  // Update income category entry (e.g. toggle Đã thu / Chưa thu or edit amount)
  app.put('/api/incomes/:id', (req, res) => {
    const incomeId = req.params.id;
    const body = (req.body || {}) as Record<string, unknown>;
    const workspaceId =
      typeof body.workspaceId === 'string' && body.workspaceId.trim()
        ? body.workspaceId.trim()
        : DEFAULT_WORKSPACE_ID;
    const actor = typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim() : 'Người dùng';

    const ws = getWorkspace(workspaceId);
    const idx = ws.incomes.findIndex((item) => item.id === incomeId);
    if (idx < 0) {
      res.status(404).json({ error: 'Không tìm thấy nguồn thu để cập nhật.' });
      return;
    }

    const existing = ws.incomes[idx];
    const merged = sanitizeIncomeFields({
      month: body.month ?? existing.month,
      sourceName: body.sourceName ?? existing.sourceName,
      amount: body.amount ?? existing.amount,
      receivedStatus: body.receivedStatus ?? existing.receivedStatus,
    });

    const errors = validateIncomeInput(merged);
    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: 'Dữ liệu nguồn thu không hợp lệ.', fields: errors });
      return;
    }

    const nowIso = new Date().toISOString();
    const updated: IncomeEntry = {
      ...existing,
      ...merged,
      createdBy: actor,
      updatedAt: nowIso,
    };

    const nextIncomes = [...ws.incomes];
    nextIncomes[idx] = updated;
    ws.incomes = syncWorkspaceIncomesWithTasks(ws.tasks, nextIncomes, nowIso);
    const savedIncome = ws.incomes.find((item) => item.id === incomeId) || updated;
    ws.revision += 1;
    ws.lastSavedAt = nowIso;
    ws.lastEditedBy = actor;
    saveDatabaseAtomic(dbState);

    res.json({ income: savedIncome, snapshot: ws });
  });

  // Delete income category entry
  app.delete('/api/incomes/:id', (req, res) => {
    const incomeId = req.params.id;
    const workspaceId =
      typeof req.query.workspaceId === 'string' && req.query.workspaceId.trim()
        ? req.query.workspaceId.trim()
        : DEFAULT_WORKSPACE_ID;
    const actor =
      typeof req.query.actor === 'string' && req.query.actor.trim()
        ? req.query.actor.trim()
        : 'Người dùng';

    const ws = getWorkspace(workspaceId);
    const filtered = ws.incomes.filter((item) => item.id !== incomeId);
    if (filtered.length === ws.incomes.length) {
      res.status(404).json({ error: 'Nguồn thu không tồn tại.' });
      return;
    }

    const nowIso = new Date().toISOString();
    ws.incomes = filtered;
    ws.revision += 1;
    ws.lastSavedAt = nowIso;
    ws.lastEditedBy = actor;
    saveDatabaseAtomic(dbState);

    res.json({ deletedId: incomeId, snapshot: ws });
  });

  // Create student tuition sheet
  app.post('/api/students', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const workspaceId =
      typeof body.workspaceId === 'string' && body.workspaceId.trim()
        ? body.workspaceId.trim()
        : DEFAULT_WORKSPACE_ID;
    const actor = typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim() : 'Người dùng';

    const input = sanitizeStudentFields(body);
    const errors = validateStudentTuitionInput(input);
    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: 'Thông tin học sinh không hợp lệ.', fields: errors });
      return;
    }

    const ws = getWorkspace(workspaceId);
    const nowIso = new Date().toISOString();
    const newStudent: StudentTuition = {
      id: `stu-${crypto.randomUUID()}`,
      ...input,
      sessions: [],
      createdBy: actor,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    ws.students = syncWorkspaceStudentsWithTasks(
      ws.tasks,
      [...(ws.students || []), newStudent],
      nowIso,
    );
    const savedStudent = ws.students.find((s) => s.id === newStudent.id) || newStudent;
    ws.revision += 1;
    ws.lastSavedAt = nowIso;
    ws.lastEditedBy = actor;
    saveDatabaseAtomic(dbState);

    res.status(201).json({ student: savedStudent, snapshot: ws });
  });

  // Update student general info
  app.put('/api/students/:id', (req, res) => {
    const studentId = req.params.id;
    const body = (req.body || {}) as Record<string, unknown>;
    const workspaceId =
      typeof body.workspaceId === 'string' && body.workspaceId.trim()
        ? body.workspaceId.trim()
        : DEFAULT_WORKSPACE_ID;
    const actor = typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim() : 'Người dùng';

    const ws = getWorkspace(workspaceId);
    const students = ws.students || [];
    const idx = students.findIndex((s) => s.id === studentId);
    if (idx < 0) {
      res.status(404).json({ error: 'Không tìm thấy học sinh để cập nhật.' });
      return;
    }

    const existing = students[idx];
    const merged = sanitizeStudentFields({
      studentName: body.studentName ?? existing.studentName,
      studySchedule: body.studySchedule ?? existing.studySchedule,
      feePerSession: body.feePerSession ?? existing.feePerSession,
      month: body.month ?? existing.month,
      themeColor: body.themeColor ?? existing.themeColor,
    });

    const errors = validateStudentTuitionInput(merged);
    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: 'Thông tin học sinh không hợp lệ.', fields: errors });
      return;
    }

    const nowIso = new Date().toISOString();
    const updated: StudentTuition = {
      ...existing,
      ...merged,
      updatedAt: nowIso,
    };

    const nextStudents = [...students];
    nextStudents[idx] = updated;
    ws.students = syncWorkspaceStudentsWithTasks(ws.tasks, nextStudents, nowIso);
    const savedStudent = ws.students.find((s) => s.id === studentId) || updated;
    ws.revision += 1;
    ws.lastSavedAt = nowIso;
    ws.lastEditedBy = actor;
    saveDatabaseAtomic(dbState);

    res.json({ student: savedStudent, snapshot: ws });
  });

  // Delete student tuition sheet
  app.delete('/api/students/:id', (req, res) => {
    const studentId = req.params.id;
    const workspaceId =
      typeof req.query.workspaceId === 'string' && req.query.workspaceId.trim()
        ? req.query.workspaceId.trim()
        : DEFAULT_WORKSPACE_ID;
    const actor =
      typeof req.query.actor === 'string' && req.query.actor.trim()
        ? req.query.actor.trim()
        : 'Người dùng';

    const ws = getWorkspace(workspaceId);
    const students = ws.students || [];
    const filtered = students.filter((s) => s.id !== studentId);
    if (filtered.length === students.length) {
      res.status(404).json({ error: 'Học sinh không tồn tại.' });
      return;
    }

    const nowIso = new Date().toISOString();
    ws.students = filtered;
    ws.revision += 1;
    ws.lastSavedAt = nowIso;
    ws.lastEditedBy = actor;
    saveDatabaseAtomic(dbState);

    res.json({ deletedId: studentId, snapshot: ws });
  });

  // Add lesson session to a student's tuition sheet
  app.post('/api/students/:id/sessions', (req, res) => {
    const studentId = req.params.id;
    const body = (req.body || {}) as Record<string, unknown>;
    const workspaceId =
      typeof body.workspaceId === 'string' && body.workspaceId.trim()
        ? body.workspaceId.trim()
        : DEFAULT_WORKSPACE_ID;
    const actor = typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim() : 'Người dùng';

    const ws = getWorkspace(workspaceId);
    const students = ws.students || [];
    const idx = students.findIndex((s) => s.id === studentId);
    if (idx < 0) {
      res.status(404).json({ error: 'Không tìm thấy học sinh.' });
      return;
    }

    const input = sanitizeTuitionSessionFields(body);
    const errors = validateTuitionSessionInput(input);
    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: 'Dữ liệu buổi học không hợp lệ.', fields: errors });
      return;
    }

    const nowIso = new Date().toISOString();
    const newSession: TuitionSession = {
      id: `ses-${crypto.randomUUID()}`,
      ...input,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const existing = students[idx];
    const updatedStudent: StudentTuition = {
      ...existing,
      sessions: [...existing.sessions, newSession],
      updatedAt: nowIso,
    };

    const nextStudents = [...students];
    nextStudents[idx] = updatedStudent;
    ws.students = nextStudents;
    ws.revision += 1;
    ws.lastSavedAt = nowIso;
    ws.lastEditedBy = actor;
    saveDatabaseAtomic(dbState);

    res.status(201).json({ session: newSession, student: updatedStudent, snapshot: ws });
  });

  // Update lesson session (date, content, or status: completed / absent)
  app.put('/api/students/:id/sessions/:sessionId', (req, res) => {
    const { id: studentId, sessionId } = req.params;
    const body = (req.body || {}) as Record<string, unknown>;
    const workspaceId =
      typeof body.workspaceId === 'string' && body.workspaceId.trim()
        ? body.workspaceId.trim()
        : DEFAULT_WORKSPACE_ID;
    const actor = typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim() : 'Người dùng';

    const ws = getWorkspace(workspaceId);
    const students = ws.students || [];
    const idx = students.findIndex((s) => s.id === studentId);
    if (idx < 0) {
      res.status(404).json({ error: 'Không tìm thấy học sinh.' });
      return;
    }

    const existingStudent = students[idx];
    const sIdx = existingStudent.sessions.findIndex((ses) => ses.id === sessionId);
    if (sIdx < 0) {
      res.status(404).json({ error: 'Không tìm thấy buổi học để cập nhật.' });
      return;
    }

    const existingSession = existingStudent.sessions[sIdx];
    const merged = sanitizeTuitionSessionFields({
      date: body.date ?? existingSession.date,
      content: body.content ?? existingSession.content,
      status: body.status ?? existingSession.status,
    });

    const errors = validateTuitionSessionInput(merged);
    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: 'Dữ liệu buổi học không hợp lệ.', fields: errors });
      return;
    }

    const nowIso = new Date().toISOString();
    const updatedSession: TuitionSession = {
      ...existingSession,
      ...merged,
      updatedAt: nowIso,
    };

    const nextSessions = [...existingStudent.sessions];
    nextSessions[sIdx] = updatedSession;
    const updatedStudent: StudentTuition = {
      ...existingStudent,
      sessions: nextSessions,
      updatedAt: nowIso,
    };

    const nextStudents = [...students];
    nextStudents[idx] = updatedStudent;
    ws.students = nextStudents;
    ws.revision += 1;
    ws.lastSavedAt = nowIso;
    ws.lastEditedBy = actor;
    saveDatabaseAtomic(dbState);

    res.json({ session: updatedSession, student: updatedStudent, snapshot: ws });
  });

  // Delete lesson session
  app.delete('/api/students/:id/sessions/:sessionId', (req, res) => {
    const { id: studentId, sessionId } = req.params;
    const workspaceId =
      typeof req.query.workspaceId === 'string' && req.query.workspaceId.trim()
        ? req.query.workspaceId.trim()
        : DEFAULT_WORKSPACE_ID;
    const actor =
      typeof req.query.actor === 'string' && req.query.actor.trim()
        ? req.query.actor.trim()
        : 'Người dùng';

    const ws = getWorkspace(workspaceId);
    const students = ws.students || [];
    const idx = students.findIndex((s) => s.id === studentId);
    if (idx < 0) {
      res.status(404).json({ error: 'Không tìm thấy học sinh.' });
      return;
    }

    const existingStudent = students[idx];
    const targetSession = existingStudent.sessions.find((ses) => ses.id === sessionId);
    if (!targetSession) {
      res.status(404).json({ error: 'Buổi học không tồn tại.' });
      return;
    }
    const filteredSessions = existingStudent.sessions.filter((ses) => ses.id !== sessionId);
    const nextDismissed = targetSession.sourceTaskId
      ? Array.from(
          new Set([
            ...(existingStudent.dismissedSyncedTaskIds ?? []),
            targetSession.sourceTaskId,
          ]),
        )
      : existingStudent.dismissedSyncedTaskIds;

    const nowIso = new Date().toISOString();
    const updatedStudent: StudentTuition = {
      ...existingStudent,
      sessions: filteredSessions,
      ...(nextDismissed ? { dismissedSyncedTaskIds: nextDismissed } : {}),
      updatedAt: nowIso,
    };

    const nextStudents = [...students];
    nextStudents[idx] = updatedStudent;
    ws.students = nextStudents;
    ws.revision += 1;
    ws.lastSavedAt = nowIso;
    ws.lastEditedBy = actor;
    saveDatabaseAtomic(dbState);

    res.json({ deletedId: sessionId, student: updatedStudent, snapshot: ws });
  });

  // Save daily goal for To Do List
  app.put('/api/todos/goal', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const workspaceId =
      typeof body.workspaceId === 'string' && body.workspaceId.trim()
        ? body.workspaceId.trim()
        : DEFAULT_WORKSPACE_ID;
    const actor = typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim() : 'Người dùng';
    const date = typeof body.date === 'string' ? body.date.trim() : '';
    const goal = typeof body.goal === 'string' ? body.goal.slice(0, 600) : '';

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'Ngày mục tiêu không hợp lệ.' });
      return;
    }

    const ws = getWorkspace(workspaceId);
    const nowIso = new Date().toISOString();
    const nextGoals = { ...(ws.dailyGoals || {}) };
    if (goal.trim()) {
      nextGoals[date] = goal;
    } else {
      delete nextGoals[date];
    }
    ws.dailyGoals = nextGoals;
    ws.revision += 1;
    ws.lastSavedAt = nowIso;
    ws.lastEditedBy = actor;
    saveDatabaseAtomic(dbState);

    res.json({ date, goal: nextGoals[date] || '', snapshot: ws });
  });

  // Dismiss an auto-carried todo item starting from a target date
  app.post('/api/todos/dismiss-carryover', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const workspaceId =
      typeof body.workspaceId === 'string' && body.workspaceId.trim()
        ? body.workspaceId.trim()
        : DEFAULT_WORKSPACE_ID;
    const actor = typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim() : 'Người dùng';
    const originId = typeof body.originId === 'string' ? body.originId.trim() : '';
    const date = typeof body.date === 'string' ? body.date.trim() : '';

    if (!originId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'Thông tin xóa công việc không hợp lệ.' });
      return;
    }

    const ws = getWorkspace(workspaceId);
    const nowIso = new Date().toISOString();
    ws.dismissedTodoCarryovers = {
      ...(ws.dismissedTodoCarryovers || {}),
      [originId]: date,
    };
    ws.todos = (ws.todos || []).filter(
      (item) => !(getTodoOriginId(item) === originId && item.date >= date && Boolean(item.carriedFromDate)),
    );
    ws.revision += 1;
    ws.lastSavedAt = nowIso;
    ws.lastEditedBy = actor;
    saveDatabaseAtomic(dbState);

    res.json({ dismissedOriginId: originId, date, snapshot: ws });
  });

  // Create To Do List item
  app.post('/api/todos', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const workspaceId =
      typeof body.workspaceId === 'string' && body.workspaceId.trim()
        ? body.workspaceId.trim()
        : DEFAULT_WORKSPACE_ID;
    const actor = typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim() : 'Người dùng';

    const input = sanitizeTodoFields(body);
    const errors = validateTodoInput(input);
    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: Object.values(errors)[0] || 'Dữ liệu không hợp lệ.', fields: errors });
      return;
    }

    const ws = getWorkspace(workspaceId);
    const nowIso = new Date().toISOString();
    const id = `todo-${crypto.randomUUID()}`;
    const originId = input.originId || id;

    // Nhiệm vụ "đã hoàn thành" tự động bị xóa khỏi danh sách nhưng vẫn giữ số đếm tiến độ trong ngày
    if (input.status === 'completed') {
      ws.todos = removeCompletedTodoFromList(ws.todos || [], id, originId);
      ws.dismissedTodoCarryovers = {
        ...(ws.dismissedTodoCarryovers || {}),
        [originId]: input.date,
      };
      ws.completedTodoCountsByDate = {
        ...(ws.completedTodoCountsByDate || {}),
        [input.date]: (ws.completedTodoCountsByDate?.[input.date] || 0) + 1,
      };
      ws.revision += 1;
      ws.lastSavedAt = nowIso;
      ws.lastEditedBy = actor;
      saveDatabaseAtomic(dbState);
      res.status(200).json({ todo: null, removedCompleted: true, snapshot: ws });
      return;
    }

    const existingSameDateIdx = (ws.todos || []).findIndex(
      (item) => getTodoOriginId(item) === originId && item.date === input.date,
    );

    let savedTodo: TodoItem;
    let nextTodos = [...(ws.todos || [])];
    if (existingSameDateIdx >= 0) {
      savedTodo = {
        ...nextTodos[existingSameDateIdx],
        title: input.title,
        ...(input.notes ? { notes: input.notes } : { notes: undefined }),
        status: input.status,
        priority: input.priority,
        updatedAt: nowIso,
      };
      nextTodos[existingSameDateIdx] = savedTodo;
    } else {
      savedTodo = {
        id,
        originId,
        date: input.date,
        title: input.title,
        ...(input.notes ? { notes: input.notes } : {}),
        status: input.status,
        priority: input.priority,
        ...(input.carriedFromDate ? { carriedFromDate: input.carriedFromDate } : {}),
        createdBy: actor,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      nextTodos.push(savedTodo);
    }

    nextTodos = syncTodoCarryoversUpToDate(
      nextTodos,
      getLocalTodayDateKey(),
      ws.dismissedTodoCarryovers || {},
      nowIso,
    );

    ws.todos = nextTodos;
    ws.revision += 1;
    ws.lastSavedAt = nowIso;
    ws.lastEditedBy = actor;
    saveDatabaseAtomic(dbState);

    res.status(201).json({ todo: savedTodo, snapshot: ws });
  });

  // Update To Do List item
  app.put('/api/todos/:id', (req, res) => {
    const todoId = req.params.id;
    const body = (req.body || {}) as Record<string, unknown>;
    const workspaceId =
      typeof body.workspaceId === 'string' && body.workspaceId.trim()
        ? body.workspaceId.trim()
        : DEFAULT_WORKSPACE_ID;
    const actor = typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim() : 'Người dùng';

    const ws = getWorkspace(workspaceId);
    const todos = ws.todos || [];
    const idx = todos.findIndex((item) => item.id === todoId);
    if (idx < 0) {
      res.status(404).json({ error: 'Không tìm thấy công việc để cập nhật.' });
      return;
    }

    const existing = todos[idx];
    const merged = sanitizeTodoFields({
      date: body.date ?? existing.date,
      title: body.title ?? existing.title,
      notes: body.notes ?? existing.notes ?? '',
      status: body.status ?? existing.status,
      priority: body.priority ?? existing.priority,
      originId: existing.originId ?? existing.id,
      carriedFromDate: existing.carriedFromDate,
    });

    const errors = validateTodoInput(merged);
    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: Object.values(errors)[0] || 'Dữ liệu không hợp lệ.', fields: errors });
      return;
    }

    const nowIso = new Date().toISOString();
    const originId = getTodoOriginId(existing);

    // Nhiệm vụ "đã hoàn thành" tự động bị xóa khỏi danh sách nhưng vẫn giữ số đếm tiến độ trong ngày
    if (merged.status === 'completed') {
      ws.todos = cleanupCarriedClonesAfterCompletion(
        removeCompletedTodoFromList(todos, todoId, originId),
        originId,
        merged.date,
      );
      ws.completedTodoCountsByDate = {
        ...(ws.completedTodoCountsByDate || {}),
        [merged.date]: (ws.completedTodoCountsByDate?.[merged.date] || 0) + 1,
      };
      ws.revision += 1;
      ws.lastSavedAt = nowIso;
      ws.lastEditedBy = actor;
      saveDatabaseAtomic(dbState);
      res.json({ todo: null, removedCompleted: true, snapshot: ws });
      return;
    }

    const updatedTodo: TodoItem = {
      ...existing,
      ...merged,
      originId,
      updatedAt: nowIso,
    };

    let nextTodos = [...todos];
    nextTodos[idx] = updatedTodo;
    nextTodos = syncTodoCarryoversUpToDate(
      nextTodos,
      getLocalTodayDateKey(),
      ws.dismissedTodoCarryovers || {},
      nowIso,
    );

    ws.todos = nextTodos;
    ws.revision += 1;
    ws.lastSavedAt = nowIso;
    ws.lastEditedBy = actor;
    saveDatabaseAtomic(dbState);

    res.json({ todo: updatedTodo, snapshot: ws });
  });

  // Delete To Do List item
  app.delete('/api/todos/:id', (req, res) => {
    const todoId = req.params.id;
    const workspaceId =
      typeof req.query.workspaceId === 'string' && req.query.workspaceId.trim()
        ? req.query.workspaceId.trim()
        : DEFAULT_WORKSPACE_ID;
    const actor =
      typeof req.query.actor === 'string' && req.query.actor.trim()
        ? req.query.actor.trim()
        : 'Người dùng';

    const ws = getWorkspace(workspaceId);
    const todos = ws.todos || [];
    const target = todos.find((item) => item.id === todoId);
    if (!target) {
      res.status(404).json({ error: 'Công việc không tồn tại.' });
      return;
    }

    const nowIso = new Date().toISOString();
    const filtered = todos.filter((item) => item.id !== todoId);
    if (target.carriedFromDate) {
      const originId = getTodoOriginId(target);
      ws.dismissedTodoCarryovers = {
        ...(ws.dismissedTodoCarryovers || {}),
        [originId]: target.date,
      };
    }

    ws.todos = filtered;
    ws.revision += 1;
    ws.lastSavedAt = nowIso;
    ws.lastEditedBy = actor;
    saveDatabaseAtomic(dbState);

    res.json({ deletedId: todoId, snapshot: ws });
  });

  // Daily Notes CRUD (Ghi chú theo ngày: ô tick việc hoặc văn bản thông thường)
  app.post('/api/notes', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const workspaceId =
      typeof body.workspaceId === 'string' && body.workspaceId.trim()
        ? body.workspaceId.trim()
        : DEFAULT_WORKSPACE_ID;
    const actor = typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim() : 'Người dùng';

    const input = sanitizeDailyNoteFields(body, getLocalTodayDateKey());
    const errors = validateDailyNoteInput(input);
    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: Object.values(errors)[0] || 'Dữ liệu ghi chú không hợp lệ.', fields: errors });
      return;
    }

    const ws = getWorkspace(workspaceId);
    const nowIso = new Date().toISOString();
    const newNote: DailyNoteItem = {
      id: `note-${crypto.randomUUID()}`,
      date: input.date,
      kind: input.kind,
      content: input.content,
      ...(input.kind === 'checklist' ? { checked: Boolean(input.checked) } : {}),
      createdBy: actor,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    ws.dailyNotes = [...(ws.dailyNotes || []), newNote];
    ws.revision += 1;
    ws.lastSavedAt = nowIso;
    ws.lastEditedBy = actor;
    saveDatabaseAtomic(dbState);

    res.status(201).json({ note: newNote, snapshot: ws });
  });

  app.put('/api/notes/:id', (req, res) => {
    const noteId = req.params.id;
    const body = (req.body || {}) as Record<string, unknown>;
    const workspaceId =
      typeof body.workspaceId === 'string' && body.workspaceId.trim()
        ? body.workspaceId.trim()
        : DEFAULT_WORKSPACE_ID;
    const actor = typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim() : 'Người dùng';

    const ws = getWorkspace(workspaceId);
    const notes = ws.dailyNotes || [];
    const idx = notes.findIndex((item) => item.id === noteId);
    if (idx < 0) {
      res.status(404).json({ error: 'Không tìm thấy ghi chú để cập nhật.' });
      return;
    }

    const existing = notes[idx];
    const merged = sanitizeDailyNoteFields(
      {
        date: body.date ?? existing.date,
        kind: body.kind ?? existing.kind,
        content: body.content ?? existing.content,
        checked: body.checked !== undefined ? body.checked : existing.checked,
      },
      existing.date,
    );

    const errors = validateDailyNoteInput(merged);
    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: Object.values(errors)[0] || 'Dữ liệu ghi chú không hợp lệ.', fields: errors });
      return;
    }

    const nowIso = new Date().toISOString();
    const updatedNote: DailyNoteItem = {
      ...existing,
      date: merged.date,
      kind: merged.kind,
      content: merged.content,
      ...(merged.kind === 'checklist' ? { checked: Boolean(merged.checked) } : { checked: undefined }),
      updatedAt: nowIso,
    };

    const nextNotes = [...notes];
    nextNotes[idx] = updatedNote;
    ws.dailyNotes = nextNotes;
    ws.revision += 1;
    ws.lastSavedAt = nowIso;
    ws.lastEditedBy = actor;
    saveDatabaseAtomic(dbState);

    res.json({ note: updatedNote, snapshot: ws });
  });

  app.delete('/api/notes/:id', (req, res) => {
    const noteId = req.params.id;
    const workspaceId =
      typeof req.query.workspaceId === 'string' && req.query.workspaceId.trim()
        ? req.query.workspaceId.trim()
        : DEFAULT_WORKSPACE_ID;
    const actor =
      typeof req.query.actor === 'string' && req.query.actor.trim()
        ? req.query.actor.trim()
        : 'Người dùng';

    const ws = getWorkspace(workspaceId);
    const notes = ws.dailyNotes || [];
    const filtered = notes.filter((item) => item.id !== noteId);
    if (filtered.length === notes.length) {
      res.status(404).json({ error: 'Ghi chú không tồn tại.' });
      return;
    }

    const nowIso = new Date().toISOString();
    ws.dailyNotes = filtered;
    ws.revision += 1;
    ws.lastSavedAt = nowIso;
    ws.lastEditedBy = actor;
    saveDatabaseAtomic(dbState);

    res.json({ deletedId: noteId, snapshot: ws });
  });

  app.delete('/api/notes', (req, res) => {
    const workspaceId =
      typeof req.query.workspaceId === 'string' && req.query.workspaceId.trim()
        ? req.query.workspaceId.trim()
        : DEFAULT_WORKSPACE_ID;
    const dateKey = typeof req.query.date === 'string' ? req.query.date.trim() : '';
    const actor =
      typeof req.query.actor === 'string' && req.query.actor.trim()
        ? req.query.actor.trim()
        : 'Người dùng';

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      res.status(400).json({ error: 'Ngày cần xóa ghi chú không hợp lệ.' });
      return;
    }

    const ws = getWorkspace(workspaceId);
    const nowIso = new Date().toISOString();
    ws.dailyNotes = (ws.dailyNotes || []).filter((item) => item.date !== dateKey);
    ws.revision += 1;
    ws.lastSavedAt = nowIso;
    ws.lastEditedBy = actor;
    saveDatabaseAtomic(dbState);

    res.json({ clearedDate: dateKey, snapshot: ws });
  });

  // Update workspace appearance (themeMode: light/dark + backgroundColor)
  app.put('/api/workspace/appearance', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const workspaceId =
      typeof body.workspaceId === 'string' && body.workspaceId.trim()
        ? body.workspaceId.trim()
        : DEFAULT_WORKSPACE_ID;
    const actor = typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim() : 'Người dùng';

    const ws = getWorkspace(workspaceId);
    const themeMode = body.themeMode === 'dark' ? 'dark' : 'light';
    const rawBg = body.backgroundColor !== undefined ? body.backgroundColor : ws.appearance?.backgroundColor;
    const backgroundColor = normalizeHexColor(rawBg) || DEFAULT_APP_BACKGROUND_COLOR;

    const nowIso = new Date().toISOString();
    ws.appearance = {
      themeMode,
      backgroundColor,
    };
    ws.revision += 1;
    ws.lastSavedAt = nowIso;
    ws.lastEditedBy = actor;
    saveDatabaseAtomic(dbState);

    res.json({ appearance: ws.appearance, snapshot: ws });
  });

  // Update workspace custom avatar (uploaded image data URL or empty to reset)
  app.put('/api/workspace/avatar', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const workspaceId =
      typeof body.workspaceId === 'string' && body.workspaceId.trim()
        ? body.workspaceId.trim()
        : DEFAULT_WORKSPACE_ID;
    const actor = typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim() : 'Người dùng';

    const validationError = validateAvatarDataUrl(body.avatarDataUrl);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const ws = getWorkspace(workspaceId);
    const nextAvatar = normalizeAvatarDataUrl(body.avatarDataUrl);
    const nowIso = new Date().toISOString();
    ws.avatarDataUrl = nextAvatar;
    ws.revision += 1;
    ws.lastSavedAt = nowIso;
    ws.lastEditedBy = actor;
    saveDatabaseAtomic(dbState);

    res.json({ avatarDataUrl: ws.avatarDataUrl, snapshot: ws });
  });

  // Restore preserved snapshot from Google Drive or local backup into server workspace
  app.post('/api/workspace/restore', (req, res) => {
    const body = (req.body || {}) as {
      workspaceId?: string;
      actor?: string;
      snapshot?: unknown;
    };
    const workspaceId =
      typeof body.workspaceId === 'string' && body.workspaceId.trim()
        ? body.workspaceId.trim()
        : DEFAULT_WORKSPACE_ID;
    const actor = typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim() : 'Người dùng';

    const parsed = parseDriveBackupPayload(body.snapshot, workspaceId);
    if (!parsed) {
      res.status(400).json({ error: 'Dữ liệu sao lưu không hợp lệ.' });
      return;
    }

    const nowIso = new Date().toISOString();
    const bgHex =
      normalizeHexColor(parsed.appearance?.backgroundColor) || DEFAULT_APP_BACKGROUND_COLOR;
    const themeMode = parsed.appearance?.themeMode === 'dark' ? 'dark' : 'light';
    const coloredTasks = ensureNonConflictingTaskColors(parsed.tasks);
    const syncedIncomes = syncWorkspaceIncomesWithTasks(coloredTasks, parsed.incomes, nowIso);
    const syncedStudents = syncWorkspaceStudentsWithTasks(
      coloredTasks,
      parsed.students || [],
      nowIso,
    );
    const activeTodos = (parsed.todos || []).filter((item) => item.status !== 'completed');
    const syncedTodos = syncTodoCarryoversUpToDate(
      activeTodos,
      getLocalTodayDateKey(),
      parsed.dismissedTodoCarryovers || {},
      nowIso,
    );

    const existingWs = getWorkspace(workspaceId);
    const restored: WorkspaceSnapshot = {
      workspaceId,
      revision: Math.max(existingWs.revision + 1, (parsed.revision || 1) + 1),
      lastSavedAt: nowIso,
      lastEditedBy: actor,
      tasks: coloredTasks,
      incomes: syncedIncomes,
      students: syncedStudents,
      todos: syncedTodos,
      dailyNotes: Array.isArray(parsed.dailyNotes) ? parsed.dailyNotes : [],
      dailyGoals: parsed.dailyGoals || {},
      dismissedTodoCarryovers: parsed.dismissedTodoCarryovers || {},
      completedTodoCountsByDate: parsed.completedTodoCountsByDate || {},
      appearance: {
        themeMode,
        backgroundColor: bgHex,
      },
      avatarDataUrl: normalizeAvatarDataUrl(parsed.avatarDataUrl),
      monthlyIncomeTargets: parsed.monthlyIncomeTargets || {},
      dailyIncomeTargets: parsed.dailyIncomeTargets || {},
      chatHistory: parsed.chatHistory || [],
    };

    dbState.workspaces[workspaceId] = restored;
    saveDatabaseAtomic(dbState);

    res.json({ snapshot: restored });
  });

  // Delete all workspace data for a single month (YYYY-MM)
  app.delete('/api/workspace/month', (req, res) => {
    const workspaceId =
      typeof req.query.workspaceId === 'string' && req.query.workspaceId.trim()
        ? req.query.workspaceId.trim()
        : DEFAULT_WORKSPACE_ID;
    const rawMonth = typeof req.query.monthKey === 'string' ? req.query.monthKey : '';
    const monthKey = normalizeMonthKey(rawMonth);
    const actor =
      typeof req.query.actor === 'string' && req.query.actor.trim()
        ? req.query.actor.trim()
        : 'Người dùng';

    if (!monthKey) {
      res.status(400).json({ error: 'Tháng cần xóa không hợp lệ (YYYY-MM).' });
      return;
    }

    const ws = getWorkspace(workspaceId);
    const nowIso = new Date().toISOString();
    const cleaned = clearMonthDataFromSnapshot(ws, monthKey, actor, nowIso);
    dbState.workspaces[workspaceId] = cleaned;
    saveDatabaseAtomic(dbState);

    res.json({ clearedMonth: monthKey, snapshot: cleaned });
  });

  // Update monthly/daily income targets
  app.put('/api/workspace/income-targets', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const workspaceId =
      typeof body.workspaceId === 'string' && body.workspaceId.trim()
        ? body.workspaceId.trim()
        : DEFAULT_WORKSPACE_ID;
    const actor = typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim() : 'Người dùng';

    const ws = getWorkspace(workspaceId);
    const nextMonthly = { ...(ws.monthlyIncomeTargets || {}) };
    const nextDaily = { ...(ws.dailyIncomeTargets || {}) };

    if (typeof body.monthKey === 'string' && /^\d{4}-\d{2}$/.test(body.monthKey.trim())) {
      const mk = body.monthKey.trim();
      const val = Number(body.monthlyTarget ?? 0);
      if (!Number.isFinite(val) || val < 0) {
        res.status(400).json({ error: 'Thu nhập mục tiêu tháng phải là số không âm.' });
        return;
      }
      if (val === 0) {
        delete nextMonthly[mk];
      } else {
        nextMonthly[mk] = Math.round(val);
      }
    }

    if (typeof body.dateKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.dateKey.trim())) {
      const dk = body.dateKey.trim();
      const val = Number(body.dailyTarget ?? 0);
      if (!Number.isFinite(val) || val < 0) {
        res.status(400).json({ error: 'Thu nhập mục tiêu ngày phải là số không âm.' });
        return;
      }
      if (val === 0) {
        delete nextDaily[dk];
      } else {
        nextDaily[dk] = Math.round(val);
      }
    }

    const nowIso = new Date().toISOString();
    ws.monthlyIncomeTargets = nextMonthly;
    ws.dailyIncomeTargets = nextDaily;
    ws.revision += 1;
    ws.lastSavedAt = nowIso;
    ws.lastEditedBy = actor;
    saveDatabaseAtomic(dbState);

    res.json({
      monthlyIncomeTargets: ws.monthlyIncomeTargets,
      dailyIncomeTargets: ws.dailyIncomeTargets,
      snapshot: ws,
    });
  });

  // Hello Kitty Gemini Chatbot endpoint
  app.post('/api/chat', async (req, res) => {
    const body = (req.body || {}) as {
      message?: string;
      selectedDate?: string;
      workspaceId?: string;
      actor?: string;
      history?: { role: string; text: string }[];
    };

    const message = (body.message || '').trim();
    if (!message) {
      res.status(400).json({ error: 'Vui lòng nhập nội dung tin nhắn.' });
      return;
    }

    const workspaceId = body.workspaceId?.trim() || DEFAULT_WORKSPACE_ID;
    const selectedDate = body.selectedDate?.trim() || getLocalTodayDateKey();
    const actor = body.actor?.trim() || 'Người dùng';
    const ws = getWorkspace(workspaceId);

    const appendChatHistory = (
      userText: string,
      assistantText: string,
      createdTask: PlannerTask | null,
    ) => {
      const now = new Date().toISOString();
      const userEntry: ChatMessage = {
        id: `user-${crypto.randomUUID()}`,
        role: 'user',
        text: userText,
        createdAt: now,
      };
      const botEntry: ChatMessage = {
        id: `bot-${crypto.randomUUID()}`,
        role: 'assistant',
        text: assistantText,
        createdAt: now,
        createdTask,
      };
      const existingHistory = Array.isArray(ws.chatHistory) ? ws.chatHistory : [];
      ws.chatHistory = [...existingHistory, userEntry, botEntry].slice(-60);
      ws.lastSavedAt = now;
      ws.lastEditedBy = actor;
      saveDatabaseAtomic(dbState);
      };

    const ai = getGeminiClient();
    if (!ai) {
      const fallback = buildFallbackAssistantReply(message, ws.tasks, selectedDate);
      let createdTask: PlannerTask | null = null;
      if (fallback.createTaskData) {
        const bgHex = ws.appearance?.backgroundColor;
        const errors = validateTaskInput(fallback.createTaskData, ws.tasks, undefined, bgHex);
        if (Object.keys(errors).length === 0) {
          const nowIso = new Date().toISOString();
          createdTask = {
            id: `task-${crypto.randomUUID()}`,
            ...fallback.createTaskData,
            color: pickAvailablePastelColor(ws.tasks, fallback.createTaskData, undefined, 0, bgHex),
            createdBy: `${actor} (Kitty Bot)`,
            createdAt: nowIso,
            updatedAt: nowIso,
          };
          ws.tasks = [...ws.tasks, createdTask];
          ws.incomes = syncWorkspaceIncomesWithTasks(ws.tasks, ws.incomes, nowIso);
          ws.students = syncWorkspaceStudentsWithTasks(ws.tasks, ws.students || [], nowIso);
          ws.revision += 1;
          ws.lastSavedAt = nowIso;
          ws.lastEditedBy = `${actor} (Kitty Bot)`;
        }
      }
      appendChatHistory(message, fallback.reply, createdTask);
      res.json({ reply: fallback.reply, createdTask, snapshot: ws });
      return;
    }

    try {
      const compactTasks = ws.tasks.map((t) => ({
        date: t.date,
        title: t.title,
        startTime: t.startTime,
        endTime: t.endTime,
        income: t.income,
        status: t.status,
        notes: t.notes,
      }));

      const compactIncomes = ws.incomes.map((i) => ({
        month: i.month,
        sourceName: i.sourceName,
        amount: i.amount,
        receivedStatus: i.receivedStatus,
      }));

      const recentHistory = (body.history || [])
        .slice(-6)
        .map((h) => `${h.role === 'user' ? 'Người dùng' : 'Kitty'}: ${h.text}`)
        .join('\n');

      const prompt = `Ngày đang xem trên lịch: ${selectedDate}
Tài khoản hiện tại: ${actor}
Dữ liệu lịch hiện có trong cơ sở dữ liệu (${compactTasks.length} tasks):
${JSON.stringify(compactTasks)}
Danh mục thu nhập tháng (${compactIncomes.length} nguồn thu):
${JSON.stringify(compactIncomes)}

Lịch sử hội thoại gần đây:
${recentHistory || '(Chưa có)'}

Tin nhắn mới của người dùng: "${message}"`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'Bạn là Kitty, trợ lý lịch trình và tài chính cá nhân phong cách Hello Kitty thân thiện, nói tiếng Việt tự nhiên, ngắn gọn, chính xác. ' +
            'Nếu người dùng yêu cầu thêm hoặc tạo một task mới (có tên task và khung giờ), hãy đặt actionType="create_task" và điền đầy đủ task fields (giờ chuẩn HH:MM bội số 15 phút từ 06:00 đến 23:45). ' +
            'Nếu chỉ hỏi thông tin, tổng kết thu nhập hoặc trò chuyện, hãy đặt actionType="none". Luôn dựa trên dữ liệu lịch thực tế được cung cấp.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: {
                type: Type.STRING,
                description: 'Câu trả lời tiếng Việt thân thiện, rõ ràng cho người dùng.',
              },
              actionType: {
                type: Type.STRING,
                description: 'Giá trị "create_task" nếu cần tạo task mới, hoặc "none".',
              },
              task: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  date: { type: Type.STRING, description: 'YYYY-MM-DD' },
                  startTime: { type: Type.STRING, description: 'HH:MM' },
                  endTime: { type: Type.STRING, description: 'HH:MM' },
                  income: { type: Type.NUMBER },
                  notes: { type: Type.STRING },
                  link: { type: Type.STRING },
                },
              },
            },
            required: ['reply', 'actionType'],
          },
        },
      });

      const rawText = (response.text || '{}').trim();
      const parsed = JSON.parse(rawText) as {
        reply?: string;
        actionType?: string;
        task?: {
          title?: string;
          date?: string;
          startTime?: string;
          endTime?: string;
          income?: number;
          notes?: string;
          link?: string;
        };
      };

      let createdTask: PlannerTask | null = null;
      if (parsed.actionType === 'create_task' && parsed.task) {
        const candidateRaw = sanitizeTaskFields({
          date: parsed.task.date || selectedDate,
          title: parsed.task.title || '',
          startTime: parsed.task.startTime || '09:00',
          endTime: parsed.task.endTime || '10:00',
          income: parsed.task.income ?? 0,
          status: 'pending',
          notes: parsed.task.notes || 'Tạo qua Kitty Chatbot',
          link: parsed.task.link || '',
        });
        const bgHex = ws.appearance?.backgroundColor;
        const candidate = {
          ...candidateRaw,
          color: pickAvailablePastelColor(ws.tasks, candidateRaw, undefined, 0, bgHex),
        };
        const errors = validateTaskInput(candidate, ws.tasks, undefined, bgHex);
        if (Object.keys(errors).length === 0) {
          const nowIso = new Date().toISOString();
          createdTask = {
            id: `task-${crypto.randomUUID()}`,
            ...candidate,
            createdBy: `${actor} (Kitty Bot)`,
            createdAt: nowIso,
            updatedAt: nowIso,
          };
          ws.tasks = [...ws.tasks, createdTask];
          ws.incomes = syncWorkspaceIncomesWithTasks(ws.tasks, ws.incomes, nowIso);
          ws.students = syncWorkspaceStudentsWithTasks(ws.tasks, ws.students || [], nowIso);
          ws.revision += 1;
          ws.lastSavedAt = nowIso;
          ws.lastEditedBy = `${actor} (Kitty Bot)`;
        }
      }

      const finalReply = parsed.reply || 'Kitty đã kiểm tra lịch giúp bạn rồi nhé!';
      appendChatHistory(message, finalReply, createdTask);

      res.json({
        reply: finalReply,
        createdTask,
        snapshot: ws,
      });
    } catch (err) {
      console.error('Gemini chat error:', err);
      const fallback = buildFallbackAssistantReply(message, ws.tasks, selectedDate);
      appendChatHistory(message, fallback.reply, null);
      res.json({
        reply: fallback.reply,
        createdTask: null,
        snapshot: ws,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KittyPlan server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
