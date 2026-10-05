import type { ReactNode } from 'react';

export function SettingsGroup({
  title,
  children,
  wide,
  tall,
}: {
  title: string;
  children: ReactNode;
  wide?: boolean;
  /** Spans two rows (a long group beside two short ones). */
  tall?: boolean;
}) {
  const id = `settings-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return (
    <section
      className={`ci-settings-group${wide ? ' wide' : ''}${tall ? ' tall' : ''}`}
      role="group"
      aria-labelledby={id}
    >
      <h3 id={id} className="ci-settings-title">
        {title}
      </h3>
      <div className="ci-settings-body">{children}</div>
    </section>
  );
}

export function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  const keyboardStep = Math.max(step, 0.05);
  return (
    <label className="ci-setting-row">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          const dir = event.key === 'ArrowLeft' ? -1 : 1;
          onChange(clamp(Number(event.currentTarget.value) + dir * keyboardStep));
        }}
      />
      <em>{value.toFixed(step < 0.1 ? 2 : 1)}</em>
    </label>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="ci-setting-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />
      <em>{checked ? 'On' : 'Off'}</em>
    </label>
  );
}

export function Select({
  label,
  value,
  options,
  names,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  /** Display names for the option values (defaults to the values). */
  names?: Readonly<Record<string, string>>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="ci-setting-row">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {names?.[option] ?? option}
          </option>
        ))}
      </select>
      <em />
    </label>
  );
}
