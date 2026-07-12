import { Component, effect, inject } from '@angular/core';
import { AnalysisFiltersStore } from '@core/stores/analysis-filters.store';
import { ListeningTracksStore } from '@core/stores/listening-tracks.store';
import { AudioFeaturesComparison } from './audio-features-comparison/audio-features-comparison';
import { AudioFeaturesProfile } from './audio-features-profile/audio-features-profile';
import { AverageAudioFeatures } from './average-audio-features/average-audio-features';
import { AverageBpm } from './average-bpm/average-bpm';

@Component({
  selector: 'app-music-profile',
  imports: [AverageBpm, AverageAudioFeatures, AudioFeaturesProfile, AudioFeaturesComparison],
  providers: [ListeningTracksStore],
  templateUrl: './music-profile.html',
  styleUrl: './music-profile.scss',
  host: {
    class: 'music-profile-grid',
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
