import { useCallback, useEffect, useState } from "react";
import { listTeachers } from "../services/teacherService.js";
import { TEACHERS_UPDATED, DIVISIONS_UPDATED } from "../utils/events.js";

export default function useTeachers() {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [needsSetup, setNeedsSetup] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await listTeachers();
      setTeachers(result.teachers ?? []);
      setNeedsSetup(Boolean(result.needsSetup));
    } catch (e) {
      setError(e?.message || "Unable to load teachers.");
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

    window.addEventListener(TEACHERS_UPDATED, onUpdate);
    window.addEventListener(DIVISIONS_UPDATED, onUpdate);

    return () => {
      live = false;
      window.removeEventListener(TEACHERS_UPDATED, onUpdate);
      window.removeEventListener(DIVISIONS_UPDATED, onUpdate);
    };
  }, [refetch]);

  return { teachers, loading, error, needsSetup, refetch };
}

