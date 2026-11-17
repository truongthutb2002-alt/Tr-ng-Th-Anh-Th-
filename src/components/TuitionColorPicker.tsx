import { useEffect, useRef, useState } from 'react';
import { TUITION_COLOR_PALETTE, getTuitionColorTheme } from '../utils/tuition';
import { Check, ChevronDown, Palette } from 'lucide-react';

interface TuitionColorPickerProps {
  id: string;
  label: string;
  value: string;
  onChange: (nextHex: string) => void;
  borderColor?: string;
}

export function TuitionColorPicker({
  id,
  label,
  value,
  onChange,
  borderColor,
}: TuitionColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeTone = getTuitionColorTheme(value);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <label
        htmlFor={id}
        className={`block text-xs font-bold mb-1 ${borderColor ? 'text-[#7C5266]' : 'text-[#3D1A2B]'}`}
      >
        {label}
      </label>

      <button
        id={id}
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-2 rounded-2xl border border-[#F5BDD6] bg-[#FFFDFD] px-3.5 py-2 text-sm text-[#3D1A2B] hover:border-[#E11D64] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D64]"
        style={borderColor ? { borderColor } : undefined}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <span
            aria-hidden="true"
            className="h-4 w-4 rounded-full border border-black/10 shrink-0"
            style={{ backgroundColor: activeTone.hex }}
          />
          <span className="font-semibold truncate">{activeTone.name}</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 text-[#7C5266] shrink-0 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Bảng chọn phân loại màu"
          className="absolute left-0 right-0 z-30 mt-2 rounded-3xl border border-[#F5BDD6] bg-white p-3.5 shadow-lg space-y-3"
        >
          <div className="flex items-center justify-between text-xs font-bold text-[#7C5266]">
            <span className="inline-flex items-center gap-1.5">
              <Palette className="h-3.5 w-3.5 text-[#E11D64]" aria-hidden="true" />
              Chọn tone màu cho bảng học phí
            </span>
          </div>

          <div className="grid grid-cols-6 gap-2">
            {TUITION_COLOR_PALETTE.map((tone) => {
              const isSelected = activeTone.hex.toLowerCase() === tone.hex.toLowerCase();
              return (
                <button
                  key={tone.id}
                  type="button"
                  title={tone.name}
                  aria-label={`Chọn màu ${tone.name}`}
                  onClick={() => {
                    onChange(tone.hex);
                    setIsOpen(false);
                  }}
                  className={`group relative flex h-8 w-full items-center justify-center rounded-xl border transition-transform hover:scale-105 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D64] ${
                    isSelected ? 'ring-2 ring-[#3D1A2B] ring-offset-1' : 'border-black/10'
                  }`}
                  style={{ backgroundColor: tone.hex }}
                >
                  {isSelected && <Check className="h-4 w-4 text-white drop-shadow-xs" />}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-[#F6C8DC] pt-2.5">
            <label
              htmlFor={`${id}-custom`}
              className="text-xs font-bold text-[#7C5266] cursor-pointer"
            >
              Hoặc chọn tone tùy chỉnh:
            </label>
            <input
              id={`${id}-custom`}
              type="color"
              value={activeTone.hex}
              onChange={(e) => onChange(e.target.value)}
              aria-label="Chọn mã màu tùy chỉnh"
              className="h-7 w-12 rounded-xl border border-[#F5BDD6] bg-white p-0.5 cursor-pointer"
            />
          </div>
        </div>
      )}
    </div>
  );
}
