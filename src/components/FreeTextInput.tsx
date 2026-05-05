import { useState } from 'react';

type FreeTextInputProps = {
  label: string;
  initialValue?: string;
  onContinue: (value: string) => void;
  onSkip: () => void;
};

const maxLength = 300;

export function FreeTextInput({ label, initialValue = '', onContinue, onSkip }: FreeTextInputProps) {
  const [value, setValue] = useState(initialValue.slice(0, maxLength));

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <label htmlFor="free-text-answer" className="text-2xl font-semibold text-slate-950 sm:text-3xl">
        {label}
      </label>
      <textarea
        id="free-text-answer"
        value={value}
        maxLength={maxLength}
        onChange={(event) => setValue(event.target.value)}
        rows={7}
        className="mt-5 w-full resize-none rounded-lg border border-slate-300 bg-white px-4 py-3 text-base text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
        placeholder="Favorite hobbies, things they already own, delivery notes..."
      />
      <div className="mt-3 flex items-center justify-between gap-4">
        <p className="text-sm text-slate-500">{value.length}/{maxLength} characters</p>
        <button
          type="button"
          onClick={onSkip}
          className="text-sm font-semibold text-slate-500 underline-offset-4 hover:text-slate-800 hover:underline"
        >
          Skip
        </button>
      </div>
      <button
        type="button"
        onClick={() => onContinue(value.trim())}
        className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-5 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 sm:w-auto"
      >
        Continue
      </button>
    </section>
  );
}
