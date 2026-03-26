import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressBarModule } from '@angular/material/progress-bar';

@Component({
  selector: 'app-cap-bar',
  standalone: true,
  imports: [CommonModule, MatProgressBarModule],
  template: `
    <div class="cap-bar">
      <div class="cap-label">
        <span>{{ label }}</span>
        <span>{{ usedHrs | number:'1.1-1' }} / {{ capHrs }}h ({{ pct }}%)</span>
      </div>
      <mat-progress-bar
        [mode]="'determinate'"
        [value]="pct"
        [color]="pct >= 100 ? 'warn' : pct >= 80 ? 'accent' : 'primary'"
      />
    </div>
  `,
  styles: `
    .cap-bar { margin: 8px 0; }
    .cap-label {
      display: flex;
      justify-content: space-between;
      font-size: 0.85rem;
      margin-bottom: 4px;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class CapBarComponent {
  @Input() label = '';
  @Input() capHrs = 0;
  @Input() usedHrs = 0;
  @Input() pct = 0;
}
