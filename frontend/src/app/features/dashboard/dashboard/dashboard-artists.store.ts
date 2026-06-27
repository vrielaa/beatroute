import { Injectable, computed, inject, signal } from '@angular/core';
import {
  ArtistGenreDistributionResponse,
  TimeRange,
  TopArtistsResponse,
} from '@src/app/core/models/models';
import { LastfmService } from '@src/app/lastfm.service';
import { SpotifyService } from '@src/app/spotify.service';
import { catchError, of, Subscription, switchMap, tap } from 'rxjs';
import { mapArtistGenres, mapArtistsFoundRatio } from './dashboard.mappers';

@Injectable()
export class DashboardArtistsStore {
  private readonly spotifyService = inject(SpotifyService);
  private readonly lastfmService = inject(LastfmService);
  private readonly reloadTrigger = signal(0);

  public readonly topArtists = signal<TopArtistsResponse | null>(null);
  public readonly isTopArtistsLoading = signal(true);
  public readonly hasTopArtistsError = signal(false);
  public readonly genreDistribution = signal<ArtistGenreDistributionResponse | null>(null);
  public readonly isGenreDistributionLoading = signal(true);
  public readonly hasGenreDistributionError = signal(false);
  public readonly reloadVersion = this.reloadTrigger.asReadonly();

  public readonly artistsFoundRatio = computed(() => mapArtistsFoundRatio(this.topArtists()));
  public readonly artistGenres = computed(() => mapArtistGenres(this.genreDistribution()));

  public retry(): void {
    this.reloadTrigger.update((value) => value + 1);
  }

  public load(timeRange: TimeRange, artistsRange: number): Subscription {
    this.topArtists.set(null);
    this.isTopArtistsLoading.set(true);
    this.hasTopArtistsError.set(false);
    this.genreDistribution.set(null);
    this.isGenreDistributionLoading.set(true);
    this.hasGenreDistributionError.set(false);

    return this.spotifyService
      .getTopArtists(timeRange, artistsRange)
      .pipe(
        tap((response) => {
          this.topArtists.set(response);
          this.isTopArtistsLoading.set(false);
        }),
        switchMap((response) => {
          const artistNames = response.items.map((artist) => artist.name);

          if (!artistNames.length) {
            return of(null);
          }

          return this.lastfmService.getArtistGenreDistribution(artistNames).pipe(
            catchError((error) => {
              console.error('Błąd pobierania gatunków artystów:', error);
              this.hasGenreDistributionError.set(true);
              return of(null);
            })
          );
        })
      )
      .subscribe({
        next: (distribution) => {
          this.genreDistribution.set(distribution);
          this.isGenreDistributionLoading.set(false);
        },
        error: (error) => {
          console.error('Błąd pobierania najczęściej słuchanych artystów:', error);
          this.topArtists.set(null);
          this.hasTopArtistsError.set(true);
          this.isTopArtistsLoading.set(false);
          this.genreDistribution.set(null);
          this.hasGenreDistributionError.set(true);
          this.isGenreDistributionLoading.set(false);
        },
      });
  }
}
