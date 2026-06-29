import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RecurringNotification, RecurringNotificationPattern } from '../models';

export interface CreateRecurringNotification {
  title: string;
  message?: string | null;
  pattern: RecurringNotificationPattern;
  weekdays?: number[];
  trigger_time: string;
  start_date: string;
  end_date?: string | null;
  delivery?: 'bell' | 'voice' | null;
  voice?: string | null;
}

@Injectable({ providedIn: 'root' })
export class RecurringNotificationsService {
  private http = inject(HttpClient);
  private base = '/api/notifications/recurring';

  list(activeOnly = false) {
    const qs = activeOnly ? '?active=true' : '';
    return this.http.get<RecurringNotification[]>(`${this.base}${qs}`);
  }

  create(data: CreateRecurringNotification) {
    return this.http.post<RecurringNotification>(this.base, data);
  }

  update(id: string, data: Partial<CreateRecurringNotification> & { active?: boolean }) {
    return this.http.patch<RecurringNotification>(`${this.base}/${id}`, data);
  }

  delete(id: string) {
    return this.http.delete(`${this.base}/${id}`);
  }

  skip(id: string, date: string) {
    return this.http.post<RecurringNotification>(`${this.base}/${id}/skip`, { date });
  }

  unskip(id: string, date: string) {
    return this.http.post<RecurringNotification>(`${this.base}/${id}/unskip`, { date });
  }
}
