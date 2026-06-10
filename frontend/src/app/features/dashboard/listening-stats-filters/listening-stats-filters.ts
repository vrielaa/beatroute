import { Component, computed, input, model, output } from '@angular/core';
import { TimeRange } from '@src/app/core/models/models';

@Component({
  selector: 'app-listening-stats-filters',
  imports: [],
  templateUrl: './listening-stats-filters.html',
  styleUrl: './listening-stats-filters.scss',
})
export class ListeningStatsFilters {
  public readonly selectedTimeRange = input<TimeRange>('short_term');
  public readonly selectedTracksRange = model<number>(10);
  public readonly selectedArtistsRange = model<number>(10);

  private tracksRangeDebounceId: ReturnType<typeof setTimeout> | null = null;
  private artistsRangeDebounceId: ReturnType<typeof setTimeout> | null = null;

  private readonly debounceTime = 300;

  public readonly tracksFoundRatio = input<{
    requestedTracksCount: number;
    spotifyTotalTracksCount: number;
    returnedTracksCount: number;
    audioDataTracksCount: number | null;
  } | null>(null);
  public readonly artistsFoundRatio = input<{
    requestedArtistsCount: number;
    spotifyTotalArtistsCount: number;
  } | null>(null);
  public readonly timeRangeChange = output<TimeRange>();

  public readonly periodLabel = computed(() => {
    const labels: Record<TimeRange, string> = {
      short_term: 'w ostatnim miesiącu',
      medium_term: 'w ostatnich 6 miesiącach',
      long_term: 'w ostatnim roku',
    };

    return labels[this.selectedTimeRange()];
  });

  public readonly showInsufficientListeningHistoryWarning = computed(() => {
    const ratio = this.tracksFoundRatio();
    if (!ratio) return false;

    return ratio.spotifyTotalTracksCount < ratio.requestedTracksCount;
  });

  public readonly showMissingAudioDataWarning = computed(() => {
    const ratio = this.tracksFoundRatio();
    if (!ratio || ratio.audioDataTracksCount === null) return false;

    return ratio.audioDataTracksCount < ratio.returnedTracksCount;
  });

  public readonly showInsufficientArtistsHistoryWarning = computed(() => {
    const ratio = this.artistsFoundRatio();
    if (!ratio) return false;

    return ratio.spotifyTotalArtistsCount < ratio.requestedArtistsCount;
  });

  public selectTimeRange(e: Event): void {
    const range = (e.target as HTMLSelectElement).value as TimeRange;
    this.timeRangeChange.emit(range);
    console.log('Selected range:', range);
  }

  private clampRange(value: number): number {
    return Math.min(Math.max(value, 1), 40);
  }

  public selectTracksRange(e: Event): void {
    const value = Number((e.target as HTMLInputElement).value);
    const clampedValue = this.clampRange(value);

    if (this.tracksRangeDebounceId) {
      clearTimeout(this.tracksRangeDebounceId);
    }

    this.tracksRangeDebounceId = setTimeout(() => {
      this.selectedTracksRange.set(clampedValue);
    }, this.debounceTime);
  }

  public selectArtistsRange(e: Event): void {
    const value = Number((e.target as HTMLInputElement).value);
    const clampedValue = this.clampRange(value);

    if (this.artistsRangeDebounceId) {
      clearTimeout(this.artistsRangeDebounceId);
    }

    this.artistsRangeDebounceId = setTimeout(() => {
      this.selectedArtistsRange.set(clampedValue);
    }, this.debounceTime);
  }

  svgSettingsIconPaths = [
    'M17.5001 3.3335H11.6667',
    'M8.33333 3.3335H2.5',
    'M17.5 10H10',
    'M6.66667 10H2.5',
    'M17.4999 16.6665H13.3333',
    'M10 16.6665H2.5',
    'M11.6667 1.6665V4.99984',
    'M6.66675 8.3335V11.6668',
    'M13.3333 15V18.3333',
  ];
}
