import { Component, input, model, output } from '@angular/core';
import { TimeRange } from '@src/app/core/models/models';
import { Icon } from '@shared/components/icon/icon';

@Component({
  selector: 'app-listening-stats-filters',
  imports: [Icon],
  templateUrl: './listening-stats-filters.html',
  host: {
    class: 'grid w-full min-w-[0] auto-rows-min grid-cols-1 gap-[1.6rem] max-[600px]:gap-[1.4rem]',
  },
})
export class ListeningStatsFilters {
  public readonly selectedTimeRange = input<TimeRange>('short_term');
  public readonly selectedTracksRange = model<number>(10);
  public readonly selectedArtistsRange = model<number>(10);

  private tracksRangeDebounceId: ReturnType<typeof setTimeout> | null = null;
  private artistsRangeDebounceId: ReturnType<typeof setTimeout> | null = null;

  private readonly debounceTime = 300;

  public readonly timeRangeChange = output<TimeRange>();

  public selectTimeRange(e: Event): void {
    const range = (e.target as HTMLSelectElement).value as TimeRange;
    this.timeRangeChange.emit(range);
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
}
