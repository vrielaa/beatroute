import { Component, Signal, inject, signal } from '@angular/core';
import { Router, RouterOutlet, isActive } from '@angular/router';

import { Logout } from '../components/logout/logout';
import { UserProfile } from '../components/user-profile/user-profile';
import { Logo } from '../components/logo/logo';
import { DarkMode } from '../components/dark-mode/dark-mode';

import { SpotifyService } from '@core/services/spotify.service';
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
  host: {
    class:
      'grid min-h-[100dvh] grid-cols-1 grid-rows-[8rem_8rem_minmax(0,1fr)] [font-family:var(--font-sons)] max-[900px]:grid-rows-[7rem_7rem_minmax(0,1fr)] max-[600px]:grid-rows-[6.4rem_6.4rem_minmax(0,1fr)]',
  },
})
export class AppShellComponent {
  public readonly spotifyService = inject(SpotifyService);
  private readonly router = inject(Router);

  public readonly isMenuOpen = signal(false);
  public readonly navLinkClasses =
    'group relative flex h-full min-h-[0] w-full min-w-[0] border-0 p-0 text-[var(--color-text-primary)]';
  public readonly navLinkContentClasses =
    'relative flex h-full min-h-[0] min-w-[0] items-center justify-center gap-[1rem] rounded-[2rem] px-[clamp(1rem,3vw,6rem)] py-[0.5rem] [transition:background-color_var(--transition-fast)] group-hover:bg-[var(--color-surface-tertiary)] group-active:bg-[var(--color-surface-tertiary)] max-[900px]:gap-[0.6rem] max-[900px]:px-[1rem] max-[600px]:p-[0.6rem]';
  public readonly firstNavLinkContentSizeClasses = 'w-full';
  public readonly overlappedNavLinkContentSizeClasses = '-ml-[1rem] w-[calc(100%+1rem)]';
  public readonly activeNavLinkContentClasses = 'bg-[var(--color-surface-tertiary)]';
  public readonly navLinkLabelClasses =
    'text-[length:var(--text-base)] font-[var(--font-weight-medium)] leading-[var(--line-height-tight)] max-[900px]:text-[length:1.5rem] max-[600px]:sr-only';

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
