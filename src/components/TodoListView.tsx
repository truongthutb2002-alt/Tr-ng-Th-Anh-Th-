import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { TodoInput, TodoItem, TodoPriority, TodoStatus } from '../types/planner';
import {
  formatShortDateDdMm,
  resolveTodosForDate,
  TODO_PRIORITY_LABELS,
  TODO_PRIORITY_OPTIONS,
  TODO_STATUS_LABELS,
  TODO_STATUS_OPTIONS,
  validateTodoInput,
  type ResolvedTodoItem,
} from '../utils/todo';
import {
  Check,
  CheckCircle2,
  Circle,
  Clock,
  Flag,
  History,
  ListTodo,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

interface TodoListViewProps {
  selectedDate: string;
  todos: TodoItem[];
  dismissedTodoCarryovers: Record<string, string>;
  isAddModalOpen: boolean;
  onCloseAddModal: () => void;
  onCreateTodo: (input: TodoInput) => Promise<void>;
  onUpdateTodo: (todoId: string, patch: Partial<TodoInput>) => Promise<void>;
  onDeleteTodo: (todoId: string) => Promise<void>;
  onDismissCarryover: (originId: string, dateKey: string) => Promise<void>;
}

function getStatusSelectClass(status: TodoStatus): string {
  if (status === 'completed') {
    return 'border-[#86EFAC] bg-[#DCFCE7] text-[#15803D]';
  }
  if (status === 'in_progress') {
    return 'border-[#FCD34D] bg-[#FEF3C7] text-[#B45309]';
  }
  return 'border-[#F39EC1] bg-[#FFE3EE] text-[#9D174D]';
}

function getPrioritySelectClass(priority: TodoPriority): string {
  if (priority === 'priority') {
    return 'border-[#FDA4AF] bg-[#FFE4E6] text-[#BE123C]';
  }
  if (priority === 'yesterday') {
    return 'border-[#FDBA74] bg-[#FFEDD5] text-[#9A3412]';
  }
  if (priority === 'later') {
    return 'border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]';
  }
  return 'border-[#F0C6D8] bg-[#FFF8FB] text-[#5C4B54]';
}

export function TodoListView({
  selectedDate,
  todos,
  dismissedTodoCarryovers,
  isAddModalOpen,
  onCloseAddModal,
  onCreateTodo,
  onUpdateTodo,
  onDeleteTodo,
  onDismissCarryover,
}: TodoListViewProps) {
  // Add Todo modal state
  const [newTitle, setNewTitle] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newStatus, setNewStatus] = useState<TodoStatus>('pending');
  const [newPriority, setNewPriority] = useState<TodoPriority>('default');
  const [formError, setFormError] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Inline title & notes edit state
  const [editingTodoKey, setEditingTodoKey] = useState<string | null>(null);
  const [editingTitleDraft, setEditingTitleDraft] = useState('');
  const [editingNotesDraft, setEditingNotesDraft] = useState('');

  useEffect(() => {
    setEditingTodoKey(null);
    setFormError('');
  }, [selectedDate]);

  useEffect(() => {
    if (!isAddModalOpen) return;
    setNewTitle('');
    setNewNotes('');
    setNewStatus('pending');
    setNewPriority('default');
    setFormError('');
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseAddModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAddModalOpen, onCloseAddModal]);

  const dayTodos = useMemo(
    () => resolveTodosForDate(todos, selectedDate, dismissedTodoCarryovers),
    [todos, selectedDate, dismissedTodoCarryovers],
  );

  const handleCreateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const payload: TodoInput = {
      date: selectedDate,
      title: newTitle.trim(),
      notes: newNotes.trim(),
      status: newStatus,
      priority: newPriority,
    };
    const errors = validateTodoInput(payload);
    if (Object.keys(errors).length > 0) {
      setFormError(Object.values(errors)[0] || 'Vui lòng nhập nội dung việc cần làm.');
      return;
    }
    setIsAdding(true);
    setFormError('');
    try {
      await onCreateTodo(payload);
      setNewTitle('');
      setNewNotes('');
      setNewStatus('pending');
      setNewPriority('default');
      onCloseAddModal();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Không thể thêm việc cần làm.');
    } finally {
      setIsAdding(false);
    }
  };

  const mutateResolvedItem = async (
    item: ResolvedTodoItem,
    patch: { title?: string; notes?: string; status?: TodoStatus; priority?: TodoPriority },
  ) => {
    if (item.isVirtualCarryover) {
      await onCreateTodo({
        date: selectedDate,
        title: patch.title ?? item.title,
        notes: patch.notes ?? item.notes ?? '',
        status: patch.status ?? item.status,
        priority: patch.priority ?? item.priority,
        originId: item.originId,
        carriedFromDate: item.carriedFromDate,
      });
      return;
    }
    await onUpdateTodo(item.id, patch);
  };

  const deleteResolvedItem = async (item: ResolvedTodoItem) => {
    if (item.isVirtualCarryover) {
      await onDismissCarryover(item.originId, selectedDate);
      return;
    }
    await onDeleteTodo(item.id);
  };

  const commitInlineTitleEdit = async (item: ResolvedTodoItem) => {
    const trimmed = editingTitleDraft.trim();
    const trimmedNotes = editingNotesDraft.trim();
    setEditingTodoKey(null);
    if (!trimmed) return;
    if (trimmed === item.title && trimmedNotes === (item.notes || '').trim()) return;
    await mutateResolvedItem(item, { title: trimmed, notes: trimmedNotes });
  };

  return (
    <div className="rounded-3xl border border-[#F5BDD6] bg-[#FFF8FB] overflow-hidden shadow-xs">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[#F5BDD6] bg-[#FFE3EE] px-4 py-3.5 sm:px-5">
        <ListTodo className="h-4 w-4 text-[#E11D64] shrink-0" aria-hidden="true" />
        <h2 className="text-sm sm:text-base font-bold text-[#3D1A2B]">
          To Do List theo ngày
        </h2>
      </div>

      {/* Danh sách việc cần làm */}
      <div className="bg-white">
        <section aria-label="Danh sách việc trong ngày" className="p-4 sm:p-5">
          {dayTodos.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#F5BDD6] bg-[#FFFDFD] px-4 py-8 text-center text-xs font-medium text-[#7C5266]">
              Chưa có việc nào trong ngày này. Bấm nút &ldquo;Thêm việc&rdquo; ở thanh trên để thêm công việc mới.
            </div>
          ) : (
            <ul className="divide-y divide-[#F6C8DC] rounded-2xl border border-[#F5BDD6] overflow-hidden">
              {dayTodos.map((item) => {
                const itemKey = `${item.id}-${item.date}`;
                const isDone = item.status === 'completed';
                const isEditing = editingTodoKey === itemKey;

                return (
                  <li
                    key={itemKey}
                    className={`p-3.5 transition-colors ${
                      isDone
                        ? 'bg-[#FAFDFB]'
                        : item.priority === 'priority'
                          ? 'bg-[#FFF7F9]'
                          : item.priority === 'yesterday'
                            ? 'bg-[#FFFAF5]'
                            : 'bg-white'
                    }`}
                  >
                    <div className="space-y-2">
                      {/* Hàng 1: Đánh dấu + Tên nhiệm vụ & thông tin đầy đủ + Ký hiệu Sửa/Xóa ngang hàng */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() =>
                              void mutateResolvedItem(item, {
                                status: isDone ? 'pending' : 'completed',
                              })
                            }
                            aria-label={
                              isDone
                                ? `Đánh dấu chưa hoàn thành ${item.title}`
                                : `Đánh dấu hoàn thành ${item.title}`
                            }
                            className="mt-0.5 shrink-0 rounded-full p-0.5 hover:bg-[#FFE3EE] cursor-pointer"
                          >
                            {isDone ? (
                              <CheckCircle2 className="h-5 w-5 text-[#15803D]" />
                            ) : item.status === 'in_progress' ? (
                              <Clock className="h-5 w-5 text-[#B45309]" />
                            ) : (
                              <Circle className="h-5 w-5 text-[#9D174D]" />
                            )}
                          </button>

                          <div className="min-w-0 flex-1">
                            {isEditing ? (
                              <div className="space-y-2">
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    autoFocus
                                    value={editingTitleDraft}
                                    onChange={(e) => setEditingTitleDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        void commitInlineTitleEdit(item);
                                      } else if (e.key === 'Escape') {
                                        e.preventDefault();
                                        setEditingTodoKey(null);
                                      }
                                    }}
                                    className="flex-1 rounded-xl border border-[#E11D64] bg-white px-2.5 py-1 text-sm font-semibold text-[#3D1A2B] focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => void commitInlineTitleEdit(item)}
                                    aria-label="Lưu nội dung công việc"
                                    className="rounded-xl bg-[#15803D] p-1.5 text-white hover:bg-[#166534] cursor-pointer"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingTodoKey(null)}
                                    aria-label="Hủy sửa nội dung"
                                    className="rounded-xl border border-[#F5BDD6] bg-white p-1.5 text-[#7C5266] hover:bg-[#FFE3EE] cursor-pointer"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                                <textarea
                                  rows={2}
                                  value={editingNotesDraft}
                                  onChange={(e) => setEditingNotesDraft(e.target.value)}
                                  placeholder="Ghi chú thêm (không bắt buộc)..."
                                  aria-label={`Sửa ghi chú cho ${item.title}`}
                                  className="w-full rounded-xl border border-[#F0C6D8] bg-white px-2.5 py-1.5 text-xs text-[#3D1A2B] focus:border-[#E11D64] focus:outline-none"
                                />
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span
                                    className={`text-sm font-bold break-words ${
                                      isDone ? 'line-through text-[#7C5266]' : 'text-[#3D1A2B]'
                                    }`}
                                  >
                                    {item.title}
                                  </span>

                                  {item.priority === 'yesterday' && (
                                    <span className="inline-flex items-center gap-1 rounded-md border border-[#FDBA74] bg-[#FFEDD5] px-2 py-0.5 text-[11px] font-bold text-[#9A3412] whitespace-nowrap">
                                      <History className="h-3 w-3" aria-hidden="true" />
                                      <span>
                                        Hôm qua
                                        {item.carriedFromDate
                                          ? ` · ${formatShortDateDdMm(item.carriedFromDate)}`
                                          : ''}
                                      </span>
                                    </span>
                                  )}

                                  {item.priority === 'priority' && (
                                    <span className="inline-flex items-center gap-1 rounded-md border border-[#FDA4AF] bg-[#FFE4E6] px-2 py-0.5 text-[11px] font-bold text-[#BE123C] whitespace-nowrap">
                                      <Flag className="h-3 w-3" aria-hidden="true" />
                                      <span>Ưu tiên</span>
                                    </span>
                                  )}
                                </div>

                                {item.notes && item.notes.trim() && (
                                  <p className="text-xs font-medium text-[#7C5266] whitespace-pre-wrap break-words">
                                    {item.notes}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {!isEditing && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTodoKey(itemKey);
                                setEditingTitleDraft(item.title);
                                setEditingNotesDraft(item.notes || '');
                              }}
                              aria-label={`Sửa ${item.title}`}
                              className="rounded-xl p-1.5 text-[#7C5266] hover:bg-[#FFE3EE] hover:text-[#3D1A2B] cursor-pointer"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteResolvedItem(item)}
                              aria-label={`Xóa ${item.title}`}
                              className="rounded-xl p-1.5 text-[#B48EA0] hover:bg-[#FFF1F2] hover:text-[#BE123C] cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Hàng 2: Trình đơn thả xuống Trạng thái & Mức độ (không tiêu đề, căn sát lề trái, thu nhỏ) */}
                      <div className="flex flex-wrap items-center justify-start gap-1.5">
                        <select
                          id={`todo-status-${itemKey}`}
                          aria-label={`Trạng thái cho ${item.title}`}
                          value={item.status}
                          onChange={(e) =>
                            void mutateResolvedItem(item, {
                              status: e.target.value as TodoStatus,
                            })
                          }
                          className={`rounded-lg border px-2 py-0.5 text-[11px] font-bold cursor-pointer focus:border-[#E11D64] focus:outline-none ${getStatusSelectClass(
                            item.status,
                          )}`}
                        >
                          {TODO_STATUS_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {TODO_STATUS_LABELS[opt]}
                            </option>
                          ))}
                        </select>

                        <select
                          id={`todo-priority-${itemKey}`}
                          aria-label={`Mức độ cho ${item.title}`}
                          value={item.priority}
                          onChange={(e) =>
                            void mutateResolvedItem(item, {
                              priority: e.target.value as TodoPriority,
                            })
                          }
                          className={`rounded-lg border px-2 py-0.5 text-[11px] font-bold cursor-pointer focus:border-[#E11D64] focus:outline-none ${getPrioritySelectClass(
                            item.priority,
                          )}`}
                        >
                          {TODO_PRIORITY_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {TODO_PRIORITY_LABELS[opt]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Bảng nhỏ thêm việc trên màn hình */}
      {isAddModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#3D1A2B]/40 p-4 backdrop-blur-[2px]"
          onClick={(e) => {
            if (e.target === e.currentTarget) onCloseAddModal();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-todo-modal-title"
            className="w-full max-w-md rounded-3xl border border-[#F5BDD6] bg-white shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-[#F5BDD6] bg-[#FFE3EE] px-5 py-3.5">
              <h3 id="add-todo-modal-title" className="text-base font-bold text-[#3D1A2B]">
                Thêm việc cần làm
              </h3>
              <button
                type="button"
                onClick={onCloseAddModal}
                aria-label="Đóng bảng thêm việc"
                className="rounded-xl p-1.5 text-[#7C5266] hover:bg-white/70 hover:text-[#3D1A2B] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-5 space-y-4">
              <div>
                <label
                  htmlFor="modal-new-todo-title"
                  className="block text-xs font-bold text-[#3D1A2B] mb-1.5"
                >
                  Nhập việc làm <span className="text-[#E11D64]">*</span>
                </label>
                <input
                  id="modal-new-todo-title"
                  type="text"
                  autoFocus
                  value={newTitle}
                  onChange={(e) => {
                    setNewTitle(e.target.value);
                    if (formError) setFormError('');
                  }}
                  placeholder="Nhập nội dung việc cần làm..."
                  className="w-full rounded-2xl border border-[#F0C6D8] bg-[#FFFDFD] px-3.5 py-2.5 text-sm text-[#3D1A2B] focus:border-[#E11D64] focus:outline-none"
                />
                {formError && (
                  <p className="mt-1.5 text-xs font-semibold text-[#BE123C]">{formError}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="modal-new-todo-status"
                    className="block text-xs font-bold text-[#3D1A2B] mb-1.5"
                  >
                    Trạng thái
                  </label>
                  <select
                    id="modal-new-todo-status"
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as TodoStatus)}
                    className={`w-full rounded-2xl border px-3 py-2 text-xs font-bold cursor-pointer focus:border-[#E11D64] focus:outline-none ${getStatusSelectClass(
                      newStatus,
                    )}`}
                  >
                    {TODO_STATUS_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {TODO_STATUS_LABELS[opt]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="modal-new-todo-priority"
                    className="block text-xs font-bold text-[#3D1A2B] mb-1.5"
                  >
                    Mức độ
                  </label>
                  <select
                    id="modal-new-todo-priority"
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as TodoPriority)}
                    className={`w-full rounded-2xl border px-3 py-2 text-xs font-bold cursor-pointer focus:border-[#E11D64] focus:outline-none ${getPrioritySelectClass(
                      newPriority,
                    )}`}
                  >
                    {TODO_PRIORITY_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {TODO_PRIORITY_LABELS[opt]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="modal-new-todo-notes"
                  className="block text-xs font-bold text-[#3D1A2B] mb-1.5"
                >
                  Ghi chú
                </label>
                <textarea
                  id="modal-new-todo-notes"
                  rows={2}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Nhập ghi chú thêm cho việc cần làm..."
                  className="w-full rounded-2xl border border-[#F0C6D8] bg-[#FFFDFD] px-3.5 py-2 text-sm text-[#3D1A2B] focus:border-[#E11D64] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#F6C8DC]">
                <button
                  type="button"
                  onClick={onCloseAddModal}
                  className="rounded-2xl border border-[#F5BDD6] bg-white px-4 py-2 text-xs font-bold text-[#7C5266] hover:bg-[#FFE3EE] cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isAdding}
                  className="inline-flex items-center gap-1.5 rounded-2xl bg-[#E11D64] px-5 py-2 text-xs font-bold text-white hover:bg-[#BE185D] disabled:opacity-50 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{isAdding ? 'Đang thêm...' : 'Thêm việc'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
