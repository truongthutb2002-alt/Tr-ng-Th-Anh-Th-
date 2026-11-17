import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { DailyNoteInput, DailyNoteItem, DailyNoteKind } from '../types/planner';
import { getNotesForDate, validateDailyNoteInput } from '../utils/notes';
import { parseDateKey } from '../utils/schedule';
import {
  Check,
  CheckSquare,
  FileText,
  NotebookPen,
  Pencil,
  Square,
  Trash2,
  X,
} from 'lucide-react';

interface DailyNotesModalProps {
  isOpen: boolean;
  selectedDate: string;
  notes: DailyNoteItem[];
  onClose: () => void;
  onCreateNote: (input: DailyNoteInput) => Promise<void>;
  onUpdateNote: (noteId: string, patch: Partial<DailyNoteInput>) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
  onClearDayNotes: (dateKey: string) => Promise<void>;
}

export function DailyNotesModal({
  isOpen,
  selectedDate,
  notes,
  onClose,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
  onClearDayNotes,
}: DailyNotesModalProps) {
  const [composerKind, setComposerKind] = useState<DailyNoteKind | null>(null);
  const [draftContent, setDraftContent] = useState('');
  const [composerError, setComposerError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [isEditMode, setIsEditMode] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');

  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const dayNotes = useMemo(() => getNotesForDate(notes, selectedDate), [notes, selectedDate]);

  useEffect(() => {
    if (!isOpen) {
      setComposerKind(null);
      setDraftContent('');
      setComposerError('');
      setIsEditMode(false);
      setEditingNoteId(null);
      setEditingDraft('');
      setIsDeleteMode(false);
      setConfirmClearAll(false);
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (composerKind) {
          setComposerKind(null);
          setDraftContent('');
          setComposerError('');
        } else if (editingNoteId) {
          setEditingNoteId(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, composerKind, editingNoteId, onClose]);

  useEffect(() => {
    setComposerKind(null);
    setDraftContent('');
    setComposerError('');
    setIsEditMode(false);
    setEditingNoteId(null);
    setIsDeleteMode(false);
    setConfirmClearAll(false);
  }, [selectedDate]);

  if (!isOpen) return null;

  const dateLabel = parseDateKey(selectedDate).toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const handleOpenComposer = (kind: DailyNoteKind) => {
    setIsDeleteMode(false);
    setConfirmClearAll(false);
    setIsEditMode(false);
    setEditingNoteId(null);
    setComposerError('');
    setDraftContent('');
    setComposerKind((prev) => (prev === kind ? null : kind));
  };

  const handleToggleEditMode = () => {
    setComposerKind(null);
    setIsDeleteMode(false);
    setConfirmClearAll(false);
    setComposerError('');
    setIsEditMode((prev) => {
      const next = !prev;
      if (next && dayNotes.length > 0) {
        const first = dayNotes[0];
        setEditingNoteId(first.id);
        setEditingDraft(first.content);
      } else {
        setEditingNoteId(null);
        setEditingDraft('');
      }
      return next;
    });
  };

  const handleToggleDeleteMode = () => {
    setComposerKind(null);
    setIsEditMode(false);
    setEditingNoteId(null);
    setComposerError('');
    setConfirmClearAll(false);
    setIsDeleteMode((prev) => !prev);
  };

  const handleCreateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!composerKind) return;

    const payload: DailyNoteInput = {
      date: selectedDate,
      kind: composerKind,
      content: draftContent.trim(),
      checked: false,
    };
    const errs = validateDailyNoteInput(payload);
    if (Object.keys(errs).length > 0) {
      setComposerError(Object.values(errs)[0] || 'Vui lòng nhập nội dung ghi chú.');
      return;
    }

    setIsSaving(true);
    setComposerError('');
    try {
      await onCreateNote(payload);
      setDraftContent('');
      if (composerKind === 'text') {
        setComposerKind(null);
      }
    } catch (err) {
      setComposerError(err instanceof Error ? err.message : 'Không thể lưu ghi chú.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveNoteEdit = async (note: DailyNoteItem) => {
    const trimmed = editingDraft.trim();
    if (!trimmed) {
      setComposerError('Vui lòng nhập nội dung ghi chú.');
      return;
    }
    setComposerError('');
    if (trimmed !== note.content) {
      await onUpdateNote(note.id, { content: trimmed });
    }
    setEditingNoteId(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#3D1A2B]/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="daily-notes-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-md rounded-3xl border border-[#F5BDD6] bg-white shadow-2xl overflow-hidden flex flex-col max-h-[84vh]">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-[#F5BDD6] bg-[#FFE3EE] px-5 py-3.5 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <NotebookPen className="h-4 w-4 text-[#E11D64] shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <h2 id="daily-notes-modal-title" className="text-base font-extrabold text-[#3D1A2B]">
                Ghi chú theo ngày
              </h2>
              <p className="text-[11px] font-semibold capitalize text-[#7C5266] truncate">
                {dateLabel}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng bảng ghi chú"
            className="rounded-xl p-1.5 text-[#7C5266] hover:bg-white/70 hover:text-[#3D1A2B] cursor-pointer shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body: Notes list for selectedDate */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 bg-white">
          {composerError && (
            <p
              role="alert"
              className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3 py-2 text-xs font-semibold text-[#BE123C]"
            >
              {composerError}
            </p>
          )}

          {isDeleteMode && dayNotes.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#FECDD3] bg-[#FFF1F2] px-3 py-2 text-xs">
              <span className="font-bold text-[#BE123C]">
                Chọn biểu tượng thùng rác trên từng ghi chú để xóa.
              </span>
              {!confirmClearAll ? (
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(true)}
                  className="font-extrabold text-[#9F1239] underline hover:opacity-80 cursor-pointer"
                >
                  Xóa cả ngày
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmClearAll(false);
                      setIsDeleteMode(false);
                      void onClearDayNotes(selectedDate);
                    }}
                    className="rounded-lg bg-[#BE123C] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#9F1239] cursor-pointer"
                  >
                    Xác nhận xóa hết
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(false)}
                    className="rounded-lg border border-[#F5BDD6] bg-white px-2 py-1 text-[11px] font-bold text-[#7C5266] cursor-pointer"
                  >
                    Hủy
                  </button>
                </div>
              )}
            </div>
          )}

          {dayNotes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#F5BDD6] bg-[#FFF8FB] px-4 py-8 text-center text-xs font-medium text-[#7C5266]">
              Chưa có ghi chú nào cho ngày này. Chọn biểu tượng ở cạnh dưới để thêm ô tick việc hoặc văn bản thông thường.
            </div>
          ) : (
            <ul className="space-y-2">
              {dayNotes.map((note) => {
                const isEditingThis = editingNoteId === note.id;
                const isChecklist = note.kind === 'checklist';

                return (
                  <li
                    key={note.id}
                    className={`rounded-2xl border p-3 transition-colors ${
                      isChecklist
                        ? note.checked
                          ? 'border-[#BBF7D0] bg-[#FAFDFB]'
                          : 'border-[#F5BDD6] bg-[#FFF8FB]'
                        : 'border-[#F0C6D8] bg-[#FFFDFD]'
                    }`}
                  >
                    {isEditingThis ? (
                      <div className="space-y-2">
                        {isChecklist ? (
                          <input
                            type="text"
                            autoFocus
                            aria-label="Chỉnh sửa ô tick việc"
                            value={editingDraft}
                            onChange={(e) => setEditingDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void handleSaveNoteEdit(note);
                              } else if (e.key === 'Escape') {
                                e.stopPropagation();
                                setEditingNoteId(null);
                              }
                            }}
                            className="w-full rounded-xl border border-[#E11D64] bg-white px-3 py-1.5 text-sm font-medium text-[#3D1A2B] focus:outline-none"
                          />
                        ) : (
                          <textarea
                            rows={3}
                            autoFocus
                            aria-label="Chỉnh sửa văn bản ghi chú"
                            value={editingDraft}
                            onChange={(e) => setEditingDraft(e.target.value)}
                            className="w-full rounded-xl border border-[#E11D64] bg-white px-3 py-2 text-sm text-[#3D1A2B] focus:outline-none"
                          />
                        )}
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingNoteId(null)}
                            className="rounded-xl border border-[#F5BDD6] bg-white px-2.5 py-1 text-xs font-bold text-[#7C5266] hover:bg-[#FFE3EE] cursor-pointer"
                          >
                            Hủy
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleSaveNoteEdit(note)}
                            className="inline-flex items-center gap-1 rounded-xl bg-[#15803D] px-3 py-1 text-xs font-bold text-white hover:bg-[#166534] cursor-pointer"
                          >
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Lưu</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          {isChecklist ? (
                            <button
                              type="button"
                              onClick={() =>
                                void onUpdateNote(note.id, { checked: !note.checked })
                              }
                              aria-label={
                                note.checked
                                  ? `Bỏ tick ${note.content}`
                                  : `Tick hoàn thành ${note.content}`
                              }
                              className="mt-0.5 shrink-0 text-[#E11D64] hover:opacity-80 cursor-pointer"
                            >
                              {note.checked ? (
                                <CheckSquare className="h-4.5 w-4.5 text-[#15803D]" />
                              ) : (
                                <Square className="h-4.5 w-4.5 text-[#9D174D]" />
                              )}
                            </button>
                          ) : (
                            <FileText
                              className="mt-0.5 h-4 w-4 shrink-0 text-[#9D174D]"
                              aria-hidden="true"
                            />
                          )}

                          <p
                            className={`text-sm leading-relaxed whitespace-pre-wrap break-words ${
                              isChecklist && note.checked
                                ? 'line-through text-[#7C5266]'
                                : 'text-[#3D1A2B]'
                            }`}
                          >
                            {note.content}
                          </p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {isEditMode && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingNoteId(note.id);
                                setEditingDraft(note.content);
                              }}
                              aria-label={`Chỉnh sửa ghi chú: ${note.content}`}
                              className="rounded-xl p-1.5 text-[#9D174D] bg-[#FFE3EE] hover:bg-[#FFD6E7] cursor-pointer"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {isDeleteMode && (
                            <button
                              type="button"
                              onClick={() => void onDeleteNote(note.id)}
                              aria-label={`Xóa ghi chú: ${note.content}`}
                              className="rounded-xl p-1.5 text-[#BE123C] bg-[#FFF1F2] hover:bg-[#FFE4E6] cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/* Active Composer Area when user selects Ô tick việc or Văn bản thông thường */}
          {composerKind && (
            <form
              onSubmit={handleCreateSubmit}
              className="rounded-2xl border border-[#E11D64]/40 bg-[#FFF8FB] p-3 space-y-2.5"
            >
              <div className="text-xs font-extrabold text-[#9D174D]">
                {composerKind === 'checklist'
                  ? 'Thêm ô tick việc mới'
                  : 'Thêm văn bản thông thường'}
              </div>

              {composerKind === 'checklist' ? (
                <input
                  type="text"
                  autoFocus
                  value={draftContent}
                  onChange={(e) => {
                    setDraftContent(e.target.value);
                    if (composerError) setComposerError('');
                  }}
                  placeholder="Nhập nội dung ô tick việc..."
                  className="w-full rounded-xl border border-[#F0C6D8] bg-white px-3 py-2 text-sm text-[#3D1A2B] focus:border-[#E11D64] focus:outline-none"
                />
              ) : (
                <textarea
                  rows={3}
                  autoFocus
                  value={draftContent}
                  onChange={(e) => {
                    setDraftContent(e.target.value);
                    if (composerError) setComposerError('');
                  }}
                  placeholder="Nhập ghi chú văn bản cho ngày này..."
                  className="w-full rounded-xl border border-[#F0C6D8] bg-white px-3 py-2 text-sm text-[#3D1A2B] focus:border-[#E11D64] focus:outline-none"
                />
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setComposerKind(null);
                    setDraftContent('');
                    setComposerError('');
                  }}
                  className="rounded-xl border border-[#F5BDD6] bg-white px-3 py-1.5 text-xs font-bold text-[#7C5266] hover:bg-[#FFE3EE] cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-1 rounded-xl bg-[#E11D64] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#BE185D] disabled:opacity-50 cursor-pointer"
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{isSaving ? 'Đang lưu...' : 'Thêm ghi chú'}</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Bottom Edge Icon Bar: Ô tick việc, Văn bản thông thường, Chỉnh sửa, Xóa */}
        <div
          role="toolbar"
          aria-label="Thanh công cụ ghi chú"
          className="flex items-center justify-around border-t border-[#F5BDD6] bg-[#FFF0F6] px-4 py-2.5 shrink-0"
        >
          <button
            type="button"
            onClick={() => handleOpenComposer('checklist')}
            aria-label="Ô tick việc"
            title="Ô tick việc"
            aria-pressed={composerKind === 'checklist'}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition-colors cursor-pointer ${
              composerKind === 'checklist'
                ? 'border-[#E11D64] bg-[#E11D64] text-white shadow-xs'
                : 'border-[#F5BDD6] bg-white text-[#9D174D] hover:bg-[#FFE3EE]'
            }`}
          >
            <CheckSquare className="h-4.5 w-4.5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => handleOpenComposer('text')}
            aria-label="Văn bản thông thường"
            title="Văn bản thông thường"
            aria-pressed={composerKind === 'text'}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition-colors cursor-pointer ${
              composerKind === 'text'
                ? 'border-[#E11D64] bg-[#E11D64] text-white shadow-xs'
                : 'border-[#F5BDD6] bg-white text-[#9D174D] hover:bg-[#FFE3EE]'
            }`}
          >
            <FileText className="h-4.5 w-4.5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={handleToggleEditMode}
            aria-label="Chỉnh sửa"
            title="Chỉnh sửa"
            aria-pressed={isEditMode}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition-colors cursor-pointer ${
              isEditMode
                ? 'border-[#E11D64] bg-[#E11D64] text-white shadow-xs'
                : 'border-[#F5BDD6] bg-white text-[#9D174D] hover:bg-[#FFE3EE]'
            }`}
          >
            <Pencil className="h-4.5 w-4.5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={handleToggleDeleteMode}
            aria-label="Xóa"
            title="Xóa"
            aria-pressed={isDeleteMode}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition-colors cursor-pointer ${
              isDeleteMode
                ? 'border-[#BE123C] bg-[#BE123C] text-white shadow-xs'
                : 'border-[#F5BDD6] bg-white text-[#BE123C] hover:bg-[#FFF1F2]'
            }`}
          >
            <Trash2 className="h-4.5 w-4.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
