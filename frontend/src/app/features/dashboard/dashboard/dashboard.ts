import { Component, effect, inject } from '@angular/core';
import { MostListenedTracks } from '../most-listened-tracks/most-listened-tracks';
import { MostListenedArtists } from '../most-listened-artists/most-listened-artists';
import { GenreDistribution } from '../genre-distribution/genre-distribution';
import { ListeningTracksStore } from '@core/stores/listening-tracks.store';
import { DashboardArtistsStore } from './dashboard-artists.store';
import { AnalysisFiltersStore } from '@core/stores/analysis-filters.store';
import { ListeningStatsWarnings } from '../listening-stats-warnings/listening-stats-warnings';

@Component({
  selector: 'app-dashboard',
  imports: [
    ListeningStatsWarnings,
    MostListenedTracks,
    GenreDistribution,
    MostListenedArtists,
  ],
  providers: [ListeningTracksStore, DashboardArtistsStore],
  templateUrl: './dashboard.html',
  host: {
    class:
      'grid w-full min-w-[0] auto-rows-min grid-cols-[minmax(0,2fr)_minmax(26rem,1fr)] gap-[1.6rem] [&>.card]:min-w-[0] max-[960px]:grid-cols-1 max-[960px]:[&>.card]:col-start-1 max-[960px]:[&>.card]:col-end-auto max-[960px]:[&>.card]:row-auto max-[600px]:gap-[1rem] max-[600px]:[&>.card]:rounded-[var(--radius-lg)] max-[600px]:[&>.card]:p-[1.4rem] max-[380px]:[&>.card]:p-[1.2rem]',
  },
})
export class Dashboard {
  private readonly analysisFiltersStore = inject(AnalysisFiltersStore);
  private readonly tracksStore = inject(ListeningTracksStore);
  private readonly artistsStore = inject(DashboardArtistsStore);

  public readonly selectedTimeRange = this.analysisFiltersStore.selectedTimeRange;
  public readonly selectedTracksRange = this.analysisFiltersStore.selectedTracksRange;
  public readonly selectedArtistsRange = this.analysisFiltersStore.selectedArtistsRange;

  public readonly topTracks = this.tracksStore.topTracks;
  public readonly topArtists = this.artistsStore.topArtists;
  public readonly isTopArtistsLoading = this.artistsStore.isTopArtistsLoading;
  public readonly hasTopArtistsError = this.artistsStore.hasTopArtistsError;
  public readonly genreDistribution = this.artistsStore.genreDistribution;
  public readonly isGenreDistributionLoading = this.artistsStore.isGenreDistributionLoading;
  public readonly hasGenreDistributionError = this.artistsStore.hasGenreDistributionError;
  public readonly audioFeatures = this.tracksStore.audioFeatures;
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

  public retryTopArtists(): void {
    this.artistsStore.retry();
  }
}
