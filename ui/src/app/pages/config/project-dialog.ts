import { Component, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { ColorPickerComponent } from '../../components/color-picker';
import { Company, Project, Task } from '../../models';

export interface ProjectDialogData {
  mode: 'create' | 'edit';
  project?: Project;
  companies: Company[];
  projects: Project[];
  tasks: Task[];
}

@Component({
  selector: 'app-project-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatButtonModule,
    ColorPickerComponent,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.mode === 'create' ? 'Add Project' : 'Edit Project' }}</h2>
    <mat-dialog-content>
      <mat-form-field class="dialog-field">
        <mat-label>Company</mat-label>
        <mat-select [(ngModel)]="companyId" required>
          @for (company of data.companies; track company.id) {
            <mat-option [value]="company.id">{{ company.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field class="dialog-field">
        <mat-label>Name</mat-label>
        <input matInput [(ngModel)]="name" required />
      </mat-form-field>
      <label class="color-label">Color</label>
      <app-color-picker [(ngModel)]="color" />
      <div style="display: flex; gap: 8px;">
        <mat-form-field class="dialog-field" style="flex: 1;">
          <mat-label>Daily Cap (hrs)</mat-label>
          <input matInput type="number" [(ngModel)]="dailyCap" placeholder="e.g. 4" />
        </mat-form-field>
        <mat-form-field class="dialog-field" style="flex: 1;">
          <mat-label>Weekly Cap (hrs)</mat-label>
          <input matInput type="number" [(ngModel)]="weeklyCap" placeholder="e.g. 20" />
        </mat-form-field>
      </div>
      <mat-checkbox [(ngModel)]="billable">Billable</mat-checkbox>
      <!-- Overflow -->
      <div style="margin-top: 8px; padding: 8px; border: 1px solid var(--mat-sys-outline-variant); border-radius: 8px;">
        <label class="color-label" style="text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500;">Cap Overflow To</label>
        <mat-form-field class="dialog-field">
          <mat-label>Company</mat-label>
          <mat-select [(ngModel)]="overflowCompanyId" (ngModelChange)="overflowProjectId = null; overflowTaskId = null">
            <mat-option [value]="null">None</mat-option>
            @for (c of data.companies; track c.id) {
              <mat-option [value]="c.id">{{ c.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        @if (overflowCompanyId) {
          <mat-form-field class="dialog-field">
            <mat-label>Project</mat-label>
            <mat-select [(ngModel)]="overflowProjectId" (ngModelChange)="overflowTaskId = null">
              <mat-option [value]="null">None</mat-option>
              @for (p of overflowProjects(); track p.id) {
                <mat-option [value]="p.id">{{ p.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
        @if (overflowProjectId) {
          <mat-form-field class="dialog-field">
            <mat-label>Task</mat-label>
            <mat-select [(ngModel)]="overflowTaskId">
              <mat-option [value]="null">None</mat-option>
              @for (t of overflowTasks(); track t.id) {
                <mat-option [value]="t.id">{{ t.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button
        mat-raised-button
        color="primary"
        [disabled]="!name || !companyId"
        (click)="save()"
      >
        {{ data.mode === 'create' ? 'Create' : 'Save' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    '.dialog-field { width: 100%; margin-bottom: 8px; }',
    '.color-label { font-size: 12px; color: var(--mat-sys-on-surface-variant); display: block; margin-bottom: 4px; }',
  ],
})
export class ProjectDialogComponent {
  companyId: string;
  name: string;
  color: string;
  dailyCap: number | null;
  weeklyCap: number | null;
  billable: boolean;
  overflowCompanyId: string | null;
  overflowProjectId: string | null;
  overflowTaskId: string | null;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: ProjectDialogData,
    private ref: MatDialogRef<ProjectDialogComponent>,
  ) {
    this.companyId = data.project?.company_id ?? '';
    this.name = data.project?.name ?? '';
    this.color = data.project?.color ?? '';
    this.dailyCap = data.project?.daily_cap_hrs ?? null;
    this.weeklyCap = data.project?.weekly_cap_hrs ?? null;
    this.billable = data.project?.billable ?? true;
    this.overflowCompanyId = data.project?.overflow_company_id ?? null;
    this.overflowProjectId = data.project?.overflow_project_id ?? null;
    this.overflowTaskId = data.project?.overflow_task_id ?? null;
  }

  overflowProjects(): Project[] {
    if (!this.overflowCompanyId) return [];
    return this.data.projects.filter((p) => p.company_id === this.overflowCompanyId);
  }

  overflowTasks(): Task[] {
    if (!this.overflowProjectId) return [];
    return this.data.tasks.filter((t) => t.project_id === this.overflowProjectId);
  }

  save() {
    this.ref.close({
      company_id: this.companyId,
      name: this.name,
      color: this.color || null,
      daily_cap_hrs: this.dailyCap,
      weekly_cap_hrs: this.weeklyCap,
      billable: this.billable,
      overflow_company_id: this.overflowCompanyId,
      overflow_project_id: this.overflowProjectId,
      overflow_task_id: this.overflowTaskId,
    });
  }
}
