import { Injectable, computed, inject, signal } from '@angular/core';
import { AudioStats, TimeRange, TopTracksResponse } from '@src/app/core/models/models';
import { SpotifyService } from '@src/app/spotify.service';
import { of, Subscription, switchMap, tap } from 'rxjs';
import { mapAverageBpm, mapTracksFoundRatio } from './dashboard.mappers';

@Injectable()
export class DashboardTracksStore {
  private readonly spotifyService = inject(SpotifyService);

  public readonly topTracks = signal<TopTracksResponse | null>(null);
  public readonly audioStats = signal<AudioStats | null>(null);
  public readonly isAudioStatsLoading = signal(true);

  public readonly averageBpm = computed(() => mapAverageBpm(this.audioStats()));
  public readonly tracksFoundRatio = computed(() =>
    mapTracksFoundRatio(this.topTracks(), this.audioStats())
  );

  public load(timeRange: TimeRange, tracksRange: number): Subscription {
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
}
