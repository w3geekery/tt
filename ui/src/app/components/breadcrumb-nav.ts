import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

export interface BreadcrumbItem {
  label: string;
  url: string | null;
}

@Component({
  selector: 'app-breadcrumb-nav',
  imports: [RouterLink, MatIconModule],
  template: `
    <nav class="breadcrumb-nav" aria-label="Navigation">
      @for (item of items(); track item.label) {
        @if (item.url) {
          <a [routerLink]="item.url" class="breadcrumb-link">{{ item.label }}</a>
        } @else {
          <span class="breadcrumb-current" aria-current="page">{{ item.label }}</span>
        }
        @if (!$last) {
          <mat-icon class="breadcrumb-sep">chevron_right</mat-icon>
        }
      }
    </nav>
  `,
  styles: `
    .breadcrumb-nav {
      display: flex;
      align-items: center;
      gap: 2px;
      margin-bottom: 8px;
      font-size: 0.85rem;
    }

    .breadcrumb-link {
      color: var(--mat-sys-primary);
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }

    .breadcrumb-sep {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: var(--mat-sys-on-surface-variant);
    }

    .breadcrumb-current {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class BreadcrumbNavComponent {
  items = input.required<BreadcrumbItem[]>();
}
