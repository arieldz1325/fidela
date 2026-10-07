import { Routes } from '@angular/router';
import { redirectSignedIn, requireRole } from './core/auth.guards';

export const routes: Routes = [
  // Public
  { path: '', title: 'Fidela Translations — Certified translations in Canada', loadComponent: () => import('./pages/home/home-page').then(m => m.HomePage) },
  { path: 'track', title: 'Track your order · Fidela Translations', loadComponent: () => import('./pages/track/track-page').then(m => m.TrackPage) },
  { path: 'login', title: 'Sign in · Fidela Translations', canActivate: [redirectSignedIn], loadComponent: () => import('./pages/login/login-page').then(m => m.LoginPage) },
  { path: 'forgot-password', title: 'Reset your password · Fidela Translations', loadComponent: () => import('./pages/password/forgot-password-page').then(m => m.ForgotPasswordPage) },
  { path: 'reset-password', title: 'Choose a password · Fidela Translations', loadComponent: () => import('./pages/password/reset-password-page').then(m => m.ResetPasswordPage) },

  // Certified translators and managers
  {
    path: 'dashboard',
    title: 'Dashboard · Fidela Translations',
    canActivate: [requireRole('translator', 'manager')],
    loadComponent: () => import('./pages/dashboard/dashboard-page').then(m => m.DashboardPage),
  },
  {
    path: 'editor/:id',
    title: 'Review · Fidela Translations',
    canActivate: [requireRole('translator', 'manager')],
    loadComponent: () => import('./editor/editor-page').then(m => m.EditorPage),
  },
  // Local demo documents produced by gem_json.py (fiel/public/demo)
  {
    path: 'editor',
    title: 'Demo editor · Fidela Translations',
    canActivate: [requireRole('translator', 'manager')],
    loadComponent: () => import('./editor/editor-page').then(m => m.EditorPage),
  },
  {
    path: 'review',
    canActivate: [requireRole('translator', 'manager')],
    loadComponent: () => import('./review-page/review-page').then(m => m.ReviewPage),
  },

  { path: '**', redirectTo: '' },
];
