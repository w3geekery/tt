import { Component, OnInit, signal, computed, PLATFORM_ID, inject, ViewChild, AfterViewInit } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../services/api.service';
import { TimerService } from '../../services/timer.service';
import { AuthService } from '../../services/auth.service';
import { Company, Project, Task, Timer } from '../../models';
import { DurationPipe } from '../../pipes/duration.pipe';
import { ColorPickerComponent } from '../../components/color-picker';
import { SkeletonComponent } from '../../components/skeleton';

@Component({
  selector: 'app-config',
  imports: [
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatCheckboxModule,
    MatSelectModule,
    MatTableModule,
    MatSortModule,
    MatSnackBarModule,
    DurationPipe,
    ColorPickerComponent,
    SkeletonComponent,
  ],
  templateUrl: './config.html',
  styleUrl: './config.scss',
})
export class ConfigComponent implements OnInit, AfterViewInit {
  companies = signal<Company[]>([]);
  projects = signal<Project[]>([]);
  tasks = signal<Task[]>([]);

  // Drill-down selection
  selectedCompany = signal<Company | null>(null);
  selectedProject = signal<Project | null>(null);
  selectedTask = signal<Task | null>(null);

  // Inline editing state
  editingCompanyId = signal<string | null>(null);
  editingProjectId = signal<string | null>(null);
  editingTaskId = signal<string | null>(null);

  // Inline add state
  addingCompany = signal(false);
  addingProject = signal(false);
  addingTask = signal(false);

  // Edit form fields
  editName = '';
  editColor = '';
  editDailyCap: number | null = null;
  editWeeklyCap: number | null = null;
  editBillable = true;
  editOverflowCompanyId: string | null = null;
  editOverflowProjectId: string | null = null;
  editOverflowTaskId: string | null = null;
  editCode = '';
  editUrl = '';

  // New entity form fields
  newCompanyName = '';
  newCompanyColor = '';
  newProjectName = '';
  newProjectColor = '';
  newProjectDailyCap: number | null = null;
  newProjectWeeklyCap: number | null = null;
  newProjectBillable = true;
  newProjectOverflowCompanyId: string | null = null;
  newProjectOverflowProjectId: string | null = null;
  newProjectOverflowTaskId: string | null = null;
  newTaskName = '';
  newTaskCode = '';
  newTaskUrl = '';

  // Timer entries (Level 4)
  taskTimers = new MatTableDataSource<Timer>([]);
  timerColumns = ['date', 'start', 'end', 'duration', 'code', 'notes', 'actions'];
  taskTimerOffset = 0;
  taskTimerHasMore = signal(false);
  taskTimerLoading = signal(false);

  // Timer inline editing
  editingTimerId = signal<string | null>(null);
  editTimerStart = '';
  editTimerEnd = '';
  editTimerNotes = '';

  @ViewChild(MatSort) sort!: MatSort;

  filteredProjects = computed(() => {
    const company = this.selectedCompany();
    return company ? this.projects().filter((p) => p.company_id === company.id) : [];
  });

  filteredTasks = computed(() => {
    const project = this.selectedProject();
    return project ? this.tasks().filter((t) => t.project_id === project.id) : [];
  });

  // Overflow dropdown helpers
  overflowProjectsForCompany(companyId: string | null): Project[] {
    if (!companyId) return [];
    return this.projects().filter((p) => p.company_id === companyId);
  }

  overflowTasksForProject(projectId: string | null): Task[] {
    if (!projectId) return [];
    return this.tasks().filter((t) => t.project_id === projectId);
  }

  getOverflowLabel(project: Project): string {
    const parts: string[] = [];
    if (project.overflow_company_id) {
      const c = this.companies().find((co) => co.id === project.overflow_company_id);
      parts.push(c?.name ?? '?');
    }
    if (project.overflow_project_id) {
      const p = this.projects().find((pr) => pr.id === project.overflow_project_id);
      parts.push(p?.name ?? '?');
    }
    if (project.overflow_task_id) {
      const t = this.tasks().find((ta) => ta.id === project.overflow_task_id);
      parts.push(t?.name ?? '?');
    }
    return parts.join(' / ');
  }

  private platformId = inject(PLATFORM_ID);
  auth = inject(AuthService);

  constructor(
    private api: ApiService,
    private timerService: TimerService,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      const check = setInterval(() => {
        if (!this.auth.loading()) {
          clearInterval(check);
          if (this.auth.user()) {
            this.loadAll();
          }
        }
      }, 50);
    }
  }

  ngAfterViewInit() {
    this.taskTimers.sort = this.sort;
  }

  loadAll() {
    this.api.getCompanies().subscribe((c) => this.companies.set(c));
    this.api.getProjects().subscribe((p) => this.projects.set(p));
    this.api.getTasks().subscribe((t) => this.tasks.set(t));
  }

  // --- Navigation ---

  selectCompany(company: Company | null) {
    if (this.editingCompanyId() || this.editingProjectId() || this.editingTaskId()) return;
    this.selectedCompany.set(company);
    this.selectedProject.set(null);
    this.selectedTask.set(null);
    this.addingProject.set(false);
    this.addingTask.set(false);
    this.clearTimerEntries();
  }

  selectProject(project: Project | null) {
    if (this.editingProjectId() || this.editingTaskId()) return;
    this.selectedProject.set(project);
    this.selectedTask.set(null);
    this.addingTask.set(false);
    this.clearTimerEntries();
  }

  selectTask(task: Task | null) {
    if (this.editingTaskId()) return;
    this.selectedTask.set(task);
    this.clearTimerEntries();
    if (task) {
      this.loadTaskTimers(task.id);
    }
  }

  // --- Counts ---

  getProjectCount(companyId: string): number {
    return this.projects().filter((p) => p.company_id === companyId).length;
  }

  getTaskCount(projectId: string): number {
    return this.tasks().filter((t) => t.project_id === projectId).length;
  }

  // --- Inline edit helpers ---

  cancelEdit(event: Event) {
    event.stopPropagation();
    this.editingCompanyId.set(null);
    this.editingProjectId.set(null);
    this.editingTaskId.set(null);
  }

  // --- Company CRUD ---

  startAddCompany() {
    this.newCompanyName = '';
    this.newCompanyColor = '';
    this.addingCompany.set(true);
  }

  saveNewCompany() {
    if (!this.newCompanyName.trim()) return;
    this.api.createCompany({
      name: this.newCompanyName.trim(),
      color: this.newCompanyColor || null,
    }).subscribe((c) => {
      this.companies.update((list) => [...list, c]);
      this.addingCompany.set(false);
      this.snackBar.open('Company created', 'OK', { duration: 2000 });
    });
  }

  startEditCompany(company: Company) {
    this.editName = company.name;
    this.editColor = company.color ?? '';
    this.editingCompanyId.set(company.id);
  }

  saveCompany(event: Event, company: Company) {
    event.stopPropagation();
    if (!this.editName.trim()) return;
    this.api.updateCompany(company.id, {
      name: this.editName.trim(),
      color: this.editColor || null,
    }).subscribe((updated) => {
      this.companies.update((list) => list.map((c) => (c.id === updated.id ? updated : c)));
      if (this.selectedCompany()?.id === updated.id) {
        this.selectedCompany.set(updated);
      }
      this.editingCompanyId.set(null);
      this.snackBar.open('Company updated', 'OK', { duration: 2000 });
    });
  }

  deleteCompany(company: Company) {
    if (!confirm(`Delete "${company.name}"? This will also delete its projects and tasks.`)) return;
    this.api.deleteCompany(company.id).subscribe(() => {
      this.companies.update((list) => list.filter((c) => c.id !== company.id));
      this.projects.update((list) => list.filter((p) => p.company_id !== company.id));
      if (this.selectedCompany()?.id === company.id) {
        this.selectedCompany.set(null);
        this.selectedProject.set(null);
        this.selectedTask.set(null);
        this.clearTimerEntries();
      }
      this.snackBar.open('Company deleted', 'OK', { duration: 2000 });
    });
  }

  // --- Project CRUD ---

  startAddProject() {
    this.newProjectName = '';
    this.newProjectColor = '';
    this.newProjectDailyCap = null;
    this.newProjectWeeklyCap = null;
    this.newProjectBillable = true;
    this.newProjectOverflowCompanyId = null;
    this.newProjectOverflowProjectId = null;
    this.newProjectOverflowTaskId = null;
    this.addingProject.set(true);
  }

  saveNewProject() {
    if (!this.newProjectName.trim() || !this.selectedCompany()) return;
    this.api.createProject({
      company_id: this.selectedCompany()!.id,
      name: this.newProjectName.trim(),
      color: this.newProjectColor || null,
      daily_cap_hrs: this.newProjectDailyCap,
      weekly_cap_hrs: this.newProjectWeeklyCap,
      billable: this.newProjectBillable,
      overflow_company_id: this.newProjectOverflowCompanyId,
      overflow_project_id: this.newProjectOverflowProjectId,
      overflow_task_id: this.newProjectOverflowTaskId,
    }).subscribe((p) => {
      this.projects.update((list) => [...list, p]);
      this.addingProject.set(false);
      this.snackBar.open('Project created', 'OK', { duration: 2000 });
    });
  }

  startEditProject(project: Project) {
    this.editName = project.name;
    this.editColor = project.color ?? '';
    this.editDailyCap = project.daily_cap_hrs;
    this.editWeeklyCap = project.weekly_cap_hrs;
    this.editBillable = project.billable;
    this.editOverflowCompanyId = project.overflow_company_id;
    this.editOverflowProjectId = project.overflow_project_id;
    this.editOverflowTaskId = project.overflow_task_id;
    this.editingProjectId.set(project.id);
  }

  saveProject(event: Event, project: Project) {
    event.stopPropagation();
    if (!this.editName.trim()) return;
    this.api.updateProject(project.id, {
      name: this.editName.trim(),
      color: this.editColor || null,
      daily_cap_hrs: this.editDailyCap,
      weekly_cap_hrs: this.editWeeklyCap,
      billable: this.editBillable,
      overflow_company_id: this.editOverflowCompanyId,
      overflow_project_id: this.editOverflowProjectId,
      overflow_task_id: this.editOverflowTaskId,
    }).subscribe((updated) => {
      this.projects.update((list) => list.map((p) => (p.id === updated.id ? updated : p)));
      if (this.selectedProject()?.id === updated.id) {
        this.selectedProject.set(updated);
      }
      this.editingProjectId.set(null);
      this.snackBar.open('Project updated', 'OK', { duration: 2000 });
    });
  }

  deleteProject(project: Project) {
    if (!confirm(`Delete "${project.name}"? This will also delete its tasks.`)) return;
    this.api.deleteProject(project.id).subscribe(() => {
      this.projects.update((list) => list.filter((p) => p.id !== project.id));
      this.tasks.update((list) => list.filter((t) => t.project_id !== project.id));
      if (this.selectedProject()?.id === project.id) {
        this.selectedProject.set(null);
        this.selectedTask.set(null);
        this.clearTimerEntries();
      }
      this.snackBar.open('Project deleted', 'OK', { duration: 2000 });
    });
  }

  // --- Task CRUD ---

  startAddTask() {
    this.newTaskName = '';
    this.newTaskCode = '';
    this.newTaskUrl = '';
    this.addingTask.set(true);
  }

  saveNewTask() {
    if (!this.newTaskName.trim() || !this.selectedProject()) return;
    this.api.createTask({
      project_id: this.selectedProject()!.id,
      name: this.newTaskName.trim(),
      code: this.newTaskCode.trim() || null,
      url: this.newTaskUrl.trim() || null,
    }).subscribe((t) => {
      this.tasks.update((list) => [...list, t]);
      this.addingTask.set(false);
      this.snackBar.open('Task created', 'OK', { duration: 2000 });
    });
  }

  startEditTask(task: Task) {
    this.editName = task.name;
    this.editCode = task.code ?? '';
    this.editUrl = task.url ?? '';
    this.editingTaskId.set(task.id);
  }

  saveTask(event: Event, task: Task) {
    event.stopPropagation();
    if (!this.editName.trim()) return;
    this.api.updateTask(task.id, {
      name: this.editName.trim(),
      code: this.editCode.trim() || null,
      url: this.editUrl.trim() || null,
    }).subscribe((updated) => {
      this.tasks.update((list) => list.map((t) => (t.id === updated.id ? updated : t)));
      if (this.selectedTask()?.id === updated.id) {
        this.selectedTask.set(updated);
      }
      this.editingTaskId.set(null);
      this.snackBar.open('Task updated', 'OK', { duration: 2000 });
    });
  }

  deleteTask(task: Task) {
    if (!confirm(`Delete "${task.name}"?`)) return;
    this.api.deleteTask(task.id).subscribe(() => {
      this.tasks.update((list) => list.filter((t) => t.id !== task.id));
      if (this.selectedTask()?.id === task.id) {
        this.selectedTask.set(null);
        this.clearTimerEntries();
      }
      this.snackBar.open('Task deleted', 'OK', { duration: 2000 });
    });
  }

  // --- Timer Entries (Level 4) ---

  private clearTimerEntries() {
    this.taskTimers.data = [];
    this.taskTimerOffset = 0;
    this.taskTimerHasMore.set(false);
    this.editingTimerId.set(null);
  }

  loadTaskTimers(taskId: string, append = false) {
    this.taskTimerLoading.set(true);
    const limit = 20;
    this.timerService.getByTask(taskId, limit, this.taskTimerOffset).subscribe((timers) => {
      if (append) {
        this.taskTimers.data = [...this.taskTimers.data, ...timers];
      } else {
        this.taskTimers.data = timers;
      }
      this.taskTimerHasMore.set(timers.length === limit);
      this.taskTimerLoading.set(false);
    });
  }

  loadMoreTimers() {
    const task = this.selectedTask();
    if (!task) return;
    this.taskTimerOffset += 20;
    this.loadTaskTimers(task.id, true);
  }

  startNewTimerFromTask(task: Task) {
    // Stop any running timer first, then start a new one using this task as template
    this.timerService.getRunning().subscribe((running) => {
      const startNew = () => {
        this.timerService.create({
          company_id: this.selectedCompany()!.id,
          project_id: task.project_id,
          task_id: task.id,
        }).subscribe(() => {
          this.snackBar.open('Timer started', 'OK', { duration: 2000 });
          // Reload timer entries if viewing this task
          if (this.selectedTask()?.id === task.id) {
            this.taskTimerOffset = 0;
            this.loadTaskTimers(task.id);
          }
        });
      };

      if (running) {
        this.timerService.stop(running.id).subscribe(() => {
          this.snackBar.open('Previous timer stopped', 'OK', { duration: 1500 });
          startNew();
        });
      } else {
        startNew();
      }
    });
  }

  // --- Timer inline editing ---

  startEditTimer(timer: Timer) {
    this.editTimerStart = timer.started ? this.formatDatetimeLocal(timer.started) : '';
    this.editTimerEnd = timer.ended ? this.formatDatetimeLocal(timer.ended) : '';
    this.editTimerNotes = timer.notes ?? '';
    this.editingTimerId.set(timer.id);
  }

  cancelEditTimer() {
    this.editingTimerId.set(null);
  }

  saveTimer(timer: Timer) {
    const data: Partial<Timer> = {
      started: new Date(this.editTimerStart).toISOString(),
      notes: this.editTimerNotes || null,
    };
    if (this.editTimerEnd) {
      data.ended = new Date(this.editTimerEnd).toISOString();
    }
    this.timerService.update(timer.id, data).subscribe((updated) => {
      this.taskTimers.data = this.taskTimers.data.map((t) => (t.id === updated.id ? updated : t));
      this.editingTimerId.set(null);
      this.snackBar.open('Timer updated', 'OK', { duration: 2000 });
    });
  }

  deleteTimer(timer: Timer) {
    if (!confirm('Delete this timer entry?')) return;
    this.timerService.delete(timer.id).subscribe(() => {
      this.taskTimers.data = this.taskTimers.data.filter((t) => t.id !== timer.id);
      this.snackBar.open('Timer deleted', 'OK', { duration: 2000 });
    });
  }

  // Computed duration from editTimerStart/editTimerEnd
  getEditDurationMs(): number | null {
    if (!this.editTimerStart || !this.editTimerEnd) return null;
    const start = new Date(this.editTimerStart).getTime();
    const end = new Date(this.editTimerEnd).getTime();
    if (isNaN(start) || isNaN(end) || end <= start) return null;
    return end - start;
  }

  // --- Formatting helpers ---

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  formatTime(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  private formatDatetimeLocal(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}
