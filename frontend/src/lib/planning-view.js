import { useMemo } from "react";
import { defaultSessionStatus, todayIso } from "./domain.js";

export function usePlanningSessions(state) {
  const selectedDate = state.selectedDate || todayIso();

  const daySessions = useMemo(() => ["midi", "soir", "matin"].map((slot) => {
    const found = state.sessions.find((session) => session.date === selectedDate && session.slot === slot);
    return found || {
      id: `${selectedDate}-${slot}`,
      date: selectedDate,
      slot,
      status: defaultSessionStatus(selectedDate, slot),
      encadrantId: null,
      referentId: null,
      participantIds: [],
    };
  }), [selectedDate, state.sessions]);

  const weekDates = useMemo(() => {
    const current = new Date(`${selectedDate}T12:00:00`);
    const day = current.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(current);
    monday.setDate(current.getDate() + diff);
    return Array.from({ length: 5 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return date.toISOString().slice(0, 10);
    });
  }, [selectedDate]);

  const weekSessions = useMemo(() => weekDates.map((date) => ({
    date,
    sessions: ["midi", "soir", "matin"].map((slot) => {
      const found = state.sessions.find((session) => session.date === date && session.slot === slot);
      return found || {
        id: `${date}-${slot}`,
        date,
        slot,
        status: defaultSessionStatus(date, slot),
        encadrantId: null,
        referentId: null,
        participantIds: [],
      };
    }),
  })), [weekDates, state.sessions]);

  return { selectedDate, daySessions, weekSessions };
}
