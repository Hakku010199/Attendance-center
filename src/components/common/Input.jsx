import { forwardRef } from "react";

const Input = forwardRef(function Input({ label, id, error, className = "", ...rest }, ref) {
  return (
    <div className={`field ${className}`}>
      {label && <label htmlFor={id}>{label}</label>}
      <input ref={ref} id={id} className={`control ${error ? "control--error" : ""}`} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-err` : undefined} {...rest} />
      {error && <p className="field-error" id={`${id}-err`}>{error}</p>}
    </div>
  );
});

export default Input;
