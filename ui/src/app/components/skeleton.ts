import { Component, input } from '@angular/core';

@Component({
  selector: 'app-skeleton',
  template: `<span class="skeleton" [style.width]="width()" [style.height]="height()" [style.borderRadius]="radius()"></span>`,
  styles: [`
    :host { display: block; }
    .skeleton {
      display: block;
      background: var(--mat-sys-surface-container);
      background-image: linear-gradient(
        90deg,
        var(--mat-sys-surface-container) 0%,
        var(--mat-sys-surface-container-high) 50%,
        var(--mat-sys-surface-container) 100%
      );
      background-size: 200% 100%;
      animation: shimmer 1.5s ease-in-out infinite;
    }
    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `],
})
export class SkeletonComponent {
  width = input('100%');
  height = input('1rem');
  radius = input('4px');
}
