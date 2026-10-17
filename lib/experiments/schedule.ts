export const CADENCES = ["manual", "hourly", "daily", "weekly", "interval"] as const;

export type Cadence = (typeof CADENCES)[number];

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type ScheduleInput = {
  cadence: Cadence;
  intervalHours: number | null;
  hourUtc: number | null;
  weekday: number | null;
  from: Date;
};

export function nextRunAt(input: ScheduleInput): string | null {
  const from = input.from;
  if (input.cadence === "manual") return null;
  if (input.cadence === "hourly") {
    const next = new Date(from);
    next.setUTCMinutes(0, 0, 0);
    next.setUTCHours(next.getUTCHours() + 1);
    return next.toISOString();
  }
  if (input.cadence === "interval") {
    const hours = clamp(input.intervalHours ?? 1, 1, 24);
    return new Date(from.getTime() + hours * 60 * 60 * 1000).toISOString();
  }
  const hour = clamp(input.hourUtc ?? 0, 0, 23);
  if (input.cadence === "daily") {
    const next = new Date(from);
    next.setUTCHours(hour, 0, 0, 0);
    if (next.getTime() <= from.getTime()) next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString();
  }
  const weekday = clamp(input.weekday ?? 1, 0, 6);
  const next = new Date(from);
  next.setUTCHours(hour, 0, 0, 0);
  const delta = (weekday - next.getUTCDay() + 7) % 7;
  next.setUTCDate(next.getUTCDate() + (delta === 0 && next.getTime() <= from.getTime() ? 7 : delta));
  if (next.getTime() <= from.getTime()) next.setUTCDate(next.getUTCDate() + 7);
  return next.toISOString();
}

export function formatCadence(input: {
  cadence: Cadence;
  intervalHours: number | null;
  hourUtc: number | null;
  weekday: number | null;
}): string {
  if (input.cadence === "manual") return "Manual";
  if (input.cadence === "hourly") return "Hourly";
  if (input.cadence === "interval") return `Every ${input.intervalHours ?? 1} hours`;
  const hour = `${String(input.hourUtc ?? 0).padStart(2, "0")}:00 UTC`;
  if (input.cadence === "daily") return `Daily at ${hour}`;
  return `Weekly on ${WEEKDAYS[input.weekday ?? 1] ?? "Monday"} at ${hour}`;
}

export function normalizeSchedule(input: {
  cadence: Cadence;
  intervalHours?: number | null;
  hourUtc?: number | null;
  weekday?: number | null;
}): { cadence: Cadence; intervalHours: number | null; hourUtc: number | null; weekday: number | null } {
  if (input.cadence === "interval") {
    return {
      cadence: "interval",
      intervalHours: clamp(input.intervalHours ?? 6, 1, 24),
      hourUtc: null,
      weekday: null,
    };
  }
  if (input.cadence === "daily") {
    return {
      cadence: "daily",
      intervalHours: null,
      hourUtc: clamp(input.hourUtc ?? 0, 0, 23),
      weekday: null,
    };
  }
  if (input.cadence === "weekly") {
    return {
      cadence: "weekly",
      intervalHours: null,
      hourUtc: clamp(input.hourUtc ?? 0, 0, 23),
      weekday: clamp(input.weekday ?? 1, 0, 6),
    };
  }
  if (input.cadence === "hourly") {
    return { cadence: "hourly", intervalHours: 1, hourUtc: null, weekday: null };
  }
  return { cadence: "manual", intervalHours: null, hourUtc: null, weekday: null };
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
