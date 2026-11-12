import { useEffect, useState } from "react";
import { isOctoberPumpkinDate, millisecondsUntilNextLocalDay } from "../lib/seasonal-avatar.js";

export function useOctoberPumpkin(authUserId) {
  const [date, setDate] = useState(() => new Date());
  const [sessionSalt, setSessionSalt] = useState(() => Math.floor(Math.random() * 0xffffffff));

  useEffect(() => {
    if (authUserId) setSessionSalt(Math.floor(Math.random() * 0xffffffff));
  }, [authUserId]);

  useEffect(() => {
    let midnightTimer;
    function refreshDate() {
      const now = new Date();
      setDate(now);
      midnightTimer = window.setTimeout(refreshDate, millisecondsUntilNextLocalDay(now) + 50);
    }
    refreshDate();
    return () => window.clearTimeout(midnightTimer);
  }, []);

  return isOctoberPumpkinDate(date) ? sessionSalt : null;
}
