export default function Button({ variant = "primary", size = "md", type = "button", className = "", children, ...rest }) {
  return <button type={type} className={`btn btn--${variant} btn--${size} ${className}`} {...rest}>{children}</button>;
}
