import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { Company, Project, Task, Timer, TimerSegment, CapStatus, RecurringTimer } from '../models/types';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  // --- Companies ---
  getCompanies(): Observable<Company[]> { return this.http.get<Company[]>('/api/companies'); }
  getCompany(id: string): Observable<Company> { return this.http.get<Company>(`/api/companies/${id}`); }
  createCompany(data: Partial<Company>): Observable<Company> { return this.http.post<Company>('/api/companies', data); }
  updateCompany(id: string, data: Partial<Company>): Observable<Company> { return this.http.put<Company>(`/api/companies/${id}`, data); }
  deleteCompany(id: string): Observable<void> { return this.http.delete<void>(`/api/companies/${id}`); }

  // --- Projects ---
  getProjects(): Observable<Project[]> { return this.http.get<Project[]>('/api/projects'); }
  getProjectsByCompany(companyId: string): Observable<Project[]> { return this.http.get<Project[]>(`/api/projects/company/${companyId}`); }
  createProject(data: Partial<Project>): Observable<Project> { return this.http.post<Project>('/api/projects', data); }
  updateProject(id: string, data: Partial<Project>): Observable<Project> { return this.http.put<Project>(`/api/projects/${id}`, data); }
  deleteProject(id: string): Observable<void> { return this.http.delete<void>(`/api/projects/${id}`); }

  // --- Tasks ---
  getTasks(): Observable<Task[]> { return this.http.get<Task[]>('/api/tasks'); }
  getTasksByProject(projectId: string): Observable<Task[]> { return this.http.get<Task[]>(`/api/tasks/project/${projectId}`); }
  createTask(data: Partial<Task>): Observable<Task> { return this.http.post<Task>('/api/tasks', data); }
  updateTask(id: string, data: Partial<Task>): Observable<Task> { return this.http.put<Task>(`/api/tasks/${id}`, data); }
  deleteTask(id: string): Observable<void> { return this.http.delete<void>(`/api/tasks/${id}`); }

  // --- Timers ---
  getTimers(): Observable<Timer[]> { return this.http.get<Timer[]>('/api/timers'); }
  getRunningTimer(): Observable<Timer | null> { return this.http.get<Timer | null>('/api/timers/running'); }
  getTimersByDate(date: string): Observable<Timer[]> { return this.http.get<Timer[]>(`/api/timers/date/${date}`); }
  getTimerBySlug(slug: string): Observable<Timer> { return this.http.get<Timer>(`/api/timers/slug/${slug}`); }
  getTimer(id: string): Observable<Timer> { return this.http.get<Timer>(`/api/timers/${id}`); }
  getSegments(timerId: string): Observable<TimerSegment[]> { return this.http.get<TimerSegment[]>(`/api/timers/${timerId}/segments`); }
  createTimer(data: Partial<Timer>): Observable<Timer> { return this.http.post<Timer>('/api/timers', data); }
  addEntry(data: { company_id: string; project_id?: string; task_id?: string; started: string; ended: string; notes?: string }): Observable<Timer> {
    return this.http.post<Timer>('/api/timers/entry', data);
  }
  updateTimer(id: string, data: Partial<Timer>): Observable<Timer> { return this.http.put<Timer>(`/api/timers/${id}`, data); }
  deleteTimer(id: string): Observable<void> { return this.http.delete<void>(`/api/timers/${id}`); }
  startTimer(id: string): Observable<Timer> { return this.http.post<Timer>(`/api/timers/${id}/start`, {}); }
  stopTimer(id: string): Observable<Timer> { return this.http.post<Timer>(`/api/timers/${id}/stop`, {}); }
  pauseTimer(id: string): Observable<Timer> { return this.http.post<Timer>(`/api/timers/${id}/pause`, {}); }
  resumeTimer(id: string): Observable<Timer> { return this.http.post<Timer>(`/api/timers/${id}/resume`, {}); }

  // --- Cap Status ---
  getCapStatus(): Observable<CapStatus[]> { return this.http.get<CapStatus[]>('/api/cap-status'); }

  // --- Recurring ---
  getRecurringTimers(): Observable<RecurringTimer[]> { return this.http.get<RecurringTimer[]>('/api/recurring'); }
  createRecurring(data: Partial<RecurringTimer>): Observable<RecurringTimer> { return this.http.post<RecurringTimer>('/api/recurring', data); }
  deleteRecurring(id: string): Observable<void> { return this.http.delete<void>(`/api/recurring/${id}`); }
}
