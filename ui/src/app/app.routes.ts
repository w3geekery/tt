import { Routes } from '@angular/router';
import { LayoutComponent } from './components/layout/layout';

export const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    children: [
      { path: '', loadComponent: () => import('./pages/home/home').then(m => m.HomeComponent) },
      { path: 'daily', loadComponent: () => import('./pages/daily/daily').then(m => m.DailyComponent) },
      { path: 'weekly', loadComponent: () => import('./pages/weekly/weekly').then(m => m.WeeklyComponent) },
      { path: 'monthly', loadComponent: () => import('./pages/monthly/monthly').then(m => m.MonthlyComponent) },
      { path: 'settings', loadComponent: () => import('./pages/settings/settings').then(m => m.SettingsComponent) },
    ],
  },
];
