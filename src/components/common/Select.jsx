export default function Select({ label, id, error, options, placeholder, className = "", ...rest }) {
  return (
    <div className={`field ${className}`}>
      {label && <label htmlFor={id}>{label}</label>}
      <select id={id} className={`control select ${error ? "control--error" : ""}`} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-err` : undefined} {...rest}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <p className="field-error" id={`${id}-err`}>{error}</p>}
    </div>
  );
}
