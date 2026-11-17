import { useEffect, useState } from 'react';
import type { StudentTuition } from '../types/planner';
import {
  TUITION_MONTH_OPTIONS,
  buildTuitionSlipData,
  getTuitionColorTheme,
} from '../utils/tuition';
import { Check, Copy, Printer, X } from 'lucide-react';

interface TuitionSlipModalProps {
  student: StudentTuition | null;
  initialMonth: number;
  onClose: () => void;
}

function getAdaptiveDensity(rowCount: number) {
  if (rowCount <= 10) {
    return {
      tableText: 'text-[11px] sm:text-[12.5px] leading-snug',
      bannerTitle: 'text-xs sm:text-[15px]',
      bannerSub: 'text-[11px] sm:text-[13px]',
      cellPad: 'px-1.5 sm:px-2.5 py-1.5',
      numPad: 'px-1.5 sm:px-2.5 py-1.5',
      headerPad: 'px-1 sm:px-2 py-1.5',
      footerText: 'text-xs sm:text-[13.5px]',
    };
  }
  if (rowCount <= 16) {
    return {
      tableText: 'text-[10.5px] sm:text-[11.5px] leading-tight',
      bannerTitle: 'text-xs sm:text-[14px]',
      bannerSub: 'text-[10.5px] sm:text-[12px]',
      cellPad: 'px-1.5 sm:px-2 py-[4px]',
      numPad: 'px-1.5 sm:px-2 py-[4px]',
      headerPad: 'px-1 sm:px-1.5 py-1',
      footerText: 'text-[11px] sm:text-[12.5px]',
    };
  }
  if (rowCount <= 23) {
    return {
      tableText: 'text-[9.5px] sm:text-[10.5px] leading-tight',
      bannerTitle: 'text-[11.5px] sm:text-[13px]',
      bannerSub: 'text-[10px] sm:text-[11px]',
      cellPad: 'px-1 sm:px-1.5 py-[2.5px]',
      numPad: 'px-1 sm:px-1.5 py-[2.5px]',
      headerPad: 'px-1 py-1',
      footerText: 'text-[10.5px] sm:text-[11.5px]',
    };
  }
  return {
    tableText: 'text-[8.5px] sm:text-[9.5px] leading-none',
    bannerTitle: 'text-[11px] sm:text-[12px]',
    bannerSub: 'text-[9.5px] sm:text-[10.5px]',
    cellPad: 'px-1 py-[1.5px]',
    numPad: 'px-1 py-[1.5px]',
    headerPad: 'px-1 py-[3px]',
    footerText: 'text-[10px] sm:text-[11px]',
  };
}

export function TuitionSlipModal({
  student,
  initialMonth,
  onClose,
}: TuitionSlipModalProps) {
  const [slipMonth, setSlipMonth] = useState<number>(initialMonth);
  const [adjustmentInput, setAdjustmentInput] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setSlipMonth(initialMonth);
    setAdjustmentInput('');
    setCopied(false);
  }, [student?.id, initialMonth]);

  useEffect(() => {
    if (!student) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [student, onClose]);

  if (!student) return null;

  const theme = getTuitionColorTheme(student.themeColor);
  const parsedAdjustment =
    adjustmentInput.trim() === '' || adjustmentInput.trim() === '-'
      ? 0
      : Number(adjustmentInput);
  const slip = buildTuitionSlipData(
    student,
    slipMonth,
    Number.isFinite(parsedAdjustment) ? parsedAdjustment : 0,
  );

  const density = getAdaptiveDensity(slip.rows.length);
  const gridBorderStyle = { borderColor: theme.hex };

  const handleCopySlip = async () => {
    try {
      await navigator.clipboard.writeText(slip.plainText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore if clipboard permission denied
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#3D1A2B]/45 p-2 sm:p-3 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tuition-slip-title"
        className="max-h-[96vh] flex flex-col items-center gap-2 overflow-hidden"
      >
        {/* Compact utility controls above the A5 portrait sheet */}
        <div
          className="w-full max-w-[540px] flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-white/95 px-3 py-1.5 shadow-md shrink-0"
          style={{ borderColor: theme.border }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <select
              id="slip-month-select"
              aria-label="Chọn tháng trên phiếu học phí"
              value={slip.monthNumber}
              onChange={(e) => setSlipMonth(Number(e.target.value))}
              className="rounded-xl border bg-white px-2.5 py-1 text-xs font-bold text-[#3D1A2B] focus:outline-none cursor-pointer"
              style={{ borderColor: theme.border }}
            >
              {TUITION_MONTH_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1">
              <label
                htmlFor="slip-adjustment-input"
                className="text-[11px] font-bold text-[#7C5266]"
              >
                Điều chỉnh:
              </label>
              <input
                id="slip-adjustment-input"
                type="number"
                step={5000}
                value={adjustmentInput}
                onChange={(e) => setAdjustmentInput(e.target.value)}
                placeholder="0"
                aria-label="Điều chỉnh học phí (VNĐ)"
                className="w-20 rounded-xl border bg-white px-2 py-1 text-xs font-semibold text-[#3D1A2B] font-mono-tabular focus:outline-none"
                style={{ borderColor: theme.border }}
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1 rounded-xl border bg-white px-2.5 py-1 text-xs font-bold transition-opacity hover:opacity-90 cursor-pointer"
              style={{
                borderColor: theme.border,
                color: theme.accentText,
              }}
            >
              <Printer className="h-3.5 w-3.5" aria-hidden="true" />
              <span>In A5</span>
            </button>

            <button
              type="button"
              onClick={() => void handleCopySlip()}
              className="inline-flex items-center gap-1 rounded-xl border bg-white px-2.5 py-1 text-xs font-bold transition-opacity hover:opacity-90 cursor-pointer"
              style={{
                borderColor: theme.border,
                color: theme.accentText,
              }}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-[#15803D]" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>{copied ? 'Đã chép' : 'Sao chép'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng phiếu học phí"
              className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-bold text-white transition-opacity hover:opacity-90 cursor-pointer"
              style={{ backgroundColor: theme.buttonBg }}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Đóng</span>
            </button>
          </div>
        </div>

        {/* A5 Portrait Paper Sheet (148mm x 210mm ratio) — zero vertical/horizontal scroll */}
        <div
          className="tuition-a5-sheet w-[min(94vw,calc((95vh-92px)*148/210),540px)] aspect-[148/210] max-h-[calc(95vh-88px)] overflow-hidden rounded-xl border bg-white p-2.5 sm:p-4 shadow-2xl flex flex-col"
          style={{ borderColor: theme.border }}
        >
          <table
            className={`w-full table-fixed border-collapse bg-white text-[#111827] ${density.tableText}`}
            style={{ border: `1.5px solid ${theme.hex}` }}
          >
            <thead>
              {/* Student Theme Colored Title Banner */}
              <tr>
                <th
                  colSpan={4}
                  id="tuition-slip-title"
                  className="border px-2 py-1.5 text-center font-extrabold leading-snug"
                  style={{
                    backgroundColor: theme.headerBg,
                    ...gridBorderStyle,
                  }}
                >
                  <div className={`${density.bannerTitle} tracking-tight text-[#111827]`}>
                    {slip.headerTitle}
                  </div>
                  {slip.studySchedule && (
                    <div className={`mt-0.5 font-bold text-[#111827] ${density.bannerSub}`}>
                      {slip.studySchedule}
                    </div>
                  )}
                </th>
              </tr>

              {/* Column Titles */}
              <tr className="bg-white text-center font-bold text-[#111827]">
                <th
                  className={`w-[14%] border ${density.headerPad}`}
                  style={gridBorderStyle}
                >
                  Số buổi
                </th>
                <th
                  className={`w-[26%] border ${density.headerPad}`}
                  style={gridBorderStyle}
                >
                  NGÀY
                </th>
                <th
                  className={`w-[37%] border ${density.headerPad}`}
                  style={gridBorderStyle}
                >
                  BÀI HỌC
                </th>
                <th
                  className={`w-[23%] border ${density.headerPad}`}
                  style={gridBorderStyle}
                >
                  TÌNH TRẠNG LỚP
                </th>
              </tr>
            </thead>

            <tbody>
              {slip.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="border px-3 py-6 text-center text-xs font-semibold text-[#5C4B54]"
                    style={gridBorderStyle}
                  >
                    Chưa có buổi học nào được ghi nhận trong {slip.monthLabel}.
                  </td>
                </tr>
              ) : (
                slip.rows.map((row) => {
                  const isAbsent = row.status === 'absent';
                  return (
                    <tr key={row.id} className="bg-white">
                      <td
                        className={`border text-right font-mono-tabular text-[#111827] ${density.numPad}`}
                        style={gridBorderStyle}
                      >
                        {row.sessionNumber !== null ? row.sessionNumber : ''}
                      </td>

                      <td
                        className={`border text-center whitespace-nowrap text-[#111827] ${density.cellPad}`}
                        style={gridBorderStyle}
                      >
                        {row.dateLabel}
                      </td>

                      {isAbsent ? (
                        <td
                          colSpan={2}
                          className={`border text-center font-medium text-[#111827] ${density.cellPad}`}
                          style={gridBorderStyle}
                        >
                          Nghỉ
                        </td>
                      ) : (
                        <>
                          <td
                            className={`border text-left break-words text-[#111827] ${density.cellPad}`}
                            style={gridBorderStyle}
                          >
                            {row.content}
                          </td>
                          <td
                            className={`border text-left whitespace-nowrap text-[#111827] ${density.cellPad}`}
                            style={gridBorderStyle}
                          >
                            {row.statusLabel}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>

            <tfoot>
              <tr className="bg-white">
                <td
                  colSpan={4}
                  className={`border px-2 py-1.5 text-center font-extrabold text-[#111827] ${density.footerText}`}
                  style={{
                    borderTopWidth: '1.5px',
                    ...gridBorderStyle,
                  }}
                >
                  {slip.formulaText}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
