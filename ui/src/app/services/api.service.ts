import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Company, Project, Task } from '../models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  // Companies
  getCompanies() {
    return this.http.get<Company[]>('/api/companies');
  }

  createCompany(data: Partial<Company>) {
    return this.http.post<Company>('/api/companies', data);
  }

  updateCompany(id: string, data: Partial<Company>) {
    return this.http.patch<Company>(`/api/companies/${id}`, data);
  }

  deleteCompany(id: string) {
    return this.http.delete(`/api/companies/${id}`);
  }

  // Projects
  getProjects(companyId?: string) {
    const params = companyId ? `?company_id=${companyId}` : '';
    return this.http.get<Project[]>(`/api/projects${params}`);
  }

  createProject(data: Partial<Project>) {
    return this.http.post<Project>('/api/projects', data);
  }

  updateProject(id: string, data: Partial<Project>) {
    return this.http.patch<Project>(`/api/projects/${id}`, data);
  }

  deleteProject(id: string) {
    return this.http.delete(`/api/projects/${id}`);
  }

  // Tasks
  getTasks(projectId?: string) {
    const params = projectId ? `?project_id=${projectId}` : '';
    return this.http.get<Task[]>(`/api/tasks${params}`);
  }

  createTask(data: Partial<Task>) {
    return this.http.post<Task>('/api/tasks', data);
  }

  updateTask(id: string, data: Partial<Task>) {
    return this.http.patch<Task>(`/api/tasks/${id}`, data);
  }

  deleteTask(id: string) {
    return this.http.delete(`/api/tasks/${id}`);
  }

  // Segments
  patchSegmentNotes(timerId: string, segmentId: string, notes: string) {
    return this.http.patch(`/api/timers/${timerId}/segments/${segmentId}`, { notes });
  }

  // Weekly Tasks
  getWeeklyTasks(weekStart: string) {
    return this.http.get<Array<{ company: string; taskId: string; taskCode?: string; taskName?: string }>>(`/api/weekly-tasks?week_start=${weekStart}`);
  }
}
