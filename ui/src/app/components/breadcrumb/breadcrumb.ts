import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

export interface Crumb {
  label: string;
  link?: string;
}

@Component({
  selector: 'app-breadcrumb',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <nav class="breadcrumb" aria-label="Breadcrumb">
      @for (crumb of crumbs; track crumb.label; let last = $last) {
        @if (crumb.link && !last) {
          <a [routerLink]="crumb.link">{{ crumb.label }}</a>
        } @else {
          <span [class.current]="last">{{ crumb.label }}</span>
        }
        @if (!last) {
          <span class="sep">/</span>
        }
      }
    </nav>
  `,
  styles: `
    .breadcrumb {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 0.85rem;
      margin-bottom: 12px;
      color: var(--mat-sys-on-surface-variant);
    }
    a {
      color: var(--mat-sys-primary);
      text-decoration: none;
      &:hover { text-decoration: underline; }
    }
    .sep { opacity: 0.5; }
    .current { font-weight: 500; color: var(--mat-sys-on-surface); }
  `,
})
export class BreadcrumbComponent {
  @Input() crumbs: Crumb[] = [];
}
