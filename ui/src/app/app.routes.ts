import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home').then((m) => m.HomeComponent),
    pathMatch: 'full',
  },
  {
    path: 'today',
    loadComponent: () => import('./pages/daily/daily').then((m) => m.DailyComponent),
  },
  {
    path: 'today/:date',
    loadComponent: () => import('./pages/daily/daily').then((m) => m.DailyComponent),
  },
  {
    path: 'weekly',
    loadComponent: () => import('./pages/weekly/weekly').then((m) => m.WeeklyComponent),
  },
  {
    path: 'weekly/:date',
    loadComponent: () => import('./pages/weekly/weekly').then((m) => m.WeeklyComponent),
  },
  {
    path: 'monthly',
    loadComponent: () => import('./pages/monthly/monthly').then((m) => m.MonthlyComponent),
  },
  {
    path: 'monthly/:year/:month',
    loadComponent: () => import('./pages/monthly/monthly').then((m) => m.MonthlyComponent),
  },
  {
    path: 'config',
    loadComponent: () => import('./pages/config/config').then((m) => m.ConfigComponent),
  },
  // Redirects for old routes
  { path: 'daily', redirectTo: 'today', pathMatch: 'full' },
  { path: 'daily/:date', redirectTo: 'today/:date' },
];
