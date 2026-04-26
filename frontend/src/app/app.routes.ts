import { Routes } from '@angular/router';
import { authGuard } from '@core/guards/auth.guard';
import { guestGuard } from '@core/guards/guest.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('@features/login/login').then((m) => m.Login),
  },
  {
    path: '',
    loadComponent: () =>
      import('@core/layout/app-shell/app-shell').then((m) => m.AppShellComponent),
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard',
      },
      // {
      //   path: 'dashboard',
      //   loadComponent: () =>
      //     import('@features/dashboard/dashboard').then((m) => m.Dashboard),
      // },
      // {
      //   path: 'top-tracks',
      //   loadComponent: () =>
      //     import('@features/top-tracks/top-tracks').then((m) => m.TopTracks),
      // },
      // {
      //   path: 'profile',
      //   loadComponent: () =>
      //     import('@features/profile/profile').then((m) => m.Profile),
      // },
    ],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
