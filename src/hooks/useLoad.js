import { useEffect, useState } from "react";

// Runs an async loader; keeps previous data while reloading. Returns { data, loading, error, reload }.
export default function useLoad(loader, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: "" });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: "" }));
    loader().then(
      (data) => live && setState({ data, loading: false, error: "" }),
      (e) => live && setState({ data: null, loading: false, error: e?.message || "Something went wrong." })
    );
    return () => { live = false; };
  }, [...deps, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, reload: () => setTick((t) => t + 1) };
}
