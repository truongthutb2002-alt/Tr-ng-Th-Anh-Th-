interface PlanteaLetter {
  char: string;
  color: string;
  outline: string;
}

const PLANTEA_LETTERS: PlanteaLetter[] = [
  { char: 'P', color: '#FF85B8', outline: '#C93D7E' },
  { char: 'l', color: '#FFD05B', outline: '#BD7E0A' },
  { char: 'a', color: '#6CC2FF', outline: '#287EC4' },
  { char: 'n', color: '#8DE268', outline: '#469A24' },
  { char: 't', color: '#C68EFF', outline: '#8041C2' },
  { char: 'e', color: '#FF85B8', outline: '#C93D7E' },
  { char: 'a', color: '#FFD05B', outline: '#BD7E0A' },
];

interface PlanteaWordmarkProps {
  className?: string;
}

export function PlanteaWordmark({ className = '' }: PlanteaWordmarkProps) {
  return (
    <span
      aria-label="Plantea"
      className={`inline-flex items-baseline font-display font-extrabold tracking-normal select-none ${className}`}
    >
      <span className="sr-only">Plantea</span>
      {PLANTEA_LETTERS.map((item, idx) => (
        <span
          key={`${item.char}-${idx}`}
          aria-hidden="true"
          style={{
            color: item.color,
            WebkitTextStroke: `0.65px ${item.outline}`,
            textShadow: `0 1.25px 0 ${item.outline}, 0 0 1px ${item.outline}`,
          }}
        >
          {item.char}
        </span>
      ))}
    </span>
  );
}
