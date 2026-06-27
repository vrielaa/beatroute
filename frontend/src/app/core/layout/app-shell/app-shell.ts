import { Component, Signal, inject, signal } from '@angular/core';
import { Router, RouterOutlet, isActive } from '@angular/router';

import { Logout } from '../components/logout/logout';
import { UserProfile } from '../components/user-profile/user-profile';
import { Logo } from '../components/logo/logo';
import { DarkMode } from '../components/dark-mode/dark-mode';

import { SpotifyService } from '@src/app/spotify.service';
import { Icon } from '@shared/components/icon/icon';
import { IconName } from '@shared/icons/icons';

type BaseNavLink = {
  label: string;
  path: string;
  exact?: boolean;
  id: string;
  icon: IconName;
};

type NavLink = BaseNavLink & {
  isActive: Signal<boolean>;
};

@Component({
  selector: 'app-app-shell',
  imports: [RouterOutlet, Logout, UserProfile, Logo, DarkMode, Icon],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShellComponent {
  public readonly spotifyService = inject(SpotifyService);
  private readonly router = inject(Router);

  public readonly isMenuOpen = signal(false);

  private readonly baseNavLinks: BaseNavLink[] = [
    {
      label: 'Przegląd',
      path: '/dashboard',
      id: 'dashboard-link',
      exact: true,
      icon: 'dashboard',
    },
    {
      label: 'Profil Muzyczny',
      path: '/music-profile',
      id: 'music-profile-link',
      icon: 'musicProfile',
    },
    {
      label: 'Mapa Muzyczna',
      path: '/music-map',
      id: 'music-map-link',
      icon: 'musicMap',
    },
    {
      label: 'Generator Playlist',
      path: '/playlist-generator',
      id: 'playlist-generator-link',
      icon: 'playlistGenerator',
    },
  ];

  public readonly navLinks: NavLink[] = this.baseNavLinks.map((link) => ({
    ...link,
    isActive: isActive(link.path, this.router, {
      paths: link.exact ? 'exact' : 'subset',
      queryParams: 'ignored',
      fragment: 'ignored',
      matrixParams: 'ignored',
    }),
  }));

  public toggleMenu(): void {
    this.isMenuOpen.update((isOpen) => !isOpen);
  }

  public navigateTo(path: string): void {
    this.router.navigateByUrl(path);
  }
}
