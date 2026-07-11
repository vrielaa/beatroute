import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterOutlet, isActive } from '@angular/router';

import { SpotifyService } from '@core/services/spotify.service';
import { AnalysisFiltersStore } from '@core/stores/analysis-filters.store';
import { AnalysisFiltersDrawer } from './analysis-filters-drawer/analysis-filters-drawer';
import { AppShellHeader } from './app-shell-header/app-shell-header';
import { AppShellNav } from './app-shell-nav/app-shell-nav';
import { BaseNavLink, NavLink } from './app-shell.models';

@Component({
  selector: 'app-app-shell',
  imports: [AnalysisFiltersDrawer, AppShellHeader, AppShellNav, RouterOutlet],
  templateUrl: './app-shell.html',
  host: {
    class:
      'grid min-h-[100dvh] grid-cols-1 grid-rows-[8rem_8rem_minmax(0,1fr)] [font-family:var(--default-font-family)] max-[900px]:grid-rows-[7rem_7rem_minmax(0,1fr)] max-[600px]:grid-rows-[6.4rem_6.4rem_minmax(0,1fr)]',
  },
})
export class AppShellComponent {
  public readonly spotifyService = inject(SpotifyService);
  public readonly analysisFiltersStore = inject(AnalysisFiltersStore);
  private readonly router = inject(Router);

  public readonly isMenuOpen = signal(false);
  public readonly isAnalysisFiltersOpen = signal(false);

  private readonly baseNavLinks: BaseNavLink[] = [
    {
      label: 'Przegląd',
      path: '/dashboard',
      id: 'dashboard-link',
      exact: true,
      icon: 'dashboard',
      showAnalysisFilters: true,
    },
    {
      label: 'Profil Muzyczny',
      path: '/music-profile',
      id: 'music-profile-link',
      icon: 'musicProfile',
      showAnalysisFilters: true,
    },
    {
      label: 'Mapa Muzyczna',
      path: '/music-map',
      id: 'music-map-link',
      icon: 'musicMap',
      showAnalysisFilters: true,
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

  public readonly showAnalysisFilters = computed(() =>
    this.navLinks.some((link) => link.showAnalysisFilters && link.isActive())
  );

  public toggleMenu(): void {
    this.isMenuOpen.update((isOpen) => !isOpen);
  }

  public toggleAnalysisFilters(): void {
    this.isAnalysisFiltersOpen.update((isOpen) => !isOpen);
  }

  public closeAnalysisFilters(): void {
    this.isAnalysisFiltersOpen.set(false);
  }

  public navigateTo(path: string): void {
    this.closeAnalysisFilters();
    this.router.navigateByUrl(path);
  }
}
