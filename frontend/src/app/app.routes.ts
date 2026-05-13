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
      {
        path: 'dashboard',
        loadComponent: () =>
          import('@features/dashboard/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'music-profile',
        loadComponent: () =>
          import('@features/music-profile/music-profile').then((m) => m.MusicProfile),
      },
      {
        path: 'music-map',
        loadComponent: () => import('@features/music-map/music-map').then((m) => m.MusicMap),
      },
      {
        path: 'playlist-generator',
        loadComponent: () =>
          import('@features/playlist-generator/playlist-generator').then(
            (m) => m.PlaylistGenerator
          ),
      },
    ],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
