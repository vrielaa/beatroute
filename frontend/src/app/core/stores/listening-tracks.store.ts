import { Injectable, computed, inject, signal } from '@angular/core';
import type { TimeRange, TopTracksResponse } from '@core/api/spotify/spotify.models';
import type { AudioFeatures, AudioStats } from '@core/api/tracks/audio-features.models';
import { TrackAnalysisApiService } from '@core/api/tracks/track-analysis-api.service';
import { EMPTY, of, Subscription, switchMap, tap } from 'rxjs';
import type { ListeningTracksLoadState, TracksFoundRatio } from './listening-tracks.models';
import { TopTracksCollector } from './top-tracks-collector.service';
import type { TopTracksProgress } from '@core/api/tracks/top-tracks.models';
import { HttpErrorResponse } from '@angular/common/http';

@Injectable()
class ListeningTracksStore {
  private readonly collector = inject(TopTracksCollector);
  private readonly trackAnalysisApi = inject(TrackAnalysisApiService);
  private readonly reloadTrigger = signal(0);

  public readonly topTracks = signal<TopTracksResponse | null>(null);
  public readonly audioStats = signal<AudioStats | null>(null);
  public readonly audioFeatures = signal<AudioFeatures[]>([]);
  public readonly loadState = signal<ListeningTracksLoadState>('loading');
  public readonly progress = signal<TopTracksProgress | null>(null);
  public readonly reloadVersion = this.reloadTrigger.asReadonly();
  public readonly isAudioStatsLoading = computed(() => this.loadState() === 'loading');
  public readonly hasError = computed(
    () => this.loadState() === 'tracks-error' || this.loadState() === 'audio-error'
  );
  public readonly feedbackMessage = computed(() => {
    switch (this.loadState()) {
      case 'no-tracks':
        return 'Brak utworów dla wybranego okresu. Spróbuj wybrać inny okres.';
      case 'no-audio-features':
        return 'Nie znaleziono pomiarów cech audio dla wybranych utworów.';
      case 'tracks-error':
        return 'Nie udało się pobrać najczęściej słuchanych utworów. Spróbuj ponownie.';
      case 'audio-error':
        return 'Nie udało się pobrać cech audio i statystyk. Spróbuj ponownie.';
      default:
        return null;
    }
  });

  public readonly averageBpm = computed(() => this.mapAverageBpm(this.audioStats()));
  public readonly tracksFoundRatio = computed(() =>
    this.mapTracksFoundRatio(this.topTracks(), this.audioStats())
  );

  /** Ponawia pobieranie w widoku z aktualnie wybranymi filtrami. */
  public retry(): void {
    this.reloadTrigger.update((value) => value + 1);
  }

  /**
   * Dobiera brakujące utwory, następnie raz podsumowuje zebrane pomiary.
   * Nie pobiera ponownie cech i nie uśrednia statystyk poszczególnych partii.
   * Błąd przerywa dobieranie i pozostaje błędem, nie poprawnym końcem źródła.
   * Wywołujący anuluje zwróconą subskrypcję przy zmianie filtrów lub zamknięciu widoku.
   */
  public load(timeRange: TimeRange, tracksRange: number): Subscription {
    this.topTracks.set(null);
    this.audioStats.set(null);
    this.audioFeatures.set([]);
    this.loadState.set('loading');
    this.progress.set(null);
    let summarizing = false;
    let collectionProgress: TopTracksProgress | null = null;

    return this.collector
      .collect(timeRange, tracksRange, 'statistics')
      .pipe(
        tap((collection) => {
          collectionProgress = collection.progress;
          this.progress.set(collection.progress);
          if (collection.progress.totalItems !== null) {
            this.topTracks.set({
              href: '',
              items: collection.tracks,
              limit: tracksRange,
              offset: 0,
              previous: null,
              next: null,
              total: collection.progress.totalItems,
            });
          }
        }),
        switchMap((collection) => {
          if (!collection.progress.complete) return EMPTY;
          this.audioFeatures.set(collection.audioFeatures);
          if (!collection.tracks.length) return of(null);
          summarizing = true;
          return this.trackAnalysisApi.getStatistics(collection.audioFeatures);
        })
      )
      .subscribe({
        next: (stats) => {
          this.audioStats.set(stats);
          if (collectionProgress?.totalItems === 0) {
            this.loadState.set('no-tracks');
          } else {
            this.loadState.set(stats ? 'ready' : 'no-audio-features');
          }
        },
        error: (error) => {
          console.error('Błąd pobierania utworów lub statystyk audio:', error);
          this.audioStats.set(null);
          this.audioFeatures.set([]);
          const audioFailure =
            summarizing ||
            (error instanceof HttpErrorResponse &&
              error.error?.error?.details?.integration === 'reccobeats');
          this.loadState.set(audioFailure ? 'audio-error' : 'tracks-error');
        },
      });
  }

  private mapAverageBpm(audioStats: AudioStats | null): number | null {
    const averageBpm = audioStats?.averageBpm;

    return typeof averageBpm === 'number' ? Math.round(averageBpm) : null;
  }

  private mapTracksFoundRatio(
    topTracks: TopTracksResponse | null,
    audioStats: AudioStats | null
  ): TracksFoundRatio | null {
    if (!topTracks) return null;

    return {
      requestedTracksCount: topTracks.limit,
      spotifyTotalTracksCount: topTracks.total,
      returnedTracksCount: topTracks.items.length,
      audioDataTracksCount: audioStats?.foundTracksCount ?? null,
    };
  }
}

export { ListeningTracksStore };
