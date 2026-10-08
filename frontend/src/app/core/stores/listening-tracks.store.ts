import { Injectable, computed, inject, signal } from '@angular/core';
import type { TimeRange, TopTracksResponse } from '@core/api/spotify/spotify.models';
import { SpotifyApiService } from '@core/api/spotify/spotify-api.service';
import type { AudioFeatures, AudioStats } from '@core/api/tracks/audio-features.models';
import { TrackAnalysisApiService } from '@core/api/tracks/track-analysis-api.service';
import { map, of, Subscription, switchMap, tap } from 'rxjs';
import type { ListeningTracksLoadState, TracksFoundRatio } from './listening-tracks.models';

@Injectable()
class ListeningTracksStore {
  private readonly spotifyApi = inject(SpotifyApiService);
  private readonly trackAnalysisApi = inject(TrackAnalysisApiService);
  private readonly reloadTrigger = signal(0);

  public readonly topTracks = signal<TopTracksResponse | null>(null);
  public readonly audioStats = signal<AudioStats | null>(null);
  public readonly audioFeatures = signal<AudioFeatures[]>([]);
  public readonly loadState = signal<ListeningTracksLoadState>('loading');
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
   * Pobiera utwory, a następnie ich analizę. Zachowuje listę Spotify przy awarii
   * analizy i rozróżnia błędy od poprawnych odpowiedzi bez utworów lub pomiarów.
   * Wywołujący anuluje zwróconą subskrypcję przy zmianie filtrów lub zamknięciu widoku.
   */
  public load(
    timeRange: TimeRange,
    tracksRange: number,
    includeAudioFeatures = true
  ): Subscription {
    this.topTracks.set(null);
    this.audioStats.set(null);
    this.audioFeatures.set([]);
    this.loadState.set('loading');
    let spotifyTracks: TopTracksResponse | null = null;

    return this.spotifyApi
      .getTopTracks(timeRange, tracksRange)
      .pipe(
        tap((response) => {
          spotifyTracks = response;
          this.topTracks.set(response);
        }),
        switchMap((response) => {
          const trackIds = response.items.map((track) => track.id);

          if (!trackIds.length) {
            return of({ stats: null, audioFeatures: [] });
          }

          if (!includeAudioFeatures) {
            return this.trackAnalysisApi
              .getAudioStats(trackIds)
              .pipe(map((stats) => ({ stats, audioFeatures: [] })));
          }

          return this.trackAnalysisApi.getTracksAnalysis(trackIds);
        })
      )
      .subscribe({
        next: ({ stats, audioFeatures }) => {
          this.audioStats.set(stats);
          this.audioFeatures.set(audioFeatures);
          if (!spotifyTracks?.items.length) {
            this.loadState.set('no-tracks');
          } else {
            this.loadState.set(this.hasAudioMeasurements(stats) ? 'ready' : 'no-audio-features');
          }
        },
        error: (error) => {
          console.error('Błąd pobierania utworów lub statystyk audio:', error);
          this.audioStats.set(null);
          this.audioFeatures.set([]);
          this.loadState.set(spotifyTracks ? 'audio-error' : 'tracks-error');
        },
      });
  }

  /** Sprawdza dostępność przynajmniej jednego pomiaru, również o wartości zero. */
  private hasAudioMeasurements(stats: AudioStats | null): boolean {
    if (!stats) return false;

    const measurements = [
      stats.averageBpm,
      stats.averageEnergy,
      stats.averageDanceability,
      stats.averageValence,
      stats.averageAcousticness,
      stats.averageInstrumentalness,
      stats.averageLiveness,
      stats.averageSpeechiness,
      stats.averageLoudness,
      stats.dominantKey,
      stats.dominantMode,
      stats.dominantTimeSignature,
    ];

    return measurements.some((value) => typeof value === 'number' && Number.isFinite(value));
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
