import React, { useRef } from "react";
import Button from "../components/Button.jsx";
import { formatDateFr, nextBusinessDay } from "../lib/domain.js";

const SESSION_SLOT_ORDER = ["midi", "soir", "matin"];

function normalizeSessionSlot(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getSessionSlot(session) {
  return normalizeSessionSlot(
    session?.slot
      ?? session?.creneau
      ?? session?.créneau
      ?? session?.sessionSlot
      ?? session?.type
      ?? ""
  );
}

function sortSessionsForDisplay(sessions = []) {
  return sessions
    .map((session, index) => ({ session, index }))
    .sort((left, right) => {
      const leftRank = SESSION_SLOT_ORDER.indexOf(getSessionSlot(left.session));
      const rightRank = SESSION_SLOT_ORDER.indexOf(getSessionSlot(right.session));
      const safeLeftRank = leftRank < 0 ? Number.MAX_SAFE_INTEGER : leftRank;
      const safeRightRank = rightRank < 0 ? Number.MAX_SAFE_INTEGER : rightRank;
      return safeLeftRank - safeRightRank || left.index - right.index;
    })
    .map(({ session }) => session);
}

export default function Inscriptions({
  viewMode,
  setViewMode,
  selectedDate,
  setSelectedDate,
  ensureSessionsForDate,
  daySessions,
  weekSessions,
  renderSessionCard,
}) {
  const touchStartRef = useRef(null);

  function navigate(delta) {
    const d = viewMode === "jour"
      ? nextBusinessDay(selectedDate, delta)
      : Array.from({ length: 5 }).reduce((date) => nextBusinessDay(date, delta), selectedDate);
    setSelectedDate(d);
    ensureSessionsForDate(d);
  }

  function handleTouchStart(event) {
    const target = event.target;
    if (!(target instanceof Element)
      || target.closest("button,input,select,textarea,a,.modal-overlay,.sidebar")) {
      touchStartRef.current = null;
      return;
    }

    const touch = event.touches?.[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleTouchEnd(event) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;

    const touch = event.changedTouches?.[0];
    if (!touch) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 60 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return;

    navigate(deltaX < 0 ? 1 : -1);
  }

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div className="toolbar">
        <div className="toolbar-row">
          <div className="group date-nav">
            <Button variant="navSymbol" title={viewMode === "jour" ? "Jour précédent" : "Semaine précédente"} aria-label={viewMode === "jour" ? "Afficher le jour précédent" : "Afficher la semaine précédente"} onClick={() => navigate(-1)}>
              &lt;
            </Button>

            <input
              className="date-input date-display"
              type="text"
              value={formatDateFr(selectedDate)}
              readOnly
              aria-label="Date sélectionnée"
            />

            <Button variant="navSymbol" title={viewMode === "jour" ? "Jour suivant" : "Semaine suivante"} aria-label={viewMode === "jour" ? "Afficher le jour suivant" : "Afficher la semaine suivante"} onClick={() => navigate(1)}>
              &gt;
            </Button>
          </div>

          <div className="group view-toggle">
            <Button variant={viewMode === "jour" ? "primary" : "secondary"} onClick={() => setViewMode("jour")}>Jour</Button>
            <Button variant={viewMode === "semaine" ? "primary" : "secondary"} onClick={() => setViewMode("semaine")}>Semaine</Button>
          </div>
        </div>
      </div>

      {viewMode === "jour" ? (
        <div className="stack">{sortSessionsForDisplay(daySessions).map((session) => renderSessionCard(session))}</div>
      ) : (
        <div className="week-grid" aria-label="Semaine interactive">
          {weekSessions.map((day) => (
            <section className="week-day-card" key={day.date}>
              <div className="week-day-header">
                <h3>{formatDateFr(day.date)}</h3>
              </div>
              <div className="week-day-sessions">
                {sortSessionsForDisplay(day.sessions).map((session) => renderSessionCard(session, true))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
