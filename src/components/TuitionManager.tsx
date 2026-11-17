import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type {
  StudentTuition,
  StudentTuitionInput,
  TuitionSession,
  TuitionSessionInput,
  TuitionSessionStatus,
} from '../types/planner';
import { formatCurrencyVnd, normalizeTaskIncomeName, parseDateKey } from '../utils/schedule';
import {
  DEFAULT_TUITION_COLOR,
  TUITION_MONTH_OPTIONS,
  buildMonthKey,
  formatMonthDisplay,
  formatVietnameseWeekdayDate,
  getDaysInMonthOptions,
  getSessionsForMonth,
  getTuitionColorTheme,
  summarizeStudentTuition,
  tuitionSheetToCsv,
  validateStudentTuitionInput,
  validateTuitionSessionInput,
} from '../utils/tuition';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Download,
  Pencil,
  Plus,
  Save,
  Trash2,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react';
import { TuitionColorPicker } from './TuitionColorPicker';
import { TuitionSlipModal } from './TuitionSlipModal';

export interface TuitionJumpTarget {
  dateKey: string;
  studentName: string;
  nonce: number;
}

interface TuitionManagerProps {
  students: StudentTuition[];
  selectedDate: string;
  jumpTarget?: TuitionJumpTarget | null;
  onCreateStudent: (input: StudentTuitionInput) => Promise<StudentTuition | null>;
  onUpdateStudent: (studentId: string, input: StudentTuitionInput) => Promise<void>;
  onDeleteStudent: (studentId: string) => Promise<void>;
  onAddSession: (studentId: string, input: TuitionSessionInput) => Promise<void>;
  onUpdateSession: (
    studentId: string,
    sessionId: string,
    input: Partial<TuitionSessionInput>,
  ) => Promise<void>;
  onDeleteSession: (studentId: string, sessionId: string) => Promise<void>;
  onNavigateToSessionTask: (
    dateKey: string,
    studentName: string,
    sourceTaskId?: string,
    content?: string,
  ) => void;
}

export function TuitionManager({
  students,
  selectedDate,
  jumpTarget,
  onCreateStudent,
  onUpdateStudent,
  onDeleteStudent,
  onAddSession,
  onUpdateSession,
  onDeleteSession,
  onNavigateToSessionTask,
}: TuitionManagerProps) {
  const baseDate = useMemo(() => parseDateKey(selectedDate), [selectedDate]);
  const activeYear = baseDate.getFullYear();
  const currentMonthNum = baseDate.getMonth() + 1;

  // Detailed tuition sheet stays hidden until the user clicks a student's name or dropdown
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [detailMode, setDetailMode] = useState<'table' | 'info'>('table');
  const [activeMonthNum, setActiveMonthNum] = useState<number>(currentMonthNum);

  // New student form state
  const [newName, setNewName] = useState('');
  const [newFee, setNewFee] = useState('200000');
  const [newMonth, setNewMonth] = useState<number>(currentMonthNum);
  const [newColor, setNewColor] = useState<string>(DEFAULT_TUITION_COLOR);
  const [studentFormErrors, setStudentFormErrors] = useState<Record<string, string>>({});
  const [isCreatingStudent, setIsCreatingStudent] = useState(false);

  // Student delete inline confirm
  const [confirmDeleteStudentId, setConfirmDeleteStudentId] = useState<string | null>(null);

  // Tuition slip modal state
  const [slipStudentId, setSlipStudentId] = useState<string | null>(null);

  // Selected student lookup (never auto-selects when selectedStudentId is empty)
  const activeStudent = useMemo(
    () => (selectedStudentId ? students.find((s) => s.id === selectedStudentId) || null : null),
    [students, selectedStudentId],
  );

  const slipStudent = useMemo(
    () => (slipStudentId ? students.find((s) => s.id === slipStudentId) || null : null),
    [students, slipStudentId],
  );

  // Active student general info edit state
  const [editName, setEditName] = useState('');
  const [editSchedule, setEditSchedule] = useState('');
  const [editFee, setEditFee] = useState('0');
  const [editColor, setEditColor] = useState<string>(DEFAULT_TUITION_COLOR);
  const [editInfoErrors, setEditInfoErrors] = useState<Record<string, string>>({});
  const [isSavingInfo, setIsSavingInfo] = useState(false);
  const [savedInfoNotice, setSavedInfoNotice] = useState(false);

  // Days available in the active month (no year displayed to the user)
  const monthDayOptions = useMemo(
    () => getDaysInMonthOptions(activeYear, activeMonthNum),
    [activeYear, activeMonthNum],
  );

  const [sessionDate, setSessionDate] = useState<string>(() =>
    buildMonthKey(activeYear, currentMonthNum) + `-${String(baseDate.getDate()).padStart(2, '0')}`,
  );
  const [sessionContent, setSessionContent] = useState('');
  const [sessionStatus, setSessionStatus] = useState<TuitionSessionStatus>('completed');
  const [sessionErrors, setSessionErrors] = useState<Record<string, string>>({});
  const [isAddingInline, setIsAddingInline] = useState(false);
  const [isAddingSession, setIsAddingSession] = useState(false);

  // Inline edit session row state
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionDate, setEditingSessionDate] = useState('');
  const [editingSessionContent, setEditingSessionContent] = useState('');
  const [editingSessionStatus, setEditingSessionStatus] =
    useState<TuitionSessionStatus>('completed');

  useEffect(() => {
    if (selectedStudentId && !students.some((s) => s.id === selectedStudentId)) {
      setSelectedStudentId('');
    }
  }, [students, selectedStudentId]);

  useEffect(() => {
    if (activeStudent) {
      setEditName(activeStudent.studentName);
      setEditSchedule(activeStudent.studySchedule);
      setEditFee(String(activeStudent.feePerSession ?? 0));
      setEditColor(activeStudent.themeColor || DEFAULT_TUITION_COLOR);
      setEditInfoErrors({});
      setSavedInfoNotice(false);
    }
  }, [activeStudent]);

  // Keep sessionDate within the activeMonthNum when month changes
  useEffect(() => {
    if (monthDayOptions.length === 0) return;
    if (!monthDayOptions.some((opt) => opt.dateKey === sessionDate)) {
      const preferred =
        activeMonthNum === currentMonthNum
          ? monthDayOptions.find((opt) => opt.day === baseDate.getDate()) || monthDayOptions[0]
          : monthDayOptions[0];
      setSessionDate(preferred.dateKey);
    }
  }, [monthDayOptions, sessionDate, activeMonthNum, currentMonthNum, baseDate]);

  // Handle direct jump from TaskModal arrow shortcut into Bảng học phí for that date
  useEffect(() => {
    if (!jumpTarget) return;
    const targetDateObj = parseDateKey(jumpTarget.dateKey);
    const targetMonth = targetDateObj.getMonth() + 1;
    setActiveMonthNum(targetMonth);
    setNewMonth(targetMonth);
    setSessionDate(jumpTarget.dateKey);
    setEditingSessionId(null);
    setSessionErrors({});

    const normTargetName = normalizeTaskIncomeName(jumpTarget.studentName || '');
    let matchedStudent: StudentTuition | undefined;
    if (normTargetName) {
      matchedStudent =
        students.find((s) => normalizeTaskIncomeName(s.studentName) === normTargetName) ||
        students.find((s) => {
          const sn = normalizeTaskIncomeName(s.studentName);
          return sn && (sn.includes(normTargetName) || normTargetName.includes(sn));
        });
    }
    if (!matchedStudent) {
      matchedStudent = students.find((s) =>
        s.sessions.some((sess) => sess.date === jumpTarget.dateKey),
      );
    }
    if (!matchedStudent && !normTargetName && students.length > 0) {
      matchedStudent = students[0];
    }

    if (matchedStudent) {
      setSelectedStudentId(matchedStudent.id);
      setDetailMode('table');
      const hasSessionOnDate = matchedStudent.sessions.some(
        (sess) => sess.date === jumpTarget.dateKey,
      );
      setIsAddingInline(!hasSessionOnDate);
    } else {
      setSelectedStudentId('');
      if (jumpTarget.studentName.trim()) {
        setNewName(jumpTarget.studentName.trim());
      }
      setIsAddingInline(false);
    }
  }, [jumpTarget, students]);

  const handleSelectStudent = (student: StudentTuition, mode: 'table' | 'info' = 'table') => {
    setSelectedStudentId(student.id);
    setDetailMode(mode);
    if (student.month >= 1 && student.month <= 12) {
      setActiveMonthNum(student.month);
    }
    setEditingSessionId(null);
    setIsAddingInline(false);
    setSessionErrors({});
  };

  const handleCreateStudentSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const payload: StudentTuitionInput = {
      studentName: newName.trim(),
      studySchedule: '',
      feePerSession: newFee.trim() === '' ? 0 : Number(newFee),
      month: newMonth,
      themeColor: newColor,
    };
    const errors = validateStudentTuitionInput(payload);
    if (Object.keys(errors).length > 0) {
      setStudentFormErrors(errors);
      return;
    }

    setIsCreatingStudent(true);
    setStudentFormErrors({});
    try {
      await onCreateStudent(payload);
      setNewName('');
      setNewFee('200000');
      setNewMonth(currentMonthNum);
      setNewColor(DEFAULT_TUITION_COLOR);
    } catch (err) {
      setStudentFormErrors({
        submit: err instanceof Error ? err.message : 'Không thể thêm học sinh.',
      });
    } finally {
      setIsCreatingStudent(false);
    }
  };

  const handleSaveGeneralInfo = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeStudent) return;
    const payload: StudentTuitionInput = {
      studentName: editName.trim(),
      studySchedule: editSchedule.trim(),
      feePerSession: editFee.trim() === '' ? 0 : Number(editFee),
      month: activeMonthNum,
      themeColor: editColor,
    };
    const errors = validateStudentTuitionInput(payload);
    if (Object.keys(errors).length > 0) {
      setEditInfoErrors(errors);
      return;
    }

    setIsSavingInfo(true);
    setEditInfoErrors({});
    try {
      await onUpdateStudent(activeStudent.id, payload);
      setSavedInfoNotice(true);
      setTimeout(() => setSavedInfoNotice(false), 2000);
    } catch (err) {
      setEditInfoErrors({
        submit: err instanceof Error ? err.message : 'Không thể lưu thông tin chung.',
      });
    } finally {
      setIsSavingInfo(false);
    }
  };

  const handleSaveInlineSession = async () => {
    if (!activeStudent) return;
    const payload: TuitionSessionInput = {
      date: sessionDate,
      content: sessionContent.trim(),
      status: sessionStatus,
    };
    const errors = validateTuitionSessionInput(payload);
    if (Object.keys(errors).length > 0) {
      setSessionErrors(errors);
      return;
    }

    setIsAddingSession(true);
    setSessionErrors({});
    try {
      await onAddSession(activeStudent.id, payload);
      setSessionContent('');
      setSessionStatus('completed');
      setIsAddingInline(false);
    } catch (err) {
      setSessionErrors({
        submit: err instanceof Error ? err.message : 'Không thể thêm buổi học.',
      });
    } finally {
      setIsAddingSession(false);
    }
  };

  const startEditingSession = (session: TuitionSession) => {
    setEditingSessionId(session.id);
    setEditingSessionDate(session.date);
    setEditingSessionContent(session.content);
    setEditingSessionStatus(session.status);
  };

  const handleSaveSessionEdit = async (sessionId: string) => {
    if (!activeStudent) return;
    const payload: TuitionSessionInput = {
      date: editingSessionDate,
      content: editingSessionContent.trim(),
      status: editingSessionStatus,
    };
    const errors = validateTuitionSessionInput(payload);
    if (Object.keys(errors).length > 0) {
      return;
    }
    await onUpdateSession(activeStudent.id, sessionId, payload);
    setEditingSessionId(null);
  };

  const handleExportStudentCsv = () => {
    if (!activeStudent) return;
    const csv = tuitionSheetToCsv(activeStudent, activeMonthNum);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hoc-phi-${activeStudent.studentName}-thang-${activeMonthNum}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const activeTheme = useMemo(
    () => getTuitionColorTheme(activeStudent ? editColor || activeStudent.themeColor : DEFAULT_TUITION_COLOR),
    [activeStudent, editColor],
  );

  const activeSessions = useMemo(
    () => (activeStudent ? getSessionsForMonth(activeStudent.sessions, activeMonthNum) : []),
    [activeStudent, activeMonthNum],
  );

  const liveFeePerSession = useMemo(() => {
    if (!activeStudent) return 0;
    const parsed = Number(editFee);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : activeStudent.feePerSession;
  }, [activeStudent, editFee]);

  const activeSummary = useMemo(
    () =>
      activeStudent
        ? summarizeStudentTuition(activeStudent.sessions, liveFeePerSession, activeMonthNum)
        : {
            monthLabel: formatMonthDisplay(activeMonthNum),
            completedCount: 0,
            absentCount: 0,
            totalTuition: 0,
          },
    [activeStudent, liveFeePerSession, activeMonthNum],
  );

  return (
    <div className="w-full space-y-6">
      <div className="w-full flex flex-col lg:flex-row items-start gap-6">
        {/* Student List Panel (trên / trái) */}
        <aside
          aria-label="Danh sách học sinh"
          className={
            activeStudent
              ? 'w-full lg:w-[375px] shrink-0'
              : 'w-full max-w-4xl mx-auto'
          }
        >
          {/* 1. Student switcher list */}
          <section className="rounded-3xl border border-[#F5BDD6] bg-[#FFF8FB] overflow-hidden shadow-xs">
          <div className="border-b border-[#F5BDD6] bg-[#FFE3EE] px-4 py-3">
            <h2 className="text-sm font-bold text-[#3D1A2B]">
              Danh sách học sinh ({students.length})
            </h2>
            <p className="text-xs text-[#7C5266]">
              Bấm tên học sinh hoặc chọn ở mục Tùy chọn
            </p>
          </div>

          <div className="p-3 space-y-2 max-h-[380px] overflow-y-auto">
            {students.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#F5BDD6] bg-white p-4 text-center text-xs text-[#7C5266]">
                Chưa có học sinh nào. Hãy thêm học sinh ở bên dưới để bắt đầu.
              </div>
            ) : (
              students.map((st) => {
                const isSelected = activeStudent?.id === st.id;
                const tone = getTuitionColorTheme(st.themeColor);
                const targetMonth = st.month >= 1 && st.month <= 12 ? st.month : currentMonthNum;
                const stSummary = summarizeStudentTuition(
                  st.sessions,
                  st.feePerSession,
                  targetMonth,
                );
                const isConfirmingDelete = confirmDeleteStudentId === st.id;

                return (
                  <div
                    key={st.id}
                    className="rounded-2xl border transition-colors"
                    style={{
                      backgroundColor: isSelected ? tone.headerBg : '#FFFFFF',
                      borderColor: isSelected ? tone.hex : '#F5BDD6',
                    }}
                  >
                    <div className="p-3 space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleSelectStudent(st, 'table')}
                          className="min-w-0 flex-1 flex items-center gap-2 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D64] rounded-lg py-0.5"
                        >
                          <span
                            aria-hidden="true"
                            className="h-3 w-3 rounded-full shrink-0 border border-black/10"
                            style={{ backgroundColor: tone.hex }}
                          />
                          <span className="text-sm font-extrabold text-[#3D1A2B] truncate">
                            {st.studentName}
                          </span>
                        </button>

                        <select
                          aria-label={`Tùy chọn cho học sinh ${st.studentName}`}
                          value=""
                          onChange={(e) => {
                            const action = e.target.value;
                            if (action === 'table') {
                              handleSelectStudent(st, 'table');
                            } else if (action === 'slip') {
                              setSlipStudentId(st.id);
                            } else if (action === 'info') {
                              handleSelectStudent(st, 'info');
                            }
                          }}
                          className="rounded-xl border bg-white px-2 py-1 text-[11px] font-bold shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D64]"
                          style={{
                            borderColor: tone.border,
                            color: tone.accentText,
                          }}
                        >
                          <option value="" disabled>
                            Tùy chọn
                          </option>
                          <option value="table">Bảng học phí</option>
                          <option value="slip">Xuất phiếu học phí</option>
                          <option value="info">Thông tin chung</option>
                        </select>

                        {!isConfirmingDelete ? (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteStudentId(st.id)}
                            aria-label={`Xóa học sinh ${st.studentName}`}
                            className="rounded-xl p-1.5 text-[#B48EA0] hover:bg-[#FFF1F2] hover:text-[#BE123C] cursor-pointer shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDeleteStudentId(null);
                                void onDeleteStudent(st.id);
                              }}
                              className="rounded-xl bg-[#BE123C] px-2 py-1 text-[11px] font-bold text-white hover:bg-[#9F1239] cursor-pointer"
                            >
                              Xóa
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteStudentId(null)}
                              className="rounded-xl border border-[#F5BDD6] bg-white px-2 py-1 text-[11px] font-bold text-[#7C5266] cursor-pointer"
                            >
                              Hủy
                            </button>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSelectStudent(st, 'table')}
                        className="w-full text-left pl-5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D64] rounded-lg"
                      >
                        <div className="text-xs text-[#7C5266] truncate">
                          {formatMonthDisplay(targetMonth)}
                          {st.studySchedule ? ` · ${st.studySchedule}` : ''}
                        </div>
                        <div
                          className="mt-0.5 text-xs font-bold"
                          style={{ color: tone.accentText }}
                        >
                          <span className="font-mono-tabular">{stSummary.completedCount}</span> buổi hoàn thành ·{' '}
                          <span className="font-mono-tabular">{formatCurrencyVnd(stSummary.totalTuition)}</span>
                        </div>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </aside>

      {/* Main Panel: Only shown when a student is selected */}
      {activeStudent && (
        <div className="min-w-0 w-full flex-1 space-y-5">
          {detailMode === 'table' ? (
            /* Bảng học phí (STT, Ngày học, Nội dung, Tình trạng lớp học, Thao tác) đưa lên trên cùng */
            <section
              aria-label="Bảng học phí chi tiết"
              className="rounded-3xl border bg-white overflow-hidden shadow-xs"
              style={{ borderColor: activeTheme.border }}
            >
              {/* Compact Sheet Header directly atop the table */}
              <div
                className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"
                style={{
                  backgroundColor: activeTheme.headerBg,
                  borderColor: activeTheme.border,
                }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    aria-hidden="true"
                    className="h-3.5 w-3.5 rounded-full border border-black/10 shrink-0"
                    style={{ backgroundColor: activeTheme.hex }}
                  />
                  <div className="min-w-0">
                    <h2
                      className="text-base sm:text-lg font-extrabold truncate"
                      style={{ color: activeTheme.textDark }}
                    >
                      Bảng học phí: {activeStudent.studentName}
                    </h2>
                    <p
                      className="text-xs font-semibold opacity-85"
                      style={{ color: activeTheme.textDark }}
                    >
                      {formatMonthDisplay(activeMonthNum)} ·{' '}
                      <span className="font-mono-tabular">{activeSummary.completedCount}</span> buổi hoàn thành ·{' '}
                      <span className="font-mono-tabular">{formatCurrencyVnd(activeSummary.totalTuition)}</span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div
                    className="flex items-center gap-1.5 rounded-2xl border bg-white px-2.5 py-1.5 text-xs"
                    style={{ borderColor: activeTheme.border }}
                  >
                    <label
                      htmlFor="tuition-month-picker"
                      className="font-bold text-[#7C5266]"
                    >
                      Tháng:
                    </label>
                    <select
                      id="tuition-month-picker"
                      value={activeMonthNum}
                      onChange={(e) => setActiveMonthNum(Number(e.target.value))}
                      className="bg-transparent font-bold text-[#3D1A2B] focus:outline-none cursor-pointer"
                    >
                      {TUITION_MONTH_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingInline(true);
                      setEditingSessionId(null);
                      setSessionErrors({});
                    }}
                    className="inline-flex items-center gap-1 rounded-2xl px-3 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90 cursor-pointer whitespace-nowrap"
                    style={{ backgroundColor: activeTheme.buttonBg }}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Nhập buổi thủ công</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportStudentCsv}
                    className="inline-flex items-center gap-1.5 rounded-2xl border bg-white px-3 py-1.5 text-xs font-bold transition-opacity hover:opacity-90 cursor-pointer whitespace-nowrap"
                    style={{
                      borderColor: activeTheme.border,
                      color: activeTheme.accentText,
                    }}
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Xuất Sheet</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedStudentId('')}
                    aria-label="Đóng bảng học phí chi tiết"
                    className="inline-flex items-center gap-1 rounded-2xl border bg-white px-2.5 py-1.5 text-xs font-bold text-[#7C5266] hover:bg-[#FFE3EE] cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">Ẩn</span>
                  </button>
                </div>
              </div>

              {(sessionErrors.date || sessionErrors.content || sessionErrors.submit) && (
                <div className="border-b border-[#FECDD3] bg-[#FFF1F2] px-4 py-2 text-xs font-semibold text-[#BE123C]">
                  {sessionErrors.submit || sessionErrors.content || sessionErrors.date}
                </div>
              )}

              {/* Lesson Table */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead>
                    <tr
                      className="border-b text-xs font-bold"
                      style={{
                        backgroundColor: activeTheme.softBg,
                        borderColor: activeTheme.border,
                        color: activeTheme.textDark,
                      }}
                    >
                      <th className="w-16 px-4 py-3 text-center">STT</th>
                      <th className="w-48 px-4 py-3">Ngày học</th>
                      <th className="px-4 py-3">Nội dung</th>
                      <th className="w-40 px-4 py-3">Tình trạng lớp học</th>
                      <th className="w-36 px-4 py-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: activeTheme.border }}>
                    {activeSessions.length === 0 && !isAddingInline ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-8 text-center text-sm text-[#7C5266]"
                        >
                          Chưa có buổi học nào trong {formatMonthDisplay(activeMonthNum)}. Buổi học từ lịch sẽ tự động cập nhật hoặc bấm{' '}
                          <button
                            type="button"
                            onClick={() => {
                              setIsAddingInline(true);
                              setSessionErrors({});
                            }}
                            className="font-bold underline cursor-pointer"
                            style={{ color: activeTheme.accentText }}
                          >
                            Nhập buổi thủ công
                          </button>
                          .
                        </td>
                      </tr>
                    ) : (
                      activeSessions.map((session, index) => {
                        const isEditing = editingSessionId === session.id;
                        const isCompleted = session.status === 'completed';
                        const isHighlightedTarget = Boolean(
                          jumpTarget && session.date === jumpTarget.dateKey,
                        );

                        return (
                          <tr
                            key={session.id}
                            className={`transition-colors ${
                              isHighlightedTarget ? 'bg-[#FFF0F6]' : 'hover:bg-black/[0.02]'
                            }`}
                            style={{ borderColor: activeTheme.border }}
                          >
                            <td className="px-4 py-3 text-center font-bold text-[#7C5266] font-mono-tabular">
                              {index + 1}
                            </td>

                            <td className="px-4 py-3 text-[#3D1A2B] font-semibold">
                              {isEditing ? (
                                <select
                                  aria-label={`Ngày học buổi ${index + 1}`}
                                  value={editingSessionDate}
                                  onChange={(e) => setEditingSessionDate(e.target.value)}
                                  className="w-full rounded-xl border bg-white px-2.5 py-1 text-xs font-mono-tabular focus:outline-none"
                                  style={{ borderColor: activeTheme.border }}
                                >
                                  {monthDayOptions.map((opt) => (
                                    <option key={opt.dateKey} value={opt.dateKey}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                formatVietnameseWeekdayDate(session.date)
                              )}
                            </td>

                            <td className="px-4 py-3 text-[#3D1A2B]">
                              {isEditing ? (
                                <input
                                  type="text"
                                  aria-label={`Nội dung buổi ${index + 1}`}
                                  value={editingSessionContent}
                                  onChange={(e) => setEditingSessionContent(e.target.value)}
                                  className="w-full rounded-xl border bg-white px-2.5 py-1 text-sm focus:outline-none"
                                  style={{ borderColor: activeTheme.border }}
                                />
                              ) : (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span>{session.content}</span>
                                  {session.sourceTaskId && (
                                    <span
                                      className="text-[11px] font-bold opacity-80"
                                      style={{ color: activeTheme.accentText }}
                                    >
                                      · Từ lịch
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>

                            <td className="px-4 py-3">
                              {isEditing ? (
                                <select
                                  aria-label={`Tình trạng buổi ${index + 1}`}
                                  value={editingSessionStatus}
                                  onChange={(e) =>
                                    setEditingSessionStatus(
                                      e.target.value as TuitionSessionStatus,
                                    )
                                  }
                                  className="w-full rounded-xl border bg-white px-2.5 py-1 text-xs font-bold text-[#3D1A2B] focus:outline-none"
                                  style={{ borderColor: activeTheme.border }}
                                >
                                  <option value="completed">Hoàn thành</option>
                                  <option value="absent">Nghỉ</option>
                                </select>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void onUpdateSession(activeStudent.id, session.id, {
                                      status: isCompleted ? 'absent' : 'completed',
                                    })
                                  }
                                  title="Bấm để đổi trạng thái Hoàn thành / Nghỉ"
                                  className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                                    isCompleted
                                      ? 'border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D] hover:bg-[#DCFCE7]'
                                      : 'border-[#FECDD3] bg-[#FFF1F2] text-[#BE123C] hover:bg-[#FFE4E6]'
                                  }`}
                                >
                                  {isCompleted ? (
                                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                                  ) : (
                                    <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                  )}
                                  <span>{isCompleted ? 'Hoàn thành' : 'Nghỉ'}</span>
                                </button>
                              )}
                            </td>

                            <td className="px-4 py-3 text-right">
                              {isEditing ? (
                                <div className="inline-flex items-center gap-1 whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => void handleSaveSessionEdit(session.id)}
                                    aria-label={`Lưu buổi học ${index + 1}`}
                                    className="rounded-xl bg-[#15803D] p-1.5 text-white hover:bg-[#166534] cursor-pointer"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingSessionId(null)}
                                    aria-label={`Hủy sửa buổi học ${index + 1}`}
                                    className="rounded-xl border border-[#F5BDD6] bg-white p-1.5 text-[#7C5266] hover:bg-[#FFE3EE] cursor-pointer"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1 whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onNavigateToSessionTask(
                                        session.date,
                                        activeStudent.studentName,
                                        session.sourceTaskId,
                                        session.content,
                                      )
                                    }
                                    title={`Mở task ngày ${formatVietnameseWeekdayDate(session.date)}`}
                                    aria-label={`Đi tới task ngày ${formatVietnameseWeekdayDate(session.date)}`}
                                    className="rounded-xl p-1.5 text-[#9D174D] hover:bg-[#FFE3EE] hover:text-[#3D1A2B] cursor-pointer"
                                  >
                                    <ArrowRight className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => startEditingSession(session)}
                                    aria-label={`Sửa buổi học ${index + 1}`}
                                    className="rounded-xl p-1.5 text-[#7C5266] hover:bg-[#FFE3EE] hover:text-[#3D1A2B] cursor-pointer"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void onDeleteSession(activeStudent.id, session.id)
                                    }
                                    aria-label={`Xóa buổi học ${index + 1}`}
                                    className="rounded-xl p-1.5 text-[#B48EA0] hover:bg-[#FFF1F2] hover:text-[#BE123C] cursor-pointer"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}

                    {/* Inline Manual Add Row directly inside the table */}
                    {isAddingInline && (
                      <tr
                        style={{
                          backgroundColor: activeTheme.softBg,
                          borderColor: activeTheme.border,
                        }}
                      >
                        <td className="px-4 py-3 text-center font-bold text-[#7C5266]">
                          <Plus className="h-4 w-4 mx-auto" aria-hidden="true" />
                        </td>
                        <td className="px-4 py-3">
                          <select
                            aria-label="Chọn ngày học thủ công"
                            value={sessionDate}
                            onChange={(e) => {
                              setSessionDate(e.target.value);
                              if (sessionErrors.date) setSessionErrors((p) => ({ ...p, date: '' }));
                            }}
                            className="w-full rounded-xl border bg-white px-2.5 py-1.5 text-xs font-semibold text-[#3D1A2B] font-mono-tabular focus:outline-none cursor-pointer"
                            style={{ borderColor: activeTheme.border }}
                          >
                            {monthDayOptions.map((opt) => (
                              <option key={opt.dateKey} value={opt.dateKey}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            aria-label="Nhập nội dung buổi học thủ công"
                            value={sessionContent}
                            onChange={(e) => {
                              setSessionContent(e.target.value);
                              if (sessionErrors.content) {
                                setSessionErrors((p) => ({ ...p, content: '' }));
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void handleSaveInlineSession();
                              } else if (e.key === 'Escape') {
                                setIsAddingInline(false);
                                setSessionErrors({});
                              }
                            }}
                            placeholder="Nhập nội dung buổi học..."
                            autoFocus
                            className="w-full rounded-xl border bg-white px-3 py-1.5 text-sm text-[#3D1A2B] focus:outline-none"
                            style={{ borderColor: activeTheme.border }}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <select
                            aria-label="Chọn tình trạng buổi học thủ công"
                            value={sessionStatus}
                            onChange={(e) => setSessionStatus(e.target.value as TuitionSessionStatus)}
                            className="w-full rounded-xl border bg-white px-2.5 py-1.5 text-xs font-bold text-[#3D1A2B] focus:outline-none cursor-pointer"
                            style={{ borderColor: activeTheme.border }}
                          >
                            <option value="completed">Hoàn thành</option>
                            <option value="absent">Nghỉ</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1 whitespace-nowrap">
                            <button
                              type="button"
                              disabled={isAddingSession}
                              onClick={() => void handleSaveInlineSession()}
                              aria-label="Lưu buổi học mới"
                              className="rounded-xl bg-[#15803D] p-1.5 text-white hover:bg-[#166534] cursor-pointer disabled:opacity-50"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsAddingInline(false);
                                setSessionErrors({});
                              }}
                              aria-label="Hủy thêm buổi học"
                              className="rounded-xl border border-[#F5BDD6] bg-white p-1.5 text-[#7C5266] hover:bg-[#FFE3EE] cursor-pointer"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>

                  {/* Monthly Summary Footer: completed & absent counts only (no combined sum) + tuition */}
                  <tfoot>
                    <tr
                      className="border-t-2"
                      style={{
                        backgroundColor: activeTheme.softBg,
                        borderColor: activeTheme.border,
                      }}
                    >
                      <td
                        colSpan={3}
                        className="px-4 py-3.5 text-sm font-bold"
                        style={{ color: activeTheme.textDark }}
                      >
                        <span>Tổng hợp {formatMonthDisplay(activeMonthNum)}: </span>
                        <span
                          className="font-extrabold"
                          style={{ color: activeTheme.accentText }}
                        >
                          <span className="font-mono-tabular">{activeSummary.completedCount}</span> buổi hoàn thành
                        </span>
                        <span className="text-[#5C4B54] font-semibold">
                          {' '}
                          · <span className="font-mono-tabular">{activeSummary.absentCount}</span> buổi nghỉ
                        </span>
                      </td>
                      <td
                        colSpan={2}
                        className="px-4 py-3.5 text-right text-sm font-extrabold"
                        style={{ color: activeTheme.accentText }}
                      >
                        Học phí tháng:{' '}
                        <span className="font-mono-tabular">
                          {formatCurrencyVnd(activeSummary.totalTuition)}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          ) : (
            /* Thông tin chung Card (mở từ trình đơn Tùy chọn -> Thông tin chung) */
            <section
              aria-label="Thông tin chung học sinh"
              className="rounded-3xl border bg-white p-5 sm:p-6 shadow-xs space-y-4"
              style={{ borderColor: activeTheme.border }}
            >
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3"
                style={{
                  backgroundColor: activeTheme.headerBg,
                  borderColor: activeTheme.border,
                }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 rounded-full border border-black/10 shrink-0"
                    style={{ backgroundColor: activeTheme.hex }}
                  />
                  <div className="min-w-0">
                    <h2
                      className="text-lg font-extrabold truncate"
                      style={{ color: activeTheme.textDark }}
                    >
                      Thông tin chung: {activeStudent.studentName}
                    </h2>
                    <p className="text-xs font-semibold opacity-80" style={{ color: activeTheme.textDark }}>
                      Cài đặt tên, thời gian học, học phí mỗi buổi và phân loại màu
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDetailMode('table')}
                    className="inline-flex items-center gap-1 rounded-2xl border bg-white px-3 py-1.5 text-xs font-bold transition-opacity hover:opacity-90 cursor-pointer whitespace-nowrap"
                    style={{
                      borderColor: activeTheme.border,
                      color: activeTheme.accentText,
                    }}
                  >
                    <span>Mở Bảng học phí</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedStudentId('')}
                    aria-label="Đóng thông tin chung"
                    className="inline-flex items-center gap-1 rounded-2xl border bg-white px-2.5 py-1.5 text-xs font-bold text-[#7C5266] hover:bg-[#FFE3EE] cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">Ẩn</span>
                  </button>
                </div>
              </div>

              {editInfoErrors.submit && (
                <div className="rounded-2xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-2 text-xs font-semibold text-[#BE123C]">
                  {editInfoErrors.submit}
                </div>
              )}

              {/* General Info Grid */}
              <form onSubmit={handleSaveGeneralInfo} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3.5">
                  <div>
                    <label
                      htmlFor="edit-student-name"
                      className="block text-xs font-bold text-[#7C5266] mb-1"
                    >
                      Tên học sinh
                    </label>
                    <input
                      id="edit-student-name"
                      type="text"
                      value={editName}
                      onChange={(e) => {
                        setEditName(e.target.value);
                        if (editInfoErrors.studentName) {
                          setEditInfoErrors((p) => ({ ...p, studentName: '' }));
                        }
                      }}
                      className="w-full rounded-2xl border bg-[#FFFDFD] px-3.5 py-2 text-sm font-bold text-[#3D1A2B] focus:outline-none"
                      style={{ borderColor: activeTheme.border }}
                    />
                    {editInfoErrors.studentName && (
                      <p className="mt-1 text-xs font-semibold text-[#BE123C]">
                        {editInfoErrors.studentName}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="edit-student-schedule"
                      className="block text-xs font-bold text-[#7C5266] mb-1"
                    >
                      Thời gian học
                    </label>
                    <input
                      id="edit-student-schedule"
                      type="text"
                      value={editSchedule}
                      onChange={(e) => setEditSchedule(e.target.value)}
                      placeholder="Ví dụ: Thứ 3 & Thứ 5 · 18h-19h30"
                      className="w-full rounded-2xl border bg-[#FFFDFD] px-3.5 py-2 text-sm font-semibold text-[#3D1A2B] focus:outline-none"
                      style={{ borderColor: activeTheme.border }}
                    />
                  </div>

                  <div
                    className="rounded-2xl border px-3.5 py-2"
                    style={{
                      backgroundColor: activeTheme.headerBg,
                      borderColor: activeTheme.border,
                    }}
                  >
                    <div
                      className="text-xs font-bold"
                      style={{ color: activeTheme.textDark }}
                    >
                      Học phí {formatMonthDisplay(activeMonthNum)}
                    </div>
                    <div
                      className="mt-0.5 text-lg font-extrabold font-mono-tabular"
                      style={{ color: activeTheme.accentText }}
                    >
                      {formatCurrencyVnd(activeSummary.totalTuition)}
                    </div>
                    <div className="text-[11px] font-semibold text-[#7C5266]">
                      {activeSummary.completedCount} buổi hoàn thành
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="edit-student-fee"
                      className="block text-xs font-bold text-[#7C5266] mb-1"
                    >
                      Học phí mỗi buổi (VNĐ)
                    </label>
                    <input
                      id="edit-student-fee"
                      type="number"
                      min={0}
                      step={10000}
                      value={editFee}
                      onChange={(e) => {
                        setEditFee(e.target.value);
                        if (editInfoErrors.feePerSession) {
                          setEditInfoErrors((p) => ({ ...p, feePerSession: '' }));
                        }
                      }}
                      className="w-full rounded-2xl border bg-[#FFFDFD] px-3.5 py-2 text-sm font-bold text-[#3D1A2B] font-mono-tabular focus:outline-none"
                      style={{ borderColor: activeTheme.border }}
                    />
                    {editInfoErrors.feePerSession && (
                      <p className="mt-1 text-xs font-semibold text-[#BE123C]">
                        {editInfoErrors.feePerSession}
                      </p>
                    )}
                  </div>

                  <div>
                    <TuitionColorPicker
                      id="edit-student-color"
                      label="Phân loại màu"
                      value={editColor}
                      onChange={setEditColor}
                      borderColor={activeTheme.border}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3">
                  {savedInfoNotice && (
                    <span className="text-xs font-bold text-[#15803D]">
                      Đã lưu và tự sao lưu thông tin chung
                    </span>
                  )}
                  <button
                    type="submit"
                    disabled={isSavingInfo}
                    className="inline-flex items-center gap-1.5 rounded-2xl border px-4 py-2 text-xs font-bold transition-opacity hover:opacity-90 cursor-pointer disabled:opacity-50"
                    style={{
                      backgroundColor: activeTheme.softBg,
                      borderColor: activeTheme.border,
                      color: activeTheme.accentText,
                    }}
                  >
                    <Save className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{isSavingInfo ? 'Đang lưu...' : 'Lưu thông tin chung'}</span>
                  </button>
                </div>
              </form>
            </section>
          )}
        </div>
      )}
      </div>

      {/* Bottom section: Thêm học sinh mới luôn nằm dưới cùng, dưới cả Bảng học phí chi tiết */}
      <section
        aria-label="Thêm học sinh mới"
        className={`rounded-3xl border border-[#F5BDD6] bg-white p-5 sm:p-6 shadow-xs ${
          activeStudent ? 'w-full' : 'w-full max-w-4xl mx-auto'
        }`}
      >
        <div className="flex items-center gap-2 text-sm font-bold text-[#3D1A2B]">
          <UserPlus className="h-4 w-4 text-[#E11D64]" aria-hidden="true" />
          <h2>Thêm học sinh mới</h2>
        </div>

        <form onSubmit={handleCreateStudentSubmit} className="mt-4 space-y-4">
          {studentFormErrors.submit && (
            <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3 py-2 text-xs font-semibold text-[#BE123C]">
              {studentFormErrors.submit}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5 items-start">
            <div className="lg:col-span-4">
              <label
                htmlFor="new-student-name"
                className="block text-xs font-bold text-[#3D1A2B] mb-1"
              >
                Tên học sinh <span className="text-[#E11D64]">*</span>
              </label>
              <input
                id="new-student-name"
                type="text"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  if (studentFormErrors.studentName) {
                    setStudentFormErrors((p) => ({ ...p, studentName: '' }));
                  }
                }}
                placeholder="Ví dụ: Bé Bông, Minh Anh..."
                className="w-full rounded-2xl border border-[#F5BDD6] bg-[#FFFDFD] px-3.5 py-2 text-sm text-[#3D1A2B] focus:border-[#E11D64] focus:outline-none"
              />
              {studentFormErrors.studentName && (
                <p className="mt-1 text-xs font-semibold text-[#BE123C]">
                  {studentFormErrors.studentName}
                </p>
              )}
            </div>

            <div className="lg:col-span-2">
              <label
                htmlFor="new-student-month"
                className="block text-xs font-bold text-[#3D1A2B] mb-1"
              >
                Tháng
              </label>
              <select
                id="new-student-month"
                value={newMonth}
                onChange={(e) => setNewMonth(Number(e.target.value))}
                className="w-full rounded-2xl border border-[#F5BDD6] bg-[#FFFDFD] px-3 py-2 text-sm font-semibold text-[#3D1A2B] focus:border-[#E11D64] focus:outline-none cursor-pointer"
              >
                {TUITION_MONTH_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-3">
              <label
                htmlFor="new-student-fee"
                className="block text-xs font-bold text-[#3D1A2B] mb-1"
              >
                Học phí / buổi (VNĐ)
              </label>
              <input
                id="new-student-fee"
                type="number"
                min={0}
                step={10000}
                value={newFee}
                onChange={(e) => {
                  setNewFee(e.target.value);
                  if (studentFormErrors.feePerSession) {
                    setStudentFormErrors((p) => ({ ...p, feePerSession: '' }));
                  }
                }}
                placeholder="200000"
                className="w-full rounded-2xl border border-[#F5BDD6] bg-[#FFFDFD] px-3 py-2 text-sm text-[#3D1A2B] font-mono-tabular focus:border-[#E11D64] focus:outline-none"
              />
              {studentFormErrors.feePerSession && (
                <p className="mt-1 text-xs font-semibold text-[#BE123C]">
                  {studentFormErrors.feePerSession}
                </p>
              )}
            </div>

            <div className="lg:col-span-3">
              <TuitionColorPicker
                id="new-student-color"
                label="Phân loại màu"
                value={newColor}
                onChange={setNewColor}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isCreatingStudent}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-2xl bg-[#E11D64] px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#BE185D] disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>{isCreatingStudent ? 'Đang tạo bảng...' : 'Thêm học sinh'}</span>
            </button>
          </div>
        </form>
      </section>

      <TuitionSlipModal
        student={slipStudent}
        initialMonth={
          slipStudent
            ? activeStudent?.id === slipStudent.id
              ? activeMonthNum
              : slipStudent.month >= 1 && slipStudent.month <= 12
                ? slipStudent.month
                : currentMonthNum
            : currentMonthNum
        }
        onClose={() => setSlipStudentId(null)}
      />
    </div>
  );
}
