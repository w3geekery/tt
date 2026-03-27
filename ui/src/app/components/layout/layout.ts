import { Component, OnInit, OnDestroy, HostListener, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ThemeService } from '../../services/theme.service';
import { PreferencesService } from '../../services/preferences.service';
import { SseService } from '../../services/sse.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    RouterModule, MatToolbarModule, MatButtonModule, MatIconModule,
    MatSidenavModule, MatListModule, MatMenuModule, MatDividerModule, MatTooltipModule,
  ],
  template: `
    <mat-toolbar color="primary">
      <button mat-icon-button (click)="sidenav.toggle()">
        <mat-icon>menu</mat-icon>
      </button>
      <span class="brand">tt</span>
      <span class="spacer"></span>
      <button mat-icon-button matTooltip="Refresh (R)" (click)="refresh()">
        <mat-icon>refresh</mat-icon>
      </button>
      <button mat-icon-button [matMenuTriggerFor]="settingsMenu" matTooltip="Settings">
        <mat-icon>more_vert</mat-icon>
      </button>
      <mat-menu #settingsMenu="matMenu">
        <button mat-menu-item (click)="theme.toggle()">
          <mat-icon>{{ themeIcon }}</mat-icon>
          <span>Theme: {{ theme.mode() }}</span>
        </button>
        <button mat-menu-item (click)="prefs.toggleWeekends()">
          <mat-icon>{{ prefs.showWeekends() ? 'check_box' : 'check_box_outline_blank' }}</mat-icon>
          <span>Show weekends</span>
        </button>
        <mat-divider />
        <button mat-menu-item routerLink="/settings">
          <mat-icon>settings</mat-icon>
          <span>Config</span>
        </button>
      </mat-menu>
    </mat-toolbar>
    <mat-sidenav-container>
      <mat-sidenav #sidenav mode="side" opened>
        <mat-nav-list>
          <a mat-list-item routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}">
            <mat-icon matListItemIcon>timer</mat-icon>
            <span matListItemTitle>Today</span>
          </a>
          <a mat-list-item routerLink="/daily" routerLinkActive="active">
            <mat-icon matListItemIcon>today</mat-icon>
            <span matListItemTitle>Daily</span>
          </a>
          <a mat-list-item routerLink="/weekly" routerLinkActive="active">
            <mat-icon matListItemIcon>date_range</mat-icon>
            <span matListItemTitle>Weekly</span>
          </a>
          <a mat-list-item routerLink="/monthly" routerLinkActive="active">
            <mat-icon matListItemIcon>calendar_month</mat-icon>
            <span matListItemTitle>Monthly</span>
          </a>
          <mat-divider></mat-divider>
          <a mat-list-item routerLink="/settings" routerLinkActive="active">
            <mat-icon matListItemIcon>settings</mat-icon>
            <span matListItemTitle>Config</span>
          </a>
        </mat-nav-list>
      </mat-sidenav>
      <mat-sidenav-content>
        <div class="page-container">
          <router-outlet />
        </div>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: `
    .brand {
      font-weight: 700;
      font-size: 1.4rem;
      margin-left: 8px;
      letter-spacing: 1px;
    }
    .spacer { flex: 1; }
    mat-sidenav-container {
      height: calc(100vh - 64px);
    }
    mat-sidenav {
      width: 200px;
    }
    .active {
      font-weight: 600;
    }
  `,
})
export class LayoutComponent implements OnInit {
  theme = inject(ThemeService);
  prefs = inject(PreferencesService);
  private sse = inject(SseService);
  private router = inject(Router);

  get themeIcon(): string {
    const m = this.theme.mode();
    return m === 'dark' ? 'dark_mode' : m === 'light' ? 'light_mode' : 'brightness_auto';
  }

  ngOnInit(): void {
    this.theme.applyToDocument();
    this.sse.connect();
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    if (e.key === 'r' && !this.isEditing(e)) {
      e.preventDefault();
      this.refresh();
    }
  }

  refresh(): void {
    // Navigate to same URL to trigger reload
    const url = this.router.url;
    this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
      this.router.navigateByUrl(url);
    });
  }

  private isEditing(e: KeyboardEvent): boolean {
    const tag = (e.target as HTMLElement)?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }
}
