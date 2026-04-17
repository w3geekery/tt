import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Timer, TimerTemplate, RecurringTimer } from '../models';

@Injectable({ providedIn: 'root' })
export class TimerService {
  constructor(private http: HttpClient) {}

  getByDate(date: string) {
    return this.http.get<Timer[]>(`/api/timers?date=${date}`);
  }

  getByRange(from: string, to: string, companyId?: string) {
    let url = `/api/timers?from=${from}&to=${to}`;
    if (companyId) url += `&company_id=${companyId}`;
    return this.http.get<Timer[]>(url);
  }

  getByTask(taskId: string, limit = 20, offset = 0) {
    return this.http.get<Timer[]>(`/api/timers?task_id=${taskId}&limit=${limit}&offset=${offset}`);
  }

  getRunning() {
    return this.http.get<Timer | null>('/api/timers/running');
  }

  getById(id: string) {
    return this.http.get<Timer>(`/api/timers/${id}`);
  }

  create(data: Partial<Timer>) {
    return this.http.post<Timer>('/api/timers', data);
  }

  update(id: string, data: Partial<Timer>) {
    return this.http.patch<Timer>(`/api/timers/${id}`, data);
  }

  stop(id: string) {
    return this.http.post<Timer>(`/api/timers/${id}/stop`, {});
  }

  pause(id: string) {
    return this.http.post<Timer>(`/api/timers/${id}/pause`, {});
  }

  resume(id: string) {
    return this.http.post<Timer>(`/api/timers/${id}/resume`, {});
  }

  delete(id: string) {
    return this.http.delete(`/api/timers/${id}`);
  }

  getTemplates(limit = 10) {
    return this.http.get<TimerTemplate[]>(`/api/timers/templates?limit=${limit}`);
  }

  getScheduled() {
    return this.http.get<Timer[]>('/api/timers/scheduled');
  }

  startScheduled() {
    return this.http.post<Timer[]>('/api/timers/start-scheduled', {});
  }

  // --- Recurring timers ---

  getRecurring(activeOnly = true) {
    return this.http.get<RecurringTimer[]>(`/api/timers/recurring?active=${activeOnly}`);
  }

  createRecurring(data: Partial<RecurringTimer>) {
    return this.http.post<RecurringTimer>('/api/timers/recurring', data);
  }

  updateRecurring(id: string, data: Partial<RecurringTimer>) {
    return this.http.patch<RecurringTimer>(`/api/timers/recurring/${id}`, data);
  }

  deleteRecurring(id: string) {
    return this.http.delete(`/api/timers/recurring/${id}`);
  }

  materialize(from: string, to: string) {
    return this.http.post<Timer[]>('/api/timers/recurring/materialize', { from, to });
  }

  skipOccurrence(recurringId: string, date: string) {
    return this.http.post(`/api/timers/recurring/${recurringId}/skip`, { date });
  }

  removeSkip(recurringId: string, date: string) {
    return this.http.post(`/api/timers/recurring/${recurringId}/unskip`, { date });
  }
}
