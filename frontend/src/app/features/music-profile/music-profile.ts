import { Component, effect, inject } from '@angular/core';
import { AnalysisFiltersStore } from '@core/stores/analysis-filters.store';
import { ListeningTracksStore } from '@core/stores/listening-tracks.store';
import { AudioFeaturesComparison } from './audio-features-comparison/audio-features-comparison';
import { AverageAudioFeatures } from './average-audio-features/average-audio-features';
import { AverageBpm } from './average-bpm/average-bpm';

@Component({
  selector: 'app-music-profile',
  imports: [AverageBpm, AverageAudioFeatures, AudioFeaturesComparison],
  providers: [ListeningTracksStore],
  templateUrl: './music-profile.html',
  host: {
    class:
      'grid w-full min-w-[0] auto-rows-min grid-cols-1 gap-[1.6rem] [&>.card]:min-w-[0] max-[600px]:gap-[1rem] max-[600px]:[&>.card]:rounded-[var(--radius-lg)] max-[600px]:[&>.card]:p-[1.4rem] max-[380px]:[&>.card]:p-[1.2rem]',
  },
})
export class MusicProfile {
  private readonly analysisFiltersStore = inject(AnalysisFiltersStore);
  private readonly tracksStore = inject(ListeningTracksStore);

  public readonly selectedTimeRange = this.analysisFiltersStore.selectedTimeRange;
  public readonly selectedTracksRange = this.analysisFiltersStore.selectedTracksRange;

  public readonly topTracks = this.tracksStore.topTracks;
  public readonly audioFeatures = this.tracksStore.audioFeatures;
  public readonly audioStats = this.tracksStore.audioStats;
  public readonly averageBpm = this.tracksStore.averageBpm;
  public readonly isAudioStatsLoading = this.tracksStore.isAudioStatsLoading;

  constructor() {
    effect((onCleanup) => {
      const subscription = this.tracksStore.load(
        this.selectedTimeRange(),
        this.selectedTracksRange()
      );

      onCleanup(() => subscription.unsubscribe());
    });
  }
}
