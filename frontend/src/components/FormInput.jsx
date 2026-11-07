// src/components/FormInput.jsx
// Label + field + help/error text, so every form looks and behaves the same.
//
//   <FormInput label="Email" name="email" type="email" value={form.email} onChange={handleChange} required />
//   <FormInput as="select" label="Department" name="department_id" ...>
//     <option value="">Choose...</option>
//   </FormInput>
//   <FormInput as="textarea" label="Address" name="address" rows={3} ... />
//
// Any other prop (min, max, accept, autoComplete...) is passed to the field.

import { useId } from 'react';

export default function FormInput({ label, as = 'input', error, hint, className = '', children, required, ...fieldProps }) {
  const id = useId();
  const Field = as; // 'input', 'select' or 'textarea'
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className={`form-field ${className}`}>
      {label && (
        <label htmlFor={id}>
          {label}
          {required && <span className="required" aria-hidden="true"> *</span>}
        </label>
      )}
      <Field id={id} required={required} aria-invalid={error ? 'true' : undefined} aria-describedby={describedBy} {...fieldProps}>
        {children}
      </Field>
      {error ? (
        <span id={`${id}-error`} className="field-error">
          {error}
        </span>
      ) : (
        hint && (
          <span id={`${id}-hint`} className="field-hint">
            {hint}
          </span>
        )
      )}
    </div>
  );
}
