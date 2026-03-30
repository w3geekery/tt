import { Component, Inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Company, Project, Task } from '../../models';
import { ApiService } from '../../services/api.service';
import { firstValueFrom } from 'rxjs';

const NEW_COMPANY = '__new_company__';
const NEW_PROJECT = '__new_project__';
const NEW_TASK = '__new_task__';

export interface NewTimerDialogData {
  companies: Company[];
  projects: Project[];
  tasks: Task[];
}

@Component({
  selector: 'app-new-timer-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
  ],
  template: `
    <h2 mat-dialog-title>New Timer</h2>
    <mat-dialog-content>
      <!-- Company select or inline create -->
      @if (creatingCompany()) {
        <div class="inline-create">
          <mat-form-field class="dialog-field">
            <mat-label>New Company Name</mat-label>
            <input matInput [(ngModel)]="newCompanyName" />
          </mat-form-field>
          <div class="inline-actions">
            <button mat-button (click)="cancelCreateCompany()">Cancel</button>
            <button mat-raised-button color="primary" [disabled]="!newCompanyName.trim()" (click)="saveNewCompany()">Add</button>
          </div>
        </div>
      } @else {
        <mat-form-field class="dialog-field">
          <mat-label>Company</mat-label>
          <mat-select [ngModel]="companyId()" (ngModelChange)="onCompanyChange($event)" required>
            @for (company of data.companies; track company.id) {
              <mat-option [value]="company.id">{{ company.name }}</mat-option>
            }
            <mat-option [value]="NEW_COMPANY" class="add-new-option">
              <mat-icon>add</mat-icon> New Company
            </mat-option>
          </mat-select>
        </mat-form-field>
      }

      <!-- Project select or inline create -->
      @if (creatingProject()) {
        <div class="inline-create">
          <mat-form-field class="dialog-field">
            <mat-label>New Project Name</mat-label>
            <input matInput [(ngModel)]="newProjectName" />
          </mat-form-field>
          <div class="inline-actions">
            <button mat-button (click)="cancelCreateProject()">Cancel</button>
            <button mat-raised-button color="primary" [disabled]="!newProjectName.trim() || !companyId()" (click)="saveNewProject()">Add</button>
          </div>
        </div>
      } @else {
        <mat-form-field class="dialog-field">
          <mat-label>Project</mat-label>
          <mat-select [ngModel]="projectId()" (ngModelChange)="onProjectChange($event)">
            <mat-option [value]="null">None</mat-option>
            @for (project of filteredProjects(); track project.id) {
              <mat-option [value]="project.id">{{ project.name }}</mat-option>
            }
            @if (companyId()) {
              <mat-option [value]="NEW_PROJECT" class="add-new-option">
                <mat-icon>add</mat-icon> New Project
              </mat-option>
            }
          </mat-select>
        </mat-form-field>
      }

      <!-- Task select or inline create -->
      @if (creatingTask()) {
        <div class="inline-create">
          <mat-form-field class="dialog-field">
            <mat-label>New Task Name</mat-label>
            <input matInput [(ngModel)]="newTaskName" />
          </mat-form-field>
          <div class="inline-actions">
            <button mat-button (click)="cancelCreateTask()">Cancel</button>
            <button mat-raised-button color="primary" [disabled]="!newTaskName.trim() || !projectId()" (click)="saveNewTask()">Add</button>
          </div>
        </div>
      } @else {
        <mat-form-field class="dialog-field">
          <mat-label>Task</mat-label>
          <mat-select [ngModel]="taskId" (ngModelChange)="onTaskChange($event)">
            <mat-option [value]="null">None</mat-option>
            @for (task of filteredTasks(); track task.id) {
              <mat-option [value]="task.id">{{ task.name }}</mat-option>
            }
            @if (projectId()) {
              <mat-option [value]="NEW_TASK" class="add-new-option">
                <mat-icon>add</mat-icon> New Task
              </mat-option>
            }
          </mat-select>
        </mat-form-field>
      }

      <mat-form-field class="dialog-field">
        <mat-label>Notes</mat-label>
        <textarea matInput [(ngModel)]="notes" rows="2"></textarea>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-raised-button color="primary" [disabled]="!companyId() || saving()" (click)="start()">
        Start Timer
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-field { width: 100%; margin-bottom: 8px; }
    .inline-create {
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 8px;
    }
    .inline-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .add-new-option { color: var(--mat-sys-primary); }
  `],
})
export class NewTimerDialogComponent {
  protected readonly NEW_COMPANY = NEW_COMPANY;
  protected readonly NEW_PROJECT = NEW_PROJECT;
  protected readonly NEW_TASK = NEW_TASK;

  companyId = signal<string>('');
  projectId = signal<string | null>(null);
  taskId: string | null = null;
  notes = '';

  creatingCompany = signal(false);
  creatingProject = signal(false);
  creatingTask = signal(false);
  saving = signal(false);

  newCompanyName = '';
  newProjectName = '';
  newTaskName = '';

  filteredProjects = computed(() => {
    const cid = this.companyId();
    return cid ? this.data.projects.filter((p) => p.company_id === cid) : this.data.projects;
  });

  filteredTasks = computed(() => {
    const pid = this.projectId();
    return pid ? this.data.tasks.filter((t) => t.project_id === pid) : [];
  });

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: NewTimerDialogData,
    private ref: MatDialogRef<NewTimerDialogComponent>,
    private api: ApiService,
  ) {}

  onCompanyChange(id: string) {
    if (id === NEW_COMPANY) {
      this.creatingCompany.set(true);
      this.newCompanyName = '';
      return;
    }
    this.companyId.set(id);
    this.projectId.set(null);
    this.taskId = null;
  }

  onProjectChange(id: string | null) {
    if (id === NEW_PROJECT) {
      this.creatingProject.set(true);
      this.newProjectName = '';
      return;
    }
    this.projectId.set(id);
    this.taskId = null;
    if (id) {
      const project = this.data.projects.find((p) => p.id === id);
      if (project) this.companyId.set(project.company_id);
    }
  }

  onTaskChange(id: string | null) {
    if (id === NEW_TASK) {
      this.creatingTask.set(true);
      this.newTaskName = '';
      return;
    }
    this.taskId = id;
  }

  cancelCreateCompany() {
    this.creatingCompany.set(false);
  }

  cancelCreateProject() {
    this.creatingProject.set(false);
  }

  cancelCreateTask() {
    this.creatingTask.set(false);
  }

  async saveNewCompany() {
    this.saving.set(true);
    try {
      const company = await firstValueFrom(this.api.createCompany({ name: this.newCompanyName.trim() }));
      this.data.companies.push(company);
      this.companyId.set(company.id);
      this.creatingCompany.set(false);
      this.projectId.set(null);
      this.taskId = null;
    } finally {
      this.saving.set(false);
    }
  }

  async saveNewProject() {
    this.saving.set(true);
    try {
      const project = await firstValueFrom(
        this.api.createProject({ name: this.newProjectName.trim(), company_id: this.companyId() }),
      );
      this.data.projects.push(project);
      this.projectId.set(project.id);
      this.creatingProject.set(false);
      this.taskId = null;
    } finally {
      this.saving.set(false);
    }
  }

  async saveNewTask() {
    this.saving.set(true);
    try {
      const task = await firstValueFrom(
        this.api.createTask({ name: this.newTaskName.trim(), project_id: this.projectId()! }),
      );
      this.data.tasks.push(task);
      this.taskId = task.id;
      this.creatingTask.set(false);
    } finally {
      this.saving.set(false);
    }
  }

  start() {
    this.ref.close({
      company_id: this.companyId(),
      project_id: this.projectId(),
      task_id: this.taskId,
      notes: this.notes || null,
    });
  }
}
