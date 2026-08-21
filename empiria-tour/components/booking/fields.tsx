'use client';

import type { CustomField } from '@/lib/booking';

/**
 * The shared form primitives for the flow.
 *
 * Extracted so every step looks identical without five copies of the same
 * Tailwind string, and so a label is never accidentally detached from its
 * input — each control here wires `htmlFor` and `id` from one prop.
 */

export const labelClass = 'mb-1 block font-mono text-[10px] uppercase tracking-label text-stone';
export const fieldClass =
  'w-full rounded-field border border-line bg-bone px-3 py-2.5 text-[14px] text-ink outline-none transition-colors focus:border-flame';
export const errorFieldClass =
  'w-full rounded-field border border-ember bg-ember/5 px-3 py-2.5 text-[14px] text-ink outline-none transition-colors focus:border-ember';

export function Field({
  id,
  label,
  hint,
  error,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className={labelClass} htmlFor={id}>
        {label}
        {required && <span className="ml-1 text-flame">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-[12px] text-stone">{hint}</p>}
      {error && (
        <p className="mt-1 font-mono text-[10px] uppercase tracking-label text-ember">{error}</p>
      )}
    </div>
  );
}

export function TextInput({
  id,
  value,
  onChange,
  error,
  type = 'text',
  ...rest
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  error?: boolean;
  type?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id' | 'value' | 'onChange' | 'type'>) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={error ? errorFieldClass : fieldClass}
      {...rest}
    />
  );
}

export function NumberSelect({
  id,
  value,
  onChange,
  min,
  max,
}: {
  id: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={fieldClass}
    >
      {Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => min + i).map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}

/**
 * A per-package custom field (B1 defines them, A5 collects them).
 *
 * The five types are whatever Empiria configured, so this renders from data
 * rather than from a hard-coded form — which is the entire point of the feature.
 */
export function CustomFieldInput({
  field,
  idPrefix,
  value,
  onChange,
  showErrors,
}: {
  field: CustomField;
  idPrefix: string;
  value: string;
  onChange: (v: string) => void;
  showErrors: boolean;
}) {
  const id = `${idPrefix}-${field.id}`;
  const missing = showErrors && field.isRequired && !value.trim();
  const error = missing ? 'Required' : undefined;

  if (field.fieldType === 'checkbox') {
    return (
      <label className="flex cursor-pointer items-start gap-3">
        <input
          id={id}
          type="checkbox"
          checked={value === 'true'}
          onChange={(e) => onChange(e.target.checked ? 'true' : '')}
          className="mt-0.5 h-4 w-4 accent-[var(--flame)]"
        />
        <span className="text-[14px] text-ink">
          {field.label}
          {field.isRequired && <span className="ml-1 text-flame">*</span>}
          {missing && (
            <span className="ml-2 font-mono text-[10px] uppercase tracking-label text-ember">
              Required
            </span>
          )}
        </span>
      </label>
    );
  }

  return (
    <Field id={id} label={field.label} required={field.isRequired} error={error}>
      {field.fieldType === 'textarea' ? (
        <textarea
          id={id}
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${missing ? errorFieldClass : fieldClass} resize-y`}
        />
      ) : field.fieldType === 'dropdown' ? (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={missing ? errorFieldClass : fieldClass}
        >
          <option value="">Choose…</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <TextInput
          id={id}
          type={field.fieldType === 'date' ? 'date' : 'text'}
          value={value}
          onChange={onChange}
          error={missing}
        />
      )}
    </Field>
  );
}
