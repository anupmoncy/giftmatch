export type QuizOption = {
  value: string;
  label: string;
  emoji: string;
};

type QuizCardProps = {
  question: string;
  options: QuizOption[];
  selectedValue?: string;
  onSelect: (value: string) => void;
};

export function QuizCard({ question, options, selectedValue, onSelect }: QuizCardProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h1 className="text-2xl font-semibold text-slate-950 sm:text-3xl">{question}</h1>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {options.map((option) => {
          const isSelected = option.value === selectedValue;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onSelect(option.value)}
              className={[
                'min-h-32 rounded-lg border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2',
                isSelected
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-950 shadow-sm'
                  : 'border-slate-200 bg-slate-50 text-slate-900 hover:border-emerald-300 hover:bg-white',
              ].join(' ')}
              aria-pressed={isSelected}
            >
              <span className="block text-4xl" aria-hidden="true">
                {option.emoji}
              </span>
              <span className="mt-4 block text-base font-semibold">{option.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
