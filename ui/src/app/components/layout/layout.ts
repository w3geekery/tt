import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterModule, MatToolbarModule, MatButtonModule, MatIconModule, MatSidenavModule, MatListModule],
  template: `
    <mat-toolbar color="primary">
      <button mat-icon-button (click)="sidenav.toggle()">
        <mat-icon>menu</mat-icon>
      </button>
      <span class="brand">tt</span>
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
            <span matListItemTitle>Settings</span>
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
export class LayoutComponent {}
