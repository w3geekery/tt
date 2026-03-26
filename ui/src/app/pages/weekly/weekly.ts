import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { ApiService } from '../../services/api.service';
import { DurationPipe } from '../../pipes/duration.pipe';
import { CapBarComponent } from '../../components/cap-bar/cap-bar';
import type { Timer, Company, Project, CapStatus } from '../../models/types';

interface WeekRow {
  companyName: string;
  projectName: string;
  totalMs: number;
  timerCount: number;
}

@Component({
  selector: 'app-weekly',
  standalone: true,
  imports: [CommonModule, MatTableModule, DurationPipe, CapBarComponent],
  template: `
    <h2>This Week</h2>

    @if (caps.length) {
      @for (cap of caps; track cap.project_id) {
        @if (cap.weekly) {
          <app-cap-bar
            [label]="cap.company_name + ' / ' + cap.project_name"
            [capHrs]="cap.weekly.cap_hrs"
            [usedHrs]="cap.weekly.used_hrs"
            [pct]="cap.weekly.pct"
          />
        }
      }
    }

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
    table { width: 100%; margin: 16px 0; }
    .total {
      font-size: 1.1rem;
      font-weight: 500;
      text-align: right;
      color: var(--mat-sys-primary);
    }
  `,
})
export class WeeklyComponent implements OnInit {
  private api = inject(ApiService);

  rows: WeekRow[] = [];
  caps: CapStatus[] = [];
  displayedColumns = ['company', 'project', 'hours', 'count'];

  get grandTotalMs(): number {
    return this.rows.reduce((sum, r) => sum + r.totalMs, 0);
  }

  ngOnInit(): void {
    this.api.getCapStatus().subscribe(list => this.caps = list);
    this.loadWeekData();
  }

  private loadWeekData(): void {
    const companyMap = new Map<string, string>();
    const projectMap = new Map<string, string>();

    this.api.getCompanies().subscribe(list => {
      list.forEach(c => companyMap.set(c.id, c.name));
      this.api.getProjects().subscribe(projects => {
        projects.forEach(p => projectMap.set(p.id, p.name));
        this.api.getTimers().subscribe(timers => {
          const weekStart = getWeekStart();
          const weekTimers = timers.filter(t => t.started && t.started >= weekStart);
          this.rows = this.aggregate(weekTimers, companyMap, projectMap);
        });
      });
    });
  }

  private aggregate(timers: Timer[], companyMap: Map<string, string>, projectMap: Map<string, string>): WeekRow[] {
    const groups = new Map<string, WeekRow>();
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

function getWeekStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
