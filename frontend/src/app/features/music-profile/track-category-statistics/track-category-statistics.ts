import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { AudioStats } from '@core/api/tracks/audio-features.models';

@Component({
  selector: 'app-track-category-statistics',
  templateUrl: './track-category-statistics.html',
  styleUrl: './track-category-statistics.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
class TrackCategoryStatistics {
  public readonly audioStats = input<AudioStats | null>(null);
  public readonly isLoading = input(false);

  public readonly statistics = computed(() => {
    const stats = this.audioStats();

    if (!stats) {
      return [];
    }

    return [
      {
        label: 'Nagrania na żywo',
        percentage: stats.liveTrackPercentage,
        measurementCount: stats.measurementCounts.liveness,
      },
      {
        label: 'Utwory instrumentalne',
        percentage: stats.instrumentalTrackPercentage,
        measurementCount: stats.measurementCounts.instrumentalness,
      },
      {
        label: 'Utwory z wysokim udziałem mowy',
        percentage: stats.speechHeavyTrackPercentage,
        measurementCount: stats.measurementCounts.speechiness,
      },
      {
        label: 'Utwory durowe',
        percentage: stats.majorPercentage,
        measurementCount: stats.measurementCounts.mode,
      },
      {
        label: 'Utwory molowe',
        percentage: stats.minorPercentage,
        measurementCount: stats.measurementCounts.mode,
      },
    ];
  });
}

export { TrackCategoryStatistics };
