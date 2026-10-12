import { forwardRef } from "react";

const Input = forwardRef(function Input(
  { label, labelRight, id, error, icon, rightSlot, className = "", ...rest },
  ref
) {
  const hasWrap = Boolean(icon || rightSlot);

  return (
    <div className={`field ${className}`}>
      {(label || labelRight) && (
        <div className="field-label-row">
          {label && <label htmlFor={id}>{label}</label>}
          {labelRight}
        </div>
      )}
      {hasWrap ? (
        <div className={`control-wrap ${icon ? "has-icon-left" : ""} ${rightSlot ? "has-icon-right" : ""}`}>
          {icon && <span className="control-icon-left" aria-hidden="true">{icon}</span>}
          <input
            ref={ref}
            id={id}
            className={`control ${error ? "control--error" : ""}`}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-err` : undefined}
            {...rest}
          />
          {rightSlot && <span className="control-icon-right">{rightSlot}</span>}
        </div>
      ) : (
        <input
          ref={ref}
          id={id}
          className={`control ${error ? "control--error" : ""}`}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-err` : undefined}
          {...rest}
        />
      )}
      {error && <p className="field-error" id={`${id}-err`}>{error}</p>}
    </div>
  );
});

export default Input;
