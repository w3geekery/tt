import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Notification, UserSettings } from '../models';

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  constructor(private http: HttpClient) {}

  create(data: {
    trigger_at: string;
    type: 'manual' | 'timer_switch' | 'timer_end' | 'cap_alert';
    title: string;
    message?: string | null;
    timer_id?: string | null;
  }) {
    return this.http.post<Notification>('/api/notifications', data);
  }

  list(opts: { date?: string; from?: string; to?: string; status?: string } = {}) {
    const params = new URLSearchParams();
    if (opts.date) params.append('date', opts.date);
    if (opts.from) params.append('from', opts.from);
    if (opts.to) params.append('to', opts.to);
    if (opts.status) params.append('status', opts.status);
    const qs = params.toString();
    return this.http.get<Notification[]>(`/api/notifications${qs ? '?' + qs : ''}`);
  }

  update(id: string, data: Partial<Notification>) {
    return this.http.patch<Notification>(`/api/notifications/${id}`, data);
  }

  delete(id: string) {
    return this.http.delete(`/api/notifications/${id}`);
  }

  getSettings() {
    return this.http.get<UserSettings>('/api/notifications/settings');
  }

  updateSettings(data: Partial<UserSettings>) {
    return this.http.patch<UserSettings>('/api/notifications/settings', data);
  }
}
