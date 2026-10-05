export default function PageHeader({ title, text, children }) {
  return <div className="page-head"><div><h2>{title}</h2><p>{text}</p></div>{children && <div className="page-actions">{children}</div>}</div>;
}
