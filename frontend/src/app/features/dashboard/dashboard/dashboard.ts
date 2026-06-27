import { Component, effect, inject, signal } from '@angular/core';
import { ListeningStatsFilters } from '../listening-stats-filters/listening-stats-filters';
import { TimeRange } from '@src/app/core/models/models';
import { AverageBpm } from '../average-bpm/average-bpm';
import { MostListenedArtists } from '../most-listened-artists/most-listened-artists';
import { GenreDistribution } from '../genre-distribution/genre-distribution';
import { DashboardTracksStore } from './dashboard-tracks.store';
import { DashboardArtistsStore } from './dashboard-artists.store';

@Component({
  selector: 'app-dashboard',
  imports: [ListeningStatsFilters, AverageBpm, GenreDistribution, MostListenedArtists],
  providers: [DashboardTracksStore, DashboardArtistsStore],
  templateUrl: './dashboard.html',
  host: {
    class:
      'grid w-full min-w-[0] auto-rows-min grid-cols-[minmax(0,2fr)_minmax(26rem,1fr)] gap-[1.6rem] [&>.card]:min-w-[0] max-[960px]:grid-cols-1 max-[960px]:[&>.card]:col-start-1 max-[960px]:[&>.card]:col-end-auto max-[960px]:[&>.card]:row-auto max-[600px]:gap-[1rem] max-[600px]:[&>.card]:rounded-[var(--radius-lg)] max-[600px]:[&>.card]:p-[1.4rem] max-[380px]:[&>.card]:p-[1.2rem]',
  },
})
export class Dashboard {
  private readonly tracksStore = inject(DashboardTracksStore);
  private readonly artistsStore = inject(DashboardArtistsStore);

  public readonly selectedTimeRange = signal<TimeRange>('short_term');
  public readonly selectedTracksRange = signal(10);
  public readonly selectedArtistsRange = signal(10);

  public readonly topArtists = this.artistsStore.topArtists;
  public readonly isTopArtistsLoading = this.artistsStore.isTopArtistsLoading;
  public readonly hasTopArtistsError = this.artistsStore.hasTopArtistsError;
  public readonly genreDistribution = this.artistsStore.genreDistribution;
  public readonly isGenreDistributionLoading = this.artistsStore.isGenreDistributionLoading;
  public readonly hasGenreDistributionError = this.artistsStore.hasGenreDistributionError;
  public readonly averageBpm = this.tracksStore.averageBpm;
  public readonly isAudioStatsLoading = this.tracksStore.isAudioStatsLoading;
  public readonly tracksFoundRatio = this.tracksStore.tracksFoundRatio;
  public readonly artistsFoundRatio = this.artistsStore.artistsFoundRatio;
  public readonly artistGenres = this.artistsStore.artistGenres;

  constructor() {
    effect((onCleanup) => {
      const subscription = this.tracksStore.load(
        this.selectedTimeRange(),
        this.selectedTracksRange()
      );

      onCleanup(() => subscription.unsubscribe());
    });

    effect((onCleanup) => {
      this.artistsStore.reloadVersion();

      const subscription = this.artistsStore.load(
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
    this.artistsStore.retry();
  }
}
