import { Component, HostListener, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { AuthService } from './services/auth.service';
import { SseService } from './services/sse.service';
import { ThemeService } from './services/theme.service';
import { PreferencesService } from './services/preferences.service';
import { NotificationsService } from './services/notifications.service';
import { APP_VERSION } from './version';
import { ChangelogDialogComponent } from './components/changelog-dialog';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatSlideToggleModule,
    MatDividerModule,
    MatDialogModule,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private platformId = inject(PLATFORM_ID);
  private dialog = inject(MatDialog);
  private sse = inject(SseService);
  private notifications = inject(NotificationsService);
  private router = inject(Router);
  theme = inject(ThemeService);
  prefs = inject(PreferencesService);
  notifyOnCap = signal(true);
  /** True when a view is popped out (?pop) — renders without the Time Tracker chrome. */
  detached = signal(false);
  version = APP_VERSION;

  constructor(private auth: AuthService) {}

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    const tag = (event.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (event.target as HTMLElement)?.isContentEditable) return;
    if (event.key === 'r' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      this.refresh();
    }
  }

  ngOnInit() {
    this.detached.set(this.isPopped(this.router.url));
    this.router.events.subscribe((e) => {
      if (e instanceof NavigationEnd) this.detached.set(this.isPopped(e.urlAfterRedirects));
    });
    if (isPlatformBrowser(this.platformId)) {
      this.auth.checkSession();
      this.theme.init();
      this.notifications.getSettings().subscribe((s) => {
        this.notifyOnCap.set(s.notify_on_cap !== false);
      });
    }
  }

  /** Popped-out windows carry ?pop and render bare (no toolbar/chrome). */
  private isPopped(url: string): boolean {
    return this.router.parseUrl(url).queryParamMap.has('pop');
  }

  toggleDarkMode() {
    this.theme.setMode(this.theme.isDark() ? 'light' : 'dark');
  }

  toggleCapNotifications() {
    const newValue = !this.notifyOnCap();
    this.notifyOnCap.set(newValue);
    this.notifications.updateSettings({ notify_on_cap: newValue }).subscribe();
  }

  refresh() {
    this.sse.refresh();
  }

  showChangelog() {
    this.dialog.open(ChangelogDialogComponent, {
      panelClass: 'changelog-panel',
      width: '600px',
      maxWidth: '90vw',
    });
  }
}
