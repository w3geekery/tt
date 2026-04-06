export interface User {
  id: string;
  username: string;
  avatar_url: string | null;
}

export interface Company {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  initials: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  company_id: string;
  name: string;
  color: string | null;
  billable: boolean;
  daily_cap_hrs: number | null;
  weekly_cap_hrs: number | null;
  overflow_company_id: string | null;
  overflow_project_id: string | null;
  overflow_task_id: string | null;
  notify_on_cap: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  project_id: string;
  name: string;
  code: string | null;
  url: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type TimerState = 'running' | 'paused' | 'stopped';

export interface ExternalTaskLink {
  provider: 'zerobias' | 'jira' | 'github';
  task: {
    id: string;
    code: string;
    name: string;
    url?: string;
    commentId?: string;
    commentUrl?: string;
  };
  boundary?: { id: string; name: string };
  organization?: { id: string; name: string };
  project?: { key: string; name: string };
}

export interface Timer {
  id: string;
  user_id: string;
  company_id: string;
  project_id: string | null;
  task_id: string | null;
  recurring_id: string | null;
  recurring_start_time?: string | null;
  slug: string | null;
  state: TimerState;
  start_at: string | null;
  started: string | null;
  ended: string | null;
  duration_ms: number | null;
  notes: string | null;
  external_task: ExternalTaskLink | null;
  company_name?: string;
  company_color?: string | null;
  project_name?: string;
  project_color?: string | null;
  task_name?: string;
  task_code?: string | null;
  task_url?: string | null;
  stop_at: string | null;
  notify_on_switch?: boolean;
  segments?: TimerSegment[];
  created_at: string;
  updated_at: string;
}

export interface TimerSegment {
  id: string;
  timer_id: string;
  started: string;
  ended: string | null;
  duration_ms: number | null; // Computed from (ended - started) by API, never stored
  notes: string | null;
  paused_at: string | null;
  resume_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  trigger_at: string;
  type: 'manual' | 'timer_switch' | 'timer_end' | 'cap_alert';
  title: string;
  message: string | null;
  status: 'pending' | 'fired' | 'dismissed';
  timer_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  timeline_start_hour: number;
  timeline_end_hour: number;
  notify_on_cap: boolean;
}

// Cap status types
export interface CapDetail {
  logged: number;
  cap: number;
  remaining: number;
  pct: number;
  status: 'ok' | 'warning' | 'at_cap' | 'over_cap';
}

export interface ProjectCapStatus {
  company: string;
  companyInitials: string;
  companyId: string;
  project: string;
  projectId: string;
  daily: CapDetail | null;
  weekly: CapDetail | null;
}

export interface CapStatusRunningTimer {
  companyId: string;
  projectId: string | null;
  elapsedMs: number;
  willHitDailyCap: string | null;
  willHitWeeklyCap: string | null;
}

export interface CapStatus {
  date: string;
  weekStart: string;
  weekEnd: string;
  projects: ProjectCapStatus[];
  runningTimer: CapStatusRunningTimer | null;
}

export type RecurrencePattern = 'weekdays' | 'weekly';

export interface RecurringTimer {
  id: string;
  user_id: string;
  company_id: string;
  project_id: string | null;
  task_id: string | null;
  pattern: RecurrencePattern;
  weekday: number | null;
  start_time: string;
  start_date: string;
  end_date: string | null;
  active: boolean;
  notes: string | null;
  company_name?: string;
  company_color?: string | null;
  project_name?: string | null;
  project_color?: string | null;
  task_name?: string | null;
  task_code?: string | null;
  created_at: string;
  updated_at: string;
}

export interface FavoriteTemplate {
  id: string;
  company_id: string;
  project_id: string | null;
  task_id: string | null;
  sort_order: number;
  company_name: string;
  company_color: string | null;
  project_name: string | null;
  project_color: string | null;
  task_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimerTemplate {
  company_id: string;
  project_id: string | null;
  task_id: string | null;
  company_name: string;
  company_color: string | null;
  project_name: string | null;
  project_color: string | null;
  task_name: string | null;
  task_code: string | null;
  usage_count: number;
  last_used: string;
}
