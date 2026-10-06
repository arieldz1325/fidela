import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'editor', pathMatch: 'full' },
  { path: 'editor', loadComponent: () => import('./editor/editor-page').then(m => m.EditorPage) },
  { path: 'review', loadComponent: () => import('./review-page/review-page').then(m => m.ReviewPage) },
];
