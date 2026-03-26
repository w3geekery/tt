import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatListModule } from '@angular/material/list';
import { MatDialogModule } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import type { Company, Project, Task } from '../../models/types';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule, MatCardModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule,
    MatDividerModule, MatListModule, MatDialogModule, FormsModule,
  ],
  template: `
    <h2>Settings</h2>

    <!-- Companies -->
    <mat-card>
      <mat-card-header><mat-card-title>Companies</mat-card-title></mat-card-header>
      <mat-card-content>
        <mat-list>
          @for (co of companies; track co.id) {
            <mat-list-item>
              @if (co.color) {
                <span class="color-dot" [style.background]="co.color"></span>
              }
              {{ co.name }} {{ co.initials ? '(' + co.initials + ')' : '' }}
              <button mat-icon-button (click)="deleteCompany(co)"><mat-icon>delete</mat-icon></button>
            </mat-list-item>
          }
        </mat-list>
        <div class="add-form">
          <mat-form-field appearance="outline">
            <mat-label>Name</mat-label>
            <input matInput [(ngModel)]="newCompany.name">
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Initials</mat-label>
            <input matInput [(ngModel)]="newCompany.initials">
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Color</mat-label>
            <input matInput [(ngModel)]="newCompany.color" placeholder="#ff0000">
          </mat-form-field>
          <button mat-raised-button color="primary" (click)="addCompany()" [disabled]="!newCompany.name">Add</button>
        </div>
      </mat-card-content>
    </mat-card>

    <!-- Projects -->
    <mat-card>
      <mat-card-header><mat-card-title>Projects</mat-card-title></mat-card-header>
      <mat-card-content>
        <mat-list>
          @for (proj of projects; track proj.id) {
            <mat-list-item>
              {{ getCompanyName(proj.company_id) }} / {{ proj.name }}
              @if (proj.daily_cap_hrs) { <span class="chip">{{ proj.daily_cap_hrs }}h/day</span> }
              @if (proj.weekly_cap_hrs) { <span class="chip">{{ proj.weekly_cap_hrs }}h/week</span> }
              @if (!proj.billable) { <span class="chip muted">non-billable</span> }
              <button mat-icon-button (click)="deleteProject(proj)"><mat-icon>delete</mat-icon></button>
            </mat-list-item>
          }
        </mat-list>
        <div class="add-form">
          <mat-form-field appearance="outline">
            <mat-label>Company</mat-label>
            <mat-select [(ngModel)]="newProject.company_id">
              @for (co of companies; track co.id) {
                <mat-option [value]="co.id">{{ co.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Name</mat-label>
            <input matInput [(ngModel)]="newProject.name">
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Daily cap (hrs)</mat-label>
            <input matInput type="number" [(ngModel)]="newProject.daily_cap_hrs">
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Weekly cap (hrs)</mat-label>
            <input matInput type="number" [(ngModel)]="newProject.weekly_cap_hrs">
          </mat-form-field>
          <button mat-raised-button color="primary" (click)="addProject()" [disabled]="!newProject.company_id || !newProject.name">Add</button>
        </div>
      </mat-card-content>
    </mat-card>

    <!-- Tasks -->
    <mat-card>
      <mat-card-header><mat-card-title>Tasks</mat-card-title></mat-card-header>
      <mat-card-content>
        <mat-list>
          @for (task of tasks; track task.id) {
            <mat-list-item>
              {{ task.name }} {{ task.code ? '[' + task.code + ']' : '' }}
              <button mat-icon-button (click)="deleteTask(task)"><mat-icon>delete</mat-icon></button>
            </mat-list-item>
          }
        </mat-list>
        <div class="add-form">
          <mat-form-field appearance="outline">
            <mat-label>Company</mat-label>
            <mat-select [(ngModel)]="newTask.company_id">
              @for (co of companies; track co.id) {
                <mat-option [value]="co.id">{{ co.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Name</mat-label>
            <input matInput [(ngModel)]="newTask.name">
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Code</mat-label>
            <input matInput [(ngModel)]="newTask.code" placeholder="JIRA-123">
          </mat-form-field>
          <button mat-raised-button color="primary" (click)="addTask()" [disabled]="!newTask.company_id || !newTask.name">Add</button>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    mat-card { margin-bottom: 16px; }
    .add-form {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      flex-wrap: wrap;
      margin-top: 8px;
    }
    .add-form mat-form-field { flex: 1; min-width: 140px; }
    .color-dot {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      margin-right: 8px;
    }
    .chip {
      font-size: 0.75rem;
      padding: 2px 8px;
      margin-left: 8px;
      border-radius: 12px;
      background: var(--mat-sys-surface-variant);
      color: var(--mat-sys-on-surface-variant);
    }
    .muted { opacity: 0.6; }
  `,
})
export class SettingsComponent implements OnInit {
  private api = inject(ApiService);

  companies: Company[] = [];
  projects: Project[] = [];
  tasks: Task[] = [];

  newCompany = { name: '', initials: '', color: '' };
  newProject = { company_id: '', name: '', daily_cap_hrs: null as number | null, weekly_cap_hrs: null as number | null };
  newTask = { company_id: '', name: '', code: '' };

  ngOnInit(): void { this.loadAll(); }

  getCompanyName(id: string): string {
    return this.companies.find(c => c.id === id)?.name ?? '—';
  }

  private loadAll(): void {
    this.api.getCompanies().subscribe(list => this.companies = list);
    this.api.getProjects().subscribe(list => this.projects = list);
    this.api.getTasks().subscribe(list => this.tasks = list);
  }

  addCompany(): void {
    this.api.createCompany(this.newCompany).subscribe(() => {
      this.newCompany = { name: '', initials: '', color: '' };
      this.loadAll();
    });
  }

  deleteCompany(co: Company): void {
    this.api.deleteCompany(co.id).subscribe(() => this.loadAll());
  }

  addProject(): void {
    this.api.createProject(this.newProject).subscribe(() => {
      this.newProject = { company_id: '', name: '', daily_cap_hrs: null, weekly_cap_hrs: null };
      this.loadAll();
    });
  }

  deleteProject(proj: Project): void {
    this.api.deleteProject(proj.id).subscribe(() => this.loadAll());
  }

  addTask(): void {
    this.api.createTask({ ...this.newTask, code: this.newTask.code || undefined }).subscribe(() => {
      this.newTask = { company_id: '', name: '', code: '' };
      this.loadAll();
    });
  }

  deleteTask(task: Task): void {
    this.api.deleteTask(task.id).subscribe(() => this.loadAll());
  }
}
