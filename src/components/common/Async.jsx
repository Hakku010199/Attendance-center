import Button from "./Button.jsx";
// Shows loading / error states; renders children once data is available.
export default function Async({ state, children }) {
  if (state.error) return <div className="empty"><strong>Couldn't load data</strong><p>{state.error}</p><Button variant="secondary" onClick={state.reload}>Try again</Button></div>;
  if (state.loading && !state.data) return <div className="empty" aria-busy="true">Loading...</div>;
  return children(state.data);
}
