import { Injectable, computed, inject, signal } from '@angular/core';
import { AudioFeatures, AudioStats, TimeRange, TopTracksResponse } from '@core/models/models';
import { SpotifyService } from '@core/services/spotify.service';
import { forkJoin, map, of, Subscription, switchMap, tap } from 'rxjs';

export interface TracksFoundRatio {
  requestedTracksCount: number;
  spotifyTotalTracksCount: number;
  returnedTracksCount: number;
  audioDataTracksCount: number | null;
}

@Injectable()
export class ListeningTracksStore {
  private readonly spotifyService = inject(SpotifyService);

  public readonly topTracks = signal<TopTracksResponse | null>(null);
  public readonly audioStats = signal<AudioStats | null>(null);
  public readonly audioFeatures = signal<AudioFeatures[]>([]);
  public readonly isAudioStatsLoading = signal(true);

  public readonly averageBpm = computed(() => this.mapAverageBpm(this.audioStats()));
  public readonly tracksFoundRatio = computed(() =>
    this.mapTracksFoundRatio(this.topTracks(), this.audioStats())
  );

  public load(
    timeRange: TimeRange,
    tracksRange: number,
    includeAudioFeatures = true
  ): Subscription {
    this.topTracks.set(null);
    this.audioStats.set(null);
    this.audioFeatures.set([]);
    this.isAudioStatsLoading.set(true);

    return this.spotifyService
      .getTopTracks(timeRange, tracksRange)
      .pipe(
        tap((response) => this.topTracks.set(response)),
        switchMap((response) => {
          const trackIds = response.items.map((track) => track.id);

          if (!trackIds.length) {
            return of({ stats: null, audioFeatures: [] });
          }

          if (!includeAudioFeatures) {
            return this.spotifyService
              .getTracksAudioStats(trackIds)
              .pipe(map((stats) => ({ stats, audioFeatures: [] })));
          }

          return forkJoin({
            stats: this.spotifyService.getTracksAudioStats(trackIds),
            audioFeaturesResponse: this.spotifyService.getTracksAudioFeatures(trackIds),
          }).pipe(
            map(({ stats, audioFeaturesResponse }) => ({
              stats,
              audioFeatures: audioFeaturesResponse.audio_features,
            }))
          );
        })
      )
      .subscribe({
        next: ({ stats, audioFeatures }) => {
          this.audioStats.set(stats);
          this.audioFeatures.set(audioFeatures);
          this.isAudioStatsLoading.set(false);
        },
        error: (error) => {
          console.error('Błąd pobierania utworów lub statystyk audio:', error);
          this.audioStats.set(null);
          this.audioFeatures.set([]);
          this.isAudioStatsLoading.set(false);
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
