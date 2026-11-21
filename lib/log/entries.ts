// The masking log ("Dziennik"): one entry per masking, manual or automatic. Metadata only: when,
// on which site, how many values and of which types. Never a value, a token or any text of the
// field, so the log can be kept on disk and exported without holding personal data.

/** How a masking was started: from the panel, or by automatic masking on send. */
export const LOG_SOURCES = ['manual', 'auto'] as const;
export type LogSource = (typeof LOG_SOURCES)[number];

export const SOURCE_LABELS: Readonly<Record<LogSource, string>> = {
  manual: 'ręcznie',
  auto: 'automatycznie',
};

/** What a content script reports about one masking. */
export interface MaskingReport {
  source: LogSource;
  /** Values replaced with their token. */
  masked: number;
  /** Values replaced with a generalised text ("ogólnie"). */
  generalised: number;
  /** polanon entity type -> number of values of that type, tokens and generalised together. */
  categories: Record<string, number>;
}

export interface LogEntry extends MaskingReport {
  /** Milliseconds since the epoch, set by the service worker. */
  at: number;
  /** The masked page's hostname, taken from the sender's URL by the service worker. */
  host: string;
}

/** Oldest entries are dropped beyond this many. */
export const MAX_LOG_ENTRIES = 1000;
/** Limits that keep a report from a misbehaving page small: values per masking, types per entry. */
export const MAX_VALUES_PER_ENTRY = 10_000;
export const MAX_CATEGORIES_PER_ENTRY = 64;
const MAX_HOST_LENGTH = 253;
// polanon's entity types are upper-case words joined by underscores (lib/ui/labels.ts).
const CATEGORY = /^[A-Z][A-Z0-9_]{0,39}$/;
const FALLBACK_CATEGORY = 'OTHER';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function isLogSource(value: unknown): value is LogSource {
  return typeof value === 'string' && (LOG_SOURCES as readonly string[]).includes(value);
}

/**
 * A well-formed report: known source, non-negative whole counts within the limits, entity-type
 * keys only, and the per-type counts adding up to the values masked and generalised.
 */
export function isMaskingReport(value: unknown): value is MaskingReport {
  if (!isRecord(value) || !isLogSource(value.source)) return false;
  const { masked, generalised, categories } = value;
  if (!isCount(masked) || !isCount(generalised) || !isRecord(categories)) return false;
  const total = masked + generalised;
  if (total === 0 || total > MAX_VALUES_PER_ENTRY) return false;
  const entries = Object.entries(categories);
  if (entries.length > MAX_CATEGORIES_PER_ENTRY) return false;
  let sum = 0;
  for (const [type, count] of entries) {
    if (!CATEGORY.test(type) || !isCount(count) || count === 0) return false;
    sum += count;
  }
  return sum === total;
}

export function isLogEntry(value: unknown): value is LogEntry {
  return (
    isRecord(value) &&
    isCount(value.at) &&
    typeof value.host === 'string' &&
    value.host.length <= MAX_HOST_LENGTH &&
    isMaskingReport(value)
  );
}

/** The entry for `report`, copied field by field so nothing else the sender added is kept. */
export function toLogEntry(report: MaskingReport, host: string, at: number): LogEntry {
  const categories = Object.create(null) as Record<string, number>;
  for (const [type, count] of Object.entries(report.categories)) categories[type] = count;
  return {
    at,
    host: host.slice(0, MAX_HOST_LENGTH),
    source: report.source,
    masked: report.masked,
    generalised: report.generalised,
    categories,
  };
}

/** The valid entries of a stored log, oldest first; anything malformed is dropped. */
export function parseLog(raw: unknown): LogEntry[] {
  return Array.isArray(raw) ? raw.filter(isLogEntry) : [];
}

/** `log` with `entry` appended, keeping only the newest `cap` entries. */
export function appendEntry(
  log: readonly LogEntry[],
  entry: LogEntry,
  cap = MAX_LOG_ENTRIES,
): LogEntry[] {
  const next = [...log, entry];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

/** One row of a ranking: a name with its count, highest first. */
export interface Ranked {
  name: string;
  count: number;
}

export interface LogSummary {
  maskings: number;
  /** Values masked or generalised, across all maskings. */
  values: number;
  masked: number;
  generalised: number;
  bySource: Record<LogSource, number>;
  /** Entity types by number of values. */
  categories: Ranked[];
  /** Hostnames by number of maskings. */
  sites: Ranked[];
  first: number | null;
  last: number | null;
}

function ranked(counts: Map<string, number>): Ranked[] {
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function summarize(log: readonly LogEntry[]): LogSummary {
  const categories = new Map<string, number>();
  const sites = new Map<string, number>();
  const bySource: Record<LogSource, number> = { manual: 0, auto: 0 };
  let masked = 0;
  let generalised = 0;
  for (const entry of log) {
    masked += entry.masked;
    generalised += entry.generalised;
    bySource[entry.source]++;
    sites.set(entry.host, (sites.get(entry.host) ?? 0) + 1);
    for (const [type, count] of Object.entries(entry.categories)) {
      categories.set(type, (categories.get(type) ?? 0) + count);
    }
  }
  const times = log.map((entry) => entry.at);
  return {
    maskings: log.length,
    values: masked + generalised,
    masked,
    generalised,
    bySource,
    categories: ranked(categories),
    sites: ranked(sites),
    first: times.length > 0 ? Math.min(...times) : null,
    last: times.length > 0 ? Math.max(...times) : null,
  };
}

/** The report a masking makes: `choices` are the values written, each with its entity type. */
export function reportOf(
  source: LogSource,
  choices: readonly { entityType: string; general: boolean }[],
): MaskingReport {
  const categories = Object.create(null) as Record<string, number>;
  let generalised = 0;
  for (const { entityType, general } of choices) {
    // A type the log would refuse (see isMaskingReport) is counted as OTHER, not dropped.
    const type = CATEGORY.test(entityType) ? entityType : FALLBACK_CATEGORY;
    categories[type] = (categories[type] ?? 0) + 1;
    if (general) generalised++;
  }
  return { source, masked: choices.length - generalised, generalised, categories };
}
