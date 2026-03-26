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
}

export interface CapStatus {
  project_id: string;
  project_name: string;
  company_id: string;
  company_name: string;
  daily: { cap_hrs: number; used_hrs: number; remaining_hrs: number; pct: number } | null;
  weekly: { cap_hrs: number; used_hrs: number; remaining_hrs: number; pct: number } | null;
}

export interface RecurringTimer {
  id: string;
  company_id: string;
  project_id?: string | null;
  task_id?: string | null;
  pattern: 'daily' | 'weekly';
  weekday?: number | null;
  start_time?: string | null;
  start_date: string;
  end_date?: string | null;
  notes?: string | null;
  active: boolean;
  skipped_dates: string[];
}
