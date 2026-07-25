interface CronField {
  values: Set<number>;
}

interface ParsedCron {
  minute: CronField;
  hour: CronField;
  day: CronField;
  month: CronField;
  weekday: CronField;
}

const WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function parseField(source: string, minimum: number, maximum: number, sunday = false): CronField {
  const values = new Set<number>();

  for (const part of source.split(",")) {
    const [rangeSource, stepSource] = part.split("/");
    const step = stepSource === undefined ? 1 : Number(stepSource);
    if (!Number.isInteger(step) || step < 1) {
      throw new Error(`Invalid cron step: ${part}`);
    }

    let start: number;
    let end: number;
    if (rangeSource === "*") {
      start = minimum;
      end = maximum;
    } else if (rangeSource.includes("-")) {
      const bounds = rangeSource.split("-").map(Number);
      if (bounds.length !== 2) {
        throw new Error(`Invalid cron range: ${part}`);
      }
      [start, end] = bounds;
    } else {
      start = Number(rangeSource);
      end = start;
    }

    if (
      !Number.isInteger(start) || !Number.isInteger(end) ||
      start < minimum || end > maximum || start > end
    ) {
      throw new Error(`Cron value is outside ${minimum}-${maximum}: ${part}`);
    }

    for (let value = start; value <= end; value += step) {
      values.add(sunday && value === 7 ? 0 : value);
    }
  }

  return { values };
}

export function parseCron(expression: string): ParsedCron {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error("CRON_SCHEDULE must have exactly five fields");
  }

  return {
    minute: parseField(fields[0], 0, 59),
    hour: parseField(fields[1], 0, 23),
    day: parseField(fields[2], 1, 31),
    month: parseField(fields[3], 1, 12),
    weekday: parseField(fields[4], 0, 7, true),
  };
}

export function zonedMinuteKey(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return formatter.format(date);
}

export function cronMatches(expression: string, date: Date, timezone: string): boolean {
  const cron = parseCron(expression);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      minute: "numeric",
      hour: "numeric",
      day: "numeric",
      month: "numeric",
      weekday: "short",
      hourCycle: "h23",
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );

  const minute = Number(parts.minute);
  const hour = Number(parts.hour);
  const day = Number(parts.day);
  const month = Number(parts.month);
  const weekday = WEEKDAYS[parts.weekday];

  return cron.minute.values.has(minute) &&
    cron.hour.values.has(hour) &&
    cron.day.values.has(day) &&
    cron.month.values.has(month) &&
    cron.weekday.values.has(weekday);
}
