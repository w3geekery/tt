/**
 * Core types for tt — the local-first time tracker.
 */

// --- Database entities ---

export interface Company {
  id: string;
  name: string;
  initials?: string | null;
  color?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  company_id: string;
  name: string;
  color?: string | null;
  billable: boolean;
  daily_cap_hrs?: number | null;
  weekly_cap_hrs?: number | null;
  overflow_company_id?: string | null;
  overflow_project_id?: string | null;
  overflow_task_id?: string | null;
  notify_on_cap: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  company_id: string;
  project_id?: string | null;
  name: string;
  code?: string | null;
  url?: string | null;
  created_at: string;
  updated_at: string;
}

export type TimerState = 'running' | 'paused' | 'stopped';

export interface Timer {
  id: string;
  company_id: string;
  project_id?: string | null;
  task_id?: string | null;
  slug?: string | null;
  state: TimerState;
  start_at?: string | null;
  started?: string | null;
  ended?: string | null;
  stop_at?: string | null;
  duration_ms?: number | null;
  notes?: string | null;
  notify_on_switch: boolean;
  external_task?: Record<string, unknown> | null;
  recurring_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimerSegment {
  id: string;
  timer_id: string;
  started: string;
  ended?: string | null;
  duration_ms?: number | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export type RecurringPattern = 'daily' | 'weekly';

export interface RecurringTimer {
  id: string;
  company_id: string;
  project_id?: string | null;
  task_id?: string | null;
  pattern: RecurringPattern;
  weekday?: number | null;
  start_time?: string | null;
  start_date: string;
  end_date?: string | null;
  notes?: string | null;
  active: boolean;
  skipped_dates: string[];
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message?: string | null;
  timer_id?: string | null;
  trigger_at: string;
  fired_at?: string | null;
  dismissed: boolean;
  created_at: string;
}

// --- Extension hooks ---

export interface TtExtensions {
  /** Called after a timer starts */
  onTimerStart?: (timer: Timer) => Promise<void>;

  /** Called after a timer stops */
  onTimerStop?: (timer: Timer) => Promise<void>;

  /** Called after a timer is paused */
  onTimerPause?: (timer: Timer) => Promise<void>;

  /** Called after a timer is resumed */
  onTimerResume?: (timer: Timer) => Promise<void>;

  /** Called when a daily or weekly cap is reached */
  onCapHit?: (project: Project, capType: 'daily' | 'weekly') => Promise<void>;

  /** Custom invoice formatting — return HTML string */
  formatInvoice?: (data: InvoiceData) => string;

  /** Resolve an external task reference (Jira, ZeroBias, GitHub, etc.) */
  resolveExternalTask?: (ref: string) => Promise<ExternalTaskInfo | null>;

  /** Process sessions for timer note backfill */
  onBackfill?: (sessions: BackfillSession[]) => Promise<BackfillResult[]>;

  /** Process a meeting transcript */
  onTranscript?: (transcript: string) => Promise<TranscriptResult>;
}

// --- Config ---

export interface TtConfig {
  /** Express server port (default: 4301) */
  port: number;

  /** Path to SQLite database (default: ~/.tt/tt.db) */
  db: string;

  /** IANA timezone for date calculations (default: America/Los_Angeles) */
  timezone: string;

  /** Rounding interval in minutes (default: 15) */
  roundingMinutes: number;

  /** Extension hooks */
  extensions: TtExtensions;
}

// --- Extension data types ---

export interface InvoiceData {
  company: Company;
  project: Project;
  timers: Timer[];
  periodStart: string;
  periodEnd: string;
  totalHours: number;
  rate?: number;
}

export interface ExternalTaskInfo {
  provider: string;
  id: string;
  title: string;
  url: string;
  status?: string;
}

export interface BackfillSession {
  path: string;
  startTime: string;
  endTime: string;
  content: string;
}

export interface BackfillResult {
  timerId: string;
  notes: string;
}

export interface TranscriptResult {
  summary: string;
  actionItems: string[];
  timeEntries?: Array<{
    description: string;
    durationMinutes: number;
  }>;
}
