export const DIFFICULTY_STYLES = {
  beginner:     { label: 'Beginner',     bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-700' },
  intermediate: { label: 'Intermediate', bg: 'bg-amber-100  dark:bg-amber-900/40',   text: 'text-amber-700  dark:text-amber-300',   border: 'border-amber-200  dark:border-amber-700' },
  advanced:     { label: 'Advanced',     bg: 'bg-rose-100   dark:bg-rose-900/40',     text: 'text-rose-700   dark:text-rose-300',     border: 'border-rose-200   dark:border-rose-700' },
};

export default function DifficultyBadge({ difficulty }) {
  const s = DIFFICULTY_STYLES[difficulty] || DIFFICULTY_STYLES.intermediate;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}
