import { Component, computed, effect, inject, signal } from '@angular/core';
import { ListeningStatsFilters } from '../listening-stats-filters/listening-stats-filters';
import {
  ArtistGenreDistributionResponse,
  AudioStats,
  TimeRange,
  TopArtistsResponse,
  TopTracksResponse,
} from '@src/app/core/models/models';
import { SpotifyService } from '@src/app/spotify.service';
import { AverageBpm } from '../average-bpm/average-bpm';
import { MostListenedArtists } from '../most-listened-artists/most-listened-artists';
import { catchError, of, Subscription, switchMap, tap } from 'rxjs';
import { GenreDistribution } from '../genre-distribution/genre-distribution';
import { LastfmService } from '@src/app/lastfm.service';

@Component({
  selector: 'app-dashboard',
  imports: [ListeningStatsFilters, AverageBpm, GenreDistribution, MostListenedArtists],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  private readonly spotifyService = inject(SpotifyService);
  private readonly lastfmService = inject(LastfmService);
  public readonly selectedTimeRange = signal<TimeRange>('short_term');
  public readonly selectedTracksRange = signal(10);
  public readonly selectedArtistsRange = signal(10);
  public readonly topTracks = signal<TopTracksResponse | null>(null);
  public readonly topArtists = signal<TopArtistsResponse | null>(null);
  public readonly isTopArtistsLoading = signal(true);
  public readonly hasTopArtistsError = signal(false);
  public readonly genreDistribution = signal<ArtistGenreDistributionResponse | null>(null);
  public readonly isGenreDistributionLoading = signal(true);
  public readonly hasGenreDistributionError = signal(false);
  public readonly audioStats = signal<AudioStats | null>(null);
  public readonly isAudioStatsLoading = signal(true);
  private readonly topArtistsReloadTrigger = signal(0);

  public readonly averageBpm = computed(() => {
    const averageBpm = this.audioStats()?.averageBpm;

    return typeof averageBpm === 'number' ? Math.round(averageBpm) : null;
  });

  public readonly tracksFoundRatio = computed(() => {
    const topTracks = this.topTracks();
    const stats = this.audioStats();
    if (!topTracks) return null;

    return {
      requestedTracksCount: topTracks.limit,
      spotifyTotalTracksCount: topTracks.total,
      returnedTracksCount: topTracks.items.length,
      audioDataTracksCount: stats?.foundTracksCount ?? null,
    };
  });

  public readonly artistsFoundRatio = computed(() => {
    const topArtists = this.topArtists();
    if (!topArtists) return null;

    return {
      requestedArtistsCount: topArtists.limit,
      spotifyTotalArtistsCount: topArtists.total,
    };
  });

  constructor() {
    effect((onCleanup) => {
      const subscription = this.loadTopTracksAndAudioStats(
        this.selectedTimeRange(),
        this.selectedTracksRange()
      );

      onCleanup(() => subscription.unsubscribe());
    });

    effect((onCleanup) => {
      this.topArtistsReloadTrigger();

      const subscription = this.loadTopArtists(
        this.selectedTimeRange(),
        this.selectedArtistsRange()
      );

      onCleanup(() => subscription.unsubscribe());
    });
  }

  public changeTimeRange(timeRange: TimeRange): void {
    this.selectedTimeRange.set(timeRange);
  }

  public changeTracksRange(tracksRange: number): void {
    this.selectedTracksRange.set(tracksRange);
  }

  public changeArtistsRange(artistsRange: number): void {
    this.selectedArtistsRange.set(artistsRange);
  }

  public retryTopArtists(): void {
    this.topArtistsReloadTrigger.update((value) => value + 1);
  }

  private loadTopTracksAndAudioStats(timeRange: TimeRange, tracksRange: number): Subscription {
    this.topTracks.set(null);
    this.audioStats.set(null);
    this.isAudioStatsLoading.set(true);

    return this.spotifyService
      .getTopTracks(timeRange, tracksRange)
      .pipe(
        tap((response) => this.topTracks.set(response)),
        switchMap((response) => {
          const trackIds = response.items.map((track) => track.id);

          return trackIds.length ? this.spotifyService.getTracksAudioStats(trackIds) : of(null);
        })
      )
      .subscribe({
        next: (stats) => {
          this.audioStats.set(stats);
          this.isAudioStatsLoading.set(false);
        },
        error: (error) => {
          console.error('Błąd pobierania utworów lub statystyk audio:', error);
          this.audioStats.set(null);
          this.isAudioStatsLoading.set(false);
        },
      });
  }

  private loadTopArtists(timeRange: TimeRange, artistsRange: number): Subscription {
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
