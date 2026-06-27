import { Component, computed, input, model, output } from '@angular/core';
import { TimeRange } from '@src/app/core/models/models';
import { Icon } from '@shared/components/icon/icon';

@Component({
  selector: 'app-listening-stats-filters',
  imports: [Icon],
  templateUrl: './listening-stats-filters.html',
  host: {
    class:
      'row-start-1 row-end-2 col-start-1 col-end-2 grid w-full min-w-[0] auto-rows-min grid-cols-1 gap-[1.6rem] max-[600px]:gap-[1.4rem]',
  },
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
  public readonly labelClasses = 'w-fit font-[var(--font-weight-medium)]';
  public readonly selectClasses =
    'min-w-[0] flex-1 rounded-[var(--radius-lg)] border-0 !bg-[var(--color-surface-secondary)] !text-[var(--color-text-primary)] px-[1.2rem] py-[1rem] leading-[var(--line-height-normal)] [appearance:base-select] [transition:0.4s] max-[600px]:w-full [&>button]:flex [&>button]:w-full [&>button]:items-center [&>button]:justify-between [&>button]:gap-[0.8rem] [&>button]:text-left [&>button]:leading-[var(--line-height-normal)] [&::picker(select)]:[appearance:base-select] [&::picker(select)]:border-0 [&::picker(select)]:rounded-[var(--radius-lg)] [&::picker(select)]:!bg-[var(--color-surface)] [&::picker(select)]:opacity-0 [&::picker(select)]:[transition:all_0.4s_allow-discrete] [&::picker(select)]:top-[calc(anchor(bottom)+1px)] [&:open::picker(select)]:opacity-100 [&::picker-icon]:shrink-0 [&::picker-icon]:[transition:0.4s_rotate] [&:open::picker-icon]:rotate-180';
  public readonly optionClasses =
    "flex justify-start gap-[20px] border border-[var(--color-border)] !bg-[var(--color-surface)] !text-[var(--color-text-primary)] p-[10px] [transition:0.4s] [&:checked]:font-[var(--font-weight-bold)] [&::checkmark]:order-1 [&::checkmark]:ml-auto [&::checkmark]:content-['✔️']";
  public readonly firstOptionClasses = `${this.optionClasses} rounded-t-[var(--radius-lg)] border-b-0`;
  public readonly middleOptionClasses = `${this.optionClasses} border-b-0`;
  public readonly lastOptionClasses = `${this.optionClasses} rounded-b-[var(--radius-lg)]`;
  public readonly rangeFieldClasses = 'flex min-w-[0] flex-col gap-[0.8rem]';
  public readonly rangeControlsClasses =
    'flex min-w-[0] items-center gap-[1rem] max-[380px]:flex-col max-[380px]:items-stretch';
  public readonly numberInputClasses =
    'w-[7.2rem] flex-[0_0_7.2rem] rounded-[var(--radius-lg)] border-0 !bg-[var(--color-surface-secondary)] !text-[var(--color-text-primary)] p-[1rem] max-[380px]:w-full max-[380px]:basis-auto';
  public readonly rangeInputClasses =
    'block h-[0.8rem] min-w-[0] flex-1 cursor-pointer appearance-none rounded-[var(--radius-lg)] !bg-[var(--color-surface-secondary)] hover:!bg-[var(--color-surface-secondary-hover)] max-[380px]:w-full max-[380px]:flex-[0_0_0.8rem] [&::-moz-range-thumb]:h-[1.8rem] [&::-moz-range-thumb]:w-[1.8rem] [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:!bg-[var(--color-accent)] [&::-webkit-slider-thumb]:h-[1.8rem] [&::-webkit-slider-thumb]:w-[1.8rem] [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:!bg-[var(--color-accent)] [&::-webkit-slider-thumb]:[transition:transform_var(--transition-fast)] [&::-webkit-slider-thumb:hover]:[transform:scale(1.3)]';
  public readonly warningBannerClasses =
    'flex min-h-[5rem] items-start gap-[0.5rem] rounded-[var(--radius-md)] border-l-4 border-l-[#ff8c00] bg-[rgba(255,165,0,0.15)] p-[1rem] text-[length:var(--text-sm)] font-[var(--font-weight-medium)] text-[#d97706] [overflow-wrap:anywhere] max-[600px]:min-h-0 max-[600px]:text-[length:var(--text-xs)]';

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
