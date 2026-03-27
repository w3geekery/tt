import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatListModule } from '@angular/material/list';
import { MatTableModule } from '@angular/material/table';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { SnackbarService } from '../../services/snackbar.service';
import { BreadcrumbComponent, Crumb } from '../../components/breadcrumb/breadcrumb';
import { ColorPickerComponent } from '../../components/color-picker/color-picker';
import { DurationPipe } from '../../pipes/duration.pipe';
import type { Company, Project, Task, Timer } from '../../models/types';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule, MatCardModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatCheckboxModule,
    MatDividerModule, MatListModule, MatTableModule, FormsModule,
    BreadcrumbComponent, ColorPickerComponent, DurationPipe,
  ],
  template: `
    <app-breadcrumb [crumbs]="breadcrumbs" />

    <!-- Level 1: Companies -->
    @if (!selectedCompany) {
      <h2>Companies</h2>
      <div class="card-grid">
        @for (co of companies; track co.id) {
          <mat-card class="entity-card" [class.selected]="false" (click)="selectCompany(co)">
            @if (co.color) {
              <div class="color-bar" [style.background]="co.color"></div>
            }
            <mat-card-content>
              <strong>{{ co.name }}</strong>
              @if (co.initials) { <span class="initials">({{ co.initials }})</span> }
              <div class="sub-count">{{ getProjectCount(co.id) }} projects</div>
            </mat-card-content>
            <mat-card-actions>
              <button mat-icon-button (click)="editingCompany = co; $event.stopPropagation()"><mat-icon>edit</mat-icon></button>
              <button mat-icon-button (click)="deleteCompany(co); $event.stopPropagation()"><mat-icon>delete</mat-icon></button>
            </mat-card-actions>
          </mat-card>
        }
        <!-- Add company card -->
        <mat-card class="entity-card add-card">
          <mat-card-content>
            <mat-form-field appearance="outline">
              <mat-label>Name</mat-label>
              <input matInput [(ngModel)]="newCompany.name">
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Initials</mat-label>
              <input matInput [(ngModel)]="newCompany.initials" maxlength="4">
            </mat-form-field>
            <div class="color-row">
              <span>Color:</span>
              <app-color-picker [(ngModel)]="newCompany.color" />
            </div>
          </mat-card-content>
          <mat-card-actions>
            <button mat-raised-button color="primary" (click)="addCompany()" [disabled]="!newCompany.name">Create</button>
          </mat-card-actions>
        </mat-card>
      </div>
    }

    <!-- Level 2: Projects (selected company) -->
    @if (selectedCompany && !selectedProject) {
      <h2>{{ selectedCompany.name }} — Projects</h2>
      <div class="card-grid">
        @for (proj of companyProjects; track proj.id) {
          <mat-card class="entity-card" (click)="selectProject(proj)">
            @if (proj.color) {
              <div class="color-bar" [style.background]="proj.color"></div>
            }
            <mat-card-content>
              <strong>{{ proj.name }}</strong>
              @if (!proj.billable) { <span class="badge muted">non-billable</span> }
              @if (proj.daily_cap_hrs) { <span class="badge">{{ proj.daily_cap_hrs }}h/day</span> }
              @if (proj.weekly_cap_hrs) { <span class="badge">{{ proj.weekly_cap_hrs }}h/week</span> }
              <div class="sub-count">{{ getTaskCount(proj.id) }} tasks</div>
            </mat-card-content>
            <mat-card-actions>
              <button mat-icon-button (click)="$event.stopPropagation()"><mat-icon>edit</mat-icon></button>
              <button mat-icon-button (click)="deleteProject(proj); $event.stopPropagation()"><mat-icon>delete</mat-icon></button>
            </mat-card-actions>
          </mat-card>
        }
        <!-- Add project card -->
        <mat-card class="entity-card add-card">
          <mat-card-content>
            <mat-form-field appearance="outline">
              <mat-label>Name</mat-label>
              <input matInput [(ngModel)]="newProject.name">
            </mat-form-field>
            <div class="inline-fields">
              <mat-form-field appearance="outline">
                <mat-label>Daily cap (hrs)</mat-label>
                <input matInput type="number" [(ngModel)]="newProject.daily_cap_hrs">
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Weekly cap (hrs)</mat-label>
                <input matInput type="number" [(ngModel)]="newProject.weekly_cap_hrs">
              </mat-form-field>
            </div>
            <mat-checkbox [(ngModel)]="newProject.billable">Billable</mat-checkbox>
            <div class="color-row">
              <span>Color:</span>
              <app-color-picker [(ngModel)]="newProject.color" />
            </div>
          </mat-card-content>
          <mat-card-actions>
            <button mat-raised-button color="primary" (click)="addProject()" [disabled]="!newProject.name">Create</button>
          </mat-card-actions>
        </mat-card>
      </div>
    }

    <!-- Level 3: Tasks (selected project) -->
    @if (selectedProject && !selectedTask) {
      <h2>{{ selectedProject.name }} — Tasks</h2>
      <div class="card-grid">
        @for (task of projectTasks; track task.id) {
          <mat-card class="entity-card" (click)="selectTask(task)">
            <mat-card-content>
              <strong>{{ task.name }}</strong>
              @if (task.code) { <span class="badge">{{ task.code }}</span> }
              @if (task.url) {
                <a class="task-link" [href]="task.url" target="_blank" (click)="$event.stopPropagation()">
                  <mat-icon>open_in_new</mat-icon>
                </a>
              }
            </mat-card-content>
            <mat-card-actions>
              <button mat-icon-button (click)="deleteTask(task); $event.stopPropagation()"><mat-icon>delete</mat-icon></button>
            </mat-card-actions>
          </mat-card>
        }
        <!-- Add task card -->
        <mat-card class="entity-card add-card">
          <mat-card-content>
            <mat-form-field appearance="outline">
              <mat-label>Name</mat-label>
              <input matInput [(ngModel)]="newTask.name">
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Code</mat-label>
              <input matInput [(ngModel)]="newTask.code" placeholder="JIRA-123">
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>URL</mat-label>
              <input matInput [(ngModel)]="newTask.url" placeholder="https://...">
            </mat-form-field>
          </mat-card-content>
          <mat-card-actions>
            <button mat-raised-button color="primary" (click)="addTask()" [disabled]="!newTask.name">Create</button>
          </mat-card-actions>
        </mat-card>
      </div>
    }

    <!-- Level 4: Timer history (selected task) -->
    @if (selectedTask) {
      <h2>{{ selectedTask.name }} — Timer History</h2>
      @if (taskTimers.length) {
        <table mat-table [dataSource]="taskTimers">
          <ng-container matColumnDef="date">
            <th mat-header-cell *matHeaderCellDef>Date</th>
            <td mat-cell *matCellDef="let t">{{ t.started | date:'mediumDate' }}</td>
          </ng-container>
          <ng-container matColumnDef="start">
            <th mat-header-cell *matHeaderCellDef>Start</th>
            <td mat-cell *matCellDef="let t">{{ t.started | date:'shortTime' }}</td>
          </ng-container>
          <ng-container matColumnDef="end">
            <th mat-header-cell *matHeaderCellDef>End</th>
            <td mat-cell *matCellDef="let t">{{ t.ended | date:'shortTime' }}</td>
          </ng-container>
          <ng-container matColumnDef="duration">
            <th mat-header-cell *matHeaderCellDef>Duration</th>
            <td mat-cell *matCellDef="let t">{{ t.duration_ms | duration:'decimal' }}</td>
          </ng-container>
          <ng-container matColumnDef="notes">
            <th mat-header-cell *matHeaderCellDef>Notes</th>
            <td mat-cell *matCellDef="let t">{{ t.notes || '—' }}</td>
          </ng-container>
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let t">
              <button mat-icon-button (click)="deleteTimer(t)"><mat-icon>delete</mat-icon></button>
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="timerColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: timerColumns"></tr>
        </table>
      } @else {
        <p class="empty">No timers for this task.</p>
      }
    }

    <!-- Edit company dialog (inline) -->
    @if (editingCompany) {
      <div class="edit-overlay" (click)="editingCompany = null">
        <mat-card class="edit-card" (click)="$event.stopPropagation()">
          <mat-card-header><mat-card-title>Edit {{ editingCompany.name }}</mat-card-title></mat-card-header>
          <mat-card-content>
            <mat-form-field appearance="outline">
              <mat-label>Name</mat-label>
              <input matInput [(ngModel)]="editingCompany.name">
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Initials</mat-label>
              <input matInput [(ngModel)]="editingCompany.initials">
            </mat-form-field>
            <div class="color-row">
              <span>Color:</span>
              <app-color-picker [(ngModel)]="editingCompany.color" />
            </div>
          </mat-card-content>
          <mat-card-actions>
            <button mat-raised-button color="primary" (click)="saveCompany()">Save</button>
            <button mat-button (click)="editingCompany = null">Cancel</button>
          </mat-card-actions>
        </mat-card>
      </div>
    }
  `,
  styles: `
    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 12px;
      margin-top: 12px;
    }
    .entity-card {
      cursor: pointer;
      transition: box-shadow 0.15s;
      &:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
    }
    .add-card { cursor: default; }
    .color-bar {
      height: 4px;
      border-radius: 4px 4px 0 0;
    }
    .initials {
      color: var(--mat-sys-on-surface-variant);
      margin-left: 4px;
    }
    .sub-count {
      font-size: 0.8rem;
      color: var(--mat-sys-on-surface-variant);
      margin-top: 4px;
    }
    .badge {
      font-size: 0.7rem;
      padding: 1px 6px;
      margin-left: 4px;
      border-radius: 10px;
      background: var(--mat-sys-surface-variant);
      color: var(--mat-sys-on-surface-variant);
    }
    .badge.muted { opacity: 0.6; }
    .inline-fields {
      display: flex;
      gap: 8px;
    }
    .inline-fields mat-form-field { flex: 1; }
    .color-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 8px 0;
    }
    .task-link {
      color: var(--mat-sys-primary);
      mat-icon { font-size: 16px; width: 16px; height: 16px; }
    }
    table { width: 100%; }
    .empty {
      color: var(--mat-sys-on-surface-variant);
      text-align: center;
      padding: 32px;
    }
    .edit-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    .edit-card {
      min-width: 320px;
      max-width: 480px;
    }
  `,
})
export class SettingsComponent implements OnInit {
  private api = inject(ApiService);
  private snack = inject(SnackbarService);

  companies: Company[] = [];
  projects: Project[] = [];
  tasks: Task[] = [];
  taskTimers: Timer[] = [];

  selectedCompany: Company | null = null;
  selectedProject: Project | null = null;
  selectedTask: Task | null = null;
  editingCompany: Company | null = null;

  newCompany = { name: '', initials: '', color: '' };
  newProject = { name: '', daily_cap_hrs: null as number | null, weekly_cap_hrs: null as number | null, billable: true, color: '' };
  newTask = { name: '', code: '', url: '' };

  timerColumns = ['date', 'start', 'end', 'duration', 'notes', 'actions'];

  get breadcrumbs(): Crumb[] {
    const crumbs: Crumb[] = [{ label: 'Config', link: '/settings' }];
    if (this.selectedCompany) {
      crumbs.push({ label: this.selectedCompany.name, link: this.selectedProject ? '/settings' : undefined });
    }
    if (this.selectedProject) {
      crumbs.push({ label: this.selectedProject.name, link: this.selectedTask ? '/settings' : undefined });
    }
    if (this.selectedTask) {
      crumbs.push({ label: this.selectedTask.name });
    }
    return crumbs;
  }

  get companyProjects(): Project[] {
    return this.projects.filter(p => p.company_id === this.selectedCompany?.id);
  }

  get projectTasks(): Task[] {
    return this.tasks.filter(t => t.project_id === this.selectedProject?.id);
  }

  ngOnInit(): void { this.loadAll(); }

  getProjectCount(companyId: string): number {
    return this.projects.filter(p => p.company_id === companyId).length;
  }

  getTaskCount(projectId: string): number {
    return this.tasks.filter(t => t.project_id === projectId).length;
  }

  selectCompany(co: Company): void {
    this.selectedCompany = co;
    this.selectedProject = null;
    this.selectedTask = null;
  }

  selectProject(proj: Project): void {
    this.selectedProject = proj;
    this.selectedTask = null;
  }

  selectTask(task: Task): void {
    this.selectedTask = task;
    this.api.getTimers().subscribe(timers => {
      this.taskTimers = timers
        .filter(t => t.task_id === task.id)
        .sort((a, b) => (b.started ?? '').localeCompare(a.started ?? ''));
    });
  }

  // Breadcrumb click resets drill-down
  resetTo(level: number): void {
    if (level === 0) { this.selectedCompany = null; this.selectedProject = null; this.selectedTask = null; }
    if (level === 1) { this.selectedProject = null; this.selectedTask = null; }
    if (level === 2) { this.selectedTask = null; }
  }

  private loadAll(): void {
    this.api.getCompanies().subscribe(list => this.companies = list);
    this.api.getProjects().subscribe(list => this.projects = list);
    this.api.getTasks().subscribe(list => this.tasks = list);
  }

  addCompany(): void {
    this.api.createCompany(this.newCompany).subscribe(co => {
      this.snack.show(`Created ${co.name}`);
      this.newCompany = { name: '', initials: '', color: '' };
      this.loadAll();
    });
  }

  saveCompany(): void {
    if (!this.editingCompany) return;
    this.api.updateCompany(this.editingCompany.id, this.editingCompany).subscribe(() => {
      this.snack.show('Company updated');
      this.editingCompany = null;
      this.loadAll();
    });
  }

  deleteCompany(co: Company): void {
    this.api.deleteCompany(co.id).subscribe(() => {
      this.snack.show(`Deleted ${co.name}`);
      this.loadAll();
    });
  }

  addProject(): void {
    if (!this.selectedCompany) return;
    this.api.createProject({
      company_id: this.selectedCompany.id,
      name: this.newProject.name,
      daily_cap_hrs: this.newProject.daily_cap_hrs,
      weekly_cap_hrs: this.newProject.weekly_cap_hrs,
      billable: this.newProject.billable,
      color: this.newProject.color || undefined,
    }).subscribe(proj => {
      this.snack.show(`Created ${proj.name}`);
      this.newProject = { name: '', daily_cap_hrs: null, weekly_cap_hrs: null, billable: true, color: '' };
      this.loadAll();
    });
  }

  deleteProject(proj: Project): void {
    this.api.deleteProject(proj.id).subscribe(() => {
      this.snack.show(`Deleted ${proj.name}`);
      this.loadAll();
    });
  }

  addTask(): void {
    if (!this.selectedCompany || !this.selectedProject) return;
    this.api.createTask({
      company_id: this.selectedCompany.id,
      project_id: this.selectedProject.id,
      name: this.newTask.name,
      code: this.newTask.code || undefined,
      url: this.newTask.url || undefined,
    }).subscribe(task => {
      this.snack.show(`Created ${task.name}`);
      this.newTask = { name: '', code: '', url: '' };
      this.loadAll();
    });
  }

  deleteTask(task: Task): void {
    this.api.deleteTask(task.id).subscribe(() => {
      this.snack.show(`Deleted ${task.name}`);
      this.loadAll();
    });
  }

  deleteTimer(timer: Timer): void {
    this.api.deleteTimer(timer.id).subscribe(() => {
      this.snack.show(`Deleted ${timer.slug}`);
      if (this.selectedTask) this.selectTask(this.selectedTask);
    });
  }
}
