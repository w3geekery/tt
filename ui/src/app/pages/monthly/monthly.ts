import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../services/api.service';
import { DurationPipe } from '../../pipes/duration.pipe';
import type { Timer } from '../../models/types';

interface MonthRow {
  companyName: string;
  projectName: string;
  totalMs: number;
  timerCount: number;
}

@Component({
  selector: 'app-monthly',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatButtonModule, MatIconModule, DurationPipe],
  template: `
    <div class="header">
      <button mat-icon-button (click)="prevMonth()"><mat-icon>chevron_left</mat-icon></button>
      <h2>{{ monthLabel }}</h2>
      <button mat-icon-button (click)="nextMonth()"><mat-icon>chevron_right</mat-icon></button>
    </div>

    <table mat-table [dataSource]="rows">
      <ng-container matColumnDef="company">
        <th mat-header-cell *matHeaderCellDef>Company</th>
        <td mat-cell *matCellDef="let row">{{ row.companyName }}</td>
      </ng-container>
      <ng-container matColumnDef="project">
        <th mat-header-cell *matHeaderCellDef>Project</th>
        <td mat-cell *matCellDef="let row">{{ row.projectName }}</td>
      </ng-container>
      <ng-container matColumnDef="hours">
        <th mat-header-cell *matHeaderCellDef>Hours</th>
        <td mat-cell *matCellDef="let row">{{ row.totalMs | duration:'decimal' }}</td>
      </ng-container>
      <ng-container matColumnDef="count">
        <th mat-header-cell *matHeaderCellDef>Timers</th>
        <td mat-cell *matCellDef="let row">{{ row.timerCount }}</td>
      </ng-container>

      <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
      <tr mat-row *matRowDef="let row; columns: displayedColumns"></tr>
    </table>

    <div class="total">
      Total: {{ grandTotalMs | duration:'decimal' }}
    </div>
  `,
  styles: `
    .header { display: flex; align-items: center; gap: 8px; }
    h2 { margin: 0; min-width: 180px; text-align: center; }
    table { width: 100%; margin: 16px 0; }
    .total {
      font-size: 1.1rem;
      font-weight: 500;
      text-align: right;
      color: var(--mat-sys-primary);
    }
  `,
})
export class MonthlyComponent implements OnInit {
  private api = inject(ApiService);

  year = new Date().getFullYear();
  month = new Date().getMonth(); // 0-indexed
  rows: MonthRow[] = [];
  displayedColumns = ['company', 'project', 'hours', 'count'];

  get monthLabel(): string {
    return new Date(this.year, this.month).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  }

  get grandTotalMs(): number {
    return this.rows.reduce((sum, r) => sum + r.totalMs, 0);
  }

  ngOnInit(): void { this.loadData(); }

  prevMonth(): void {
    this.month--;
    if (this.month < 0) { this.month = 11; this.year--; }
    this.loadData();
  }

  nextMonth(): void {
    this.month++;
    if (this.month > 11) { this.month = 0; this.year++; }
    this.loadData();
  }

  private loadData(): void {
    const companyMap = new Map<string, string>();
    const projectMap = new Map<string, string>();
    const monthStr = `${this.year}-${String(this.month + 1).padStart(2, '0')}`;

    this.api.getCompanies().subscribe(list => {
      list.forEach(c => companyMap.set(c.id, c.name));
      this.api.getProjects().subscribe(projects => {
        projects.forEach(p => projectMap.set(p.id, p.name));
        this.api.getTimers().subscribe(timers => {
          const monthTimers = timers.filter(t => t.started?.startsWith(monthStr));
          this.rows = this.aggregate(monthTimers, companyMap, projectMap);
        });
      });
    });
  }

  private aggregate(timers: Timer[], companyMap: Map<string, string>, projectMap: Map<string, string>): MonthRow[] {
    const groups = new Map<string, MonthRow>();
    for (const t of timers) {
      const key = `${t.company_id}|${t.project_id ?? ''}`;
      const existing = groups.get(key);
      if (existing) {
        existing.totalMs += t.duration_ms ?? 0;
        existing.timerCount++;
      } else {
        groups.set(key, {
          companyName: companyMap.get(t.company_id) ?? '—',
          projectName: t.project_id ? (projectMap.get(t.project_id) ?? '—') : '—',
          totalMs: t.duration_ms ?? 0,
          timerCount: 1,
        });
      }
    }
    return [...groups.values()].sort((a, b) => b.totalMs - a.totalMs);
  }
}
