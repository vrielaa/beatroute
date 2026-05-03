import { Component, Signal, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet, isActive } from '@angular/router';

import { Logout } from '../components/logout/logout';
import { UserProfile } from '../components/user-profile/user-profile';
import { Logo } from '../components/logo/logo';
import { DarkMode } from '../components/dark-mode/dark-mode';

import { SpotifyService } from '@src/app/spotify.service';

type IconPath = {
  paths: string[];
};

type BaseNavLink = {
  label: string;
  path: string;
  exact?: boolean;
  id: string;
  iconPath: IconPath;
};

type NavLink = BaseNavLink & {
  isActive: Signal<boolean>;
};

@Component({
  selector: 'app-app-shell',
  imports: [RouterOutlet, Logout, UserProfile, Logo, DarkMode],
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
      iconPath: {
        paths: [
          'M6 12V3.33333L14 2V10.6667',
          'M4 14C5.10457 14 6 13.1046 6 12C6 10.8954 5.10457 10 4 10C2.89543 10 2 10.8954 2 12C2 13.1046 2.89543 14 4 14Z',
          'M12 12.6667C13.1046 12.6667 14 11.7712 14 10.6667C14 9.5621 13.1046 8.66667 12 8.66667C10.8954 8.66667 10 9.5621 10 10.6667C10 11.7712 10.8954 12.6667 12 12.6667Z',
        ],
      },
    },
    {
      label: 'Profil Muzyczny',
      path: '/music-profile',
      id: 'music-profile-link',
      iconPath: {
        paths: [
          'M12.6666 14V12.6667C12.6666 11.9594 12.3857 11.2811 11.8856 10.781C11.3855 10.281 10.7072 10 9.99998 10H5.99998C5.29274 10 4.61446 10.281 4.11436 10.781C3.61426 11.2811 3.33331 11.9594 3.33331 12.6667V14',
          'M7.99998 7.33333C9.47274 7.33333 10.6666 6.13943 10.6666 4.66667C10.6666 3.19391 9.47274 2 7.99998 2C6.52722 2 5.33331 3.19391 5.33331 4.66667C5.33331 6.13943 6.52722 7.33333 7.99998 7.33333Z',
        ],
      },
    },
    {
      label: 'Mapa Muzyczna',
      path: '/music-map',
      id: 'music-map-link',
      iconPath: {
        paths: [
          'M9.404 3.702C9.58907 3.79448 9.79312 3.84262 10 3.84262C10.2069 3.84262 10.4109 3.79448 10.596 3.702L13.0353 2.482C13.1371 2.43117 13.2501 2.40721 13.3637 2.41238C13.4773 2.41755 13.5876 2.45169 13.6843 2.51155C13.781 2.57142 13.8607 2.65501 13.916 2.75439C13.9713 2.85377 14.0002 2.96563 14 3.07933V11.5887C13.9999 11.7124 13.9654 11.8338 13.9003 11.939C13.8352 12.0443 13.7421 12.1293 13.6313 12.1847L10.596 13.7027C10.4109 13.7951 10.2069 13.8433 10 13.8433C9.79312 13.8433 9.58907 13.7951 9.404 13.7027L6.596 12.2987C6.41094 12.2062 6.20689 12.158 6 12.158C5.79312 12.158 5.58907 12.2062 5.404 12.2987L2.96467 13.5187C2.8629 13.5695 2.74982 13.5935 2.63617 13.5883C2.52253 13.5831 2.41211 13.5489 2.31541 13.4889C2.21872 13.429 2.13898 13.3453 2.08377 13.2458C2.02856 13.1464 1.99972 13.0344 2 12.9207V4.412C2.00007 4.288232.03459 4.16691 2.0997 4.06165C2.16482 3.95639 2.25795 3.87133 2.36867 3.816L5.404 2.298C5.58907 2.20552 5.79312 2.15738 6 2.15738C6.20689 2.15738 6.41094 2.20552 6.596 2.298L9.404 3.702Z',
          'M10 3.84267V13.8427',
          'M6 2.15733V12.1573',
        ],
      },
    },
    {
      label: 'Generator Playlist',
      path: '/playlist-generator',
      id: 'playlist-generator-link',
      iconPath: {
        paths: [
          'M14 10V4',
          'M12.3333 12C12.7753 12 13.1992 11.8244 13.5118 11.5118C13.8244 11.1993 14 10.7754 14 10.3333C14 9.89131 13.8244 9.46739 13.5118 9.15483C13.1992 8.84227 12.7753 8.66667 12.3333 8.66667C11.8913 8.66667 11.4673 8.84227 11.1548 9.15483C10.8422 9.46739 10.6666 9.89131 10.6666 10.3333C10.6666 10.7754 10.8422 11.1993 11.1548 11.5118C11.4673 11.8244 11.8913 12 12.3333 12Z',
          'M8 8H2',
          'M10.6667 4H2',
          'M8 12H2',
        ],
      },
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
    console.log('Navigating to:', path);
  }

  public isDarkMode(): boolean {
    return document.documentElement.classList.contains('dark-mode');
  }
}