import { Component, Inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { Company, Project, Task } from '../../models';

export interface TaskDialogData {
  mode: 'create' | 'edit';
  task?: Task;
  companies: Company[];
  projects: Project[];
}

@Component({
  selector: 'app-task-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.mode === 'create' ? 'Add Task' : 'Edit Task' }}</h2>
    <mat-dialog-content>
      <mat-form-field class="dialog-field">
        <mat-label>Company</mat-label>
        <mat-select [ngModel]="selectedCompanyId()" (ngModelChange)="selectedCompanyId.set($event)">
          @for (company of data.companies; track company.id) {
            <mat-option [value]="company.id">{{ company.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field class="dialog-field">
        <mat-label>Project</mat-label>
        <mat-select [(ngModel)]="projectId" (ngModelChange)="onProjectChange($event)" required>
          @for (project of filteredProjects(); track project.id) {
            <mat-option [value]="project.id">{{ project.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field class="dialog-field">
        <mat-label>Name</mat-label>
        <input matInput [(ngModel)]="name" required />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button
        mat-raised-button
        color="primary"
        [disabled]="!name || !projectId"
        (click)="save()"
      >
        {{ data.mode === 'create' ? 'Create' : 'Save' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: ['.dialog-field { width: 100%; margin-bottom: 8px; }'],
})
export class TaskDialogComponent {
  selectedCompanyId = signal<string>('');
  projectId: string;
  name: string;

  filteredProjects = computed(() => {
    const cid = this.selectedCompanyId();
    return cid ? this.data.projects.filter((p) => p.company_id === cid) : this.data.projects;
  });

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: TaskDialogData,
    private ref: MatDialogRef<TaskDialogComponent>,
  ) {
    this.projectId = data.task?.project_id ?? '';
    this.name = data.task?.name ?? '';

    // Set initial company from existing task's project
    if (data.task) {
      const project = data.projects.find((p) => p.id === data.task!.project_id);
      if (project) this.selectedCompanyId.set(project.company_id);
    }
  }

  onProjectChange(projectId: string) {
    const project = this.data.projects.find((p) => p.id === projectId);
    if (project) {
      this.selectedCompanyId.set(project.company_id);
    }
  }

  save() {
    this.ref.close({
      project_id: this.projectId,
      name: this.name,
    });
  }
}
