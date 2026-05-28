import { Component, computed, effect, inject, signal } from '@angular/core';
import { ListeningStatsFilters } from '../listening-stats-filters/listening-stats-filters';
import { TimeRange } from '@src/app/core/models/models';
import { SpotifyService } from '@src/app/spotify.service';
import { AverageBpm } from '../average-bpm/average-bpm';
import { TopTracksResponse } from '@src/app/core/models/models';

@Component({
  selector: 'app-dashboard',
  imports: [ListeningStatsFilters, AverageBpm],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  private readonly spotifyService = inject(SpotifyService);
  public readonly selectedTimeRange = signal<TimeRange>('short_term');
  public readonly selectedTracksRange = signal(10);
  public readonly selectedArtistsRange = signal(10);
  public readonly topTracks = signal<TopTracksResponse | null>(null);
  public readonly audioStats = signal<any | null>(null);

  trackNumber = signal<number>(0);

  public readonly tracksFoundRatio = computed(() => {
    const stats = this.audioStats();

    return {
      foundTracksCount: stats?.foundTracksCount || 0,
      totalTracksCount: stats?.totalTracksCount || 0,
    };
  });

  constructor() {
    effect(() => {
      this.loadTopTracks(this.selectedTimeRange(), this.selectedTracksRange());
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

  public onAudioStatsChange(stats: any): void {
    this.audioStats.set(stats);
  }

  private loadTopTracks(timeRange: TimeRange, tracksRange: number): void {
    this.spotifyService.getTopTracks(timeRange, tracksRange).subscribe((response) => {
      this.topTracks.set(response);
    });
  }
}
