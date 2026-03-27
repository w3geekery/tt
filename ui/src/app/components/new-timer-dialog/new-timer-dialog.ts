import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { ApiService } from '../../services/api.service';
import { SnackbarService } from '../../services/snackbar.service';
import type { Company, Project, Task } from '../../models/types';

export interface NewTimerDialogData {
  companies: Company[];
  projects: Project[];
  tasks: Task[];
  defaultCompanyId?: string;
  defaultProjectId?: string;
}

export interface NewTimerDialogResult {
  company_id: string;
  project_id?: string;
  task_id?: string;
  notes?: string;
  scheduled?: boolean;
  start_at?: string;
}

@Component({
  selector: 'app-new-timer-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, MatCheckboxModule,
  ],
  template: `
    <h2 mat-dialog-title>New Timer</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline">
        <mat-label>Company</mat-label>
        <mat-select [(ngModel)]="form.company_id" (selectionChange)="onCompanyChange()">
          @for (co of data.companies; track co.id) {
            <mat-option [value]="co.id">{{ co.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <!-- Inline create company -->
      @if (showNewCompany) {
        <div class="inline-create">
          <mat-form-field appearance="outline">
            <mat-label>New company name</mat-label>
            <input matInput [(ngModel)]="inlineCompany.name">
          </mat-form-field>
          <button mat-raised-button color="primary" (click)="createCompany()" [disabled]="!inlineCompany.name">Create</button>
          <button mat-button (click)="showNewCompany = false">Cancel</button>
        </div>
      } @else {
        <button mat-button (click)="showNewCompany = true"><mat-icon>add</mat-icon> New Company</button>
      }

      <mat-form-field appearance="outline">
        <mat-label>Project</mat-label>
        <mat-select [(ngModel)]="form.project_id">
          <mat-option [value]="undefined">None</mat-option>
          @for (proj of filteredProjects; track proj.id) {
            <mat-option [value]="proj.id">{{ proj.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Task</mat-label>
        <mat-select [(ngModel)]="form.task_id">
          <mat-option [value]="undefined">None</mat-option>
          @for (task of filteredTasks; track task.id) {
            <mat-option [value]="task.id">{{ task.name }} {{ task.code ? '[' + task.code + ']' : '' }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Notes</mat-label>
        <textarea matInput [(ngModel)]="form.notes" rows="2"></textarea>
      </mat-form-field>

      <mat-checkbox [(ngModel)]="form.scheduled">Schedule for later</mat-checkbox>
      @if (form.scheduled) {
        <mat-form-field appearance="outline">
          <mat-label>Start at</mat-label>
          <input matInput type="datetime-local" [(ngModel)]="form.start_at">
        </mat-form-field>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-raised-button color="primary" (click)="submit()" [disabled]="!form.company_id">
        {{ form.scheduled ? 'Schedule' : 'Start Timer' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content {
      display: flex;
      flex-direction: column;
      min-width: 360px;
    }
    .inline-create {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      margin-bottom: 8px;
    }
    .inline-create mat-form-field { flex: 1; }
  `,
})
export class NewTimerDialogComponent {
  private api = inject(ApiService);
  private snack = inject(SnackbarService);
  private dialogRef = inject(MatDialogRef<NewTimerDialogComponent>);
  data = inject<NewTimerDialogData>(MAT_DIALOG_DATA);

  form: NewTimerDialogResult = {
    company_id: this.data.defaultCompanyId ?? '',
    project_id: this.data.defaultProjectId,
    notes: '',
    scheduled: false,
    start_at: '',
  };

  showNewCompany = false;
  inlineCompany = { name: '' };

  get filteredProjects(): Project[] {
    if (!this.form.company_id) return [];
    return this.data.projects.filter(p => p.company_id === this.form.company_id);
  }

  get filteredTasks(): Task[] {
    if (!this.form.project_id) return [];
    return this.data.tasks.filter(t => t.project_id === this.form.project_id);
  }

  onCompanyChange(): void {
    this.form.project_id = undefined;
    this.form.task_id = undefined;
  }

  createCompany(): void {
    this.api.createCompany({ name: this.inlineCompany.name }).subscribe(co => {
      this.data.companies = [...this.data.companies, co];
      this.form.company_id = co.id;
      this.showNewCompany = false;
      this.inlineCompany = { name: '' };
      this.snack.show(`Created ${co.name}`);
    });
  }

  submit(): void {
    this.dialogRef.close(this.form);
  }
}
