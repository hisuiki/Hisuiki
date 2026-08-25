import { useState, type ReactNode } from "react";
import MetroSelect from "../MetroSelect/MetroSelect";

/** Shared field primitives, so the widget and board panels look the same without saying so twice. */

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="inspector-field">
      <span>{label}</span>
      {children}
      {hint}
    </label>
  );
}

/** A field whose control is not a single form element, so it cannot be wrapped in a label. */
export function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="inspector-field">
      <span>{label}</span>
      {children}
    </div>
  );
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; style?: React.CSSProperties }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <Group label={label}>
      <MetroSelect label={label} value={value} options={options} disabled={disabled} onChange={onChange} />
    </Group>
  );
}

export function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="inspector-number-field">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </label>
  );
}

/** A Figma-style property group whose disclosure state stays local to the inspector session. */
export function InspectorSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className="inspector-section">
      <button
        type="button"
        className="inspector-section-toggle"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className={`inspector-section-caret ${isOpen ? "" : "is-collapsed"}`.trim()} aria-hidden="true" />
        <strong>{title}</strong>
      </button>
      {isOpen && <div className="inspector-section-content">{children}</div>}
    </section>
  );
}

export function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="inspector-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="inspector-field">
      <span>
        {label} <em>{display}</em>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export const Note = ({ children }: { children: ReactNode }) => (
  <p className="inspector-note">{children}</p>
);
