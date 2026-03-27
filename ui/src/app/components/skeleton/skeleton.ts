import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="skeleton" [style.width]="width" [style.height]="height" [style.borderRadius]="radius"></div>
  `,
  styles: `
    .skeleton {
      background: linear-gradient(90deg,
        var(--mat-sys-surface-variant) 25%,
        var(--mat-sys-surface) 50%,
        var(--mat-sys-surface-variant) 75%
      );
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
    }
    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `,
})
export class SkeletonComponent {
  @Input() width = '100%';
  @Input() height = '20px';
  @Input() radius = '4px';
}

@Component({
  selector: 'app-skeleton-card',
  standalone: true,
  imports: [CommonModule, SkeletonComponent],
  template: `
    <div class="skeleton-card">
      <app-skeleton width="40%" height="16px" />
      <app-skeleton width="60%" height="12px" />
      <app-skeleton width="30%" height="32px" radius="8px" />
      <app-skeleton width="80%" height="12px" />
    </div>
  `,
  styles: `
    .skeleton-card {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 16px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 12px;
      margin-bottom: 12px;
    }
  `,
})
export class SkeletonCardComponent {}
