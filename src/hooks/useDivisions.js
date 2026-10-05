import { useCallback, useEffect, useState } from "react";
import { listDivisions } from "../services/divisionService.js";
import { DIVISIONS_UPDATED } from "../utils/events.js";

// Shared divisions hook (Office pattern: hooks/useDivisions.js).
// Light id+name rows for dropdowns everywhere; listDivisions already
// includes studentCount, so withCounts needs no separate query.
export default function useDivisions() {
  const [divisions, setDivisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refetch = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await listDivisions();
      setDivisions(rows ?? []);
    } catch (e) {
      setError(e?.message || "Unable to load divisions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let live = true;
    refetch();
    const onUpdate = () => {
      if (live) refetch();
    };
    window.addEventListener(DIVISIONS_UPDATED, onUpdate);
    return () => {
      live = false;
      window.removeEventListener(DIVISIONS_UPDATED, onUpdate);
    };
  }, [refetch]);

  return { divisions, loading, error, refetch };
}
