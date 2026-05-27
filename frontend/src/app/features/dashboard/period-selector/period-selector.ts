import { Component, computed, input, output } from '@angular/core';
import { TimeRange } from '@src/app/core/models/models';

@Component({
  selector: 'app-period-selector',
  imports: [],
  templateUrl: './period-selector.html',
  styleUrl: './period-selector.scss',
})
export class PeriodSelector {
  public readonly selectedRange = input<TimeRange>('short_term');
  public readonly tracksFoundRatio = input<{ foundTracksCount: number; totalTracksCount: number } | null>(null);
  public readonly rangeChange = output<TimeRange>();

  public readonly showIncompleteWarning = computed(() => {
    const ratio = this.tracksFoundRatio();
    if (!ratio) return false;

    return ratio.totalTracksCount !== ratio.foundTracksCount;
  });



  public selectRange(e: Event): void {
    const range = (e.target as HTMLSelectElement).value as TimeRange;
    this.rangeChange.emit(range);
    console.log('Selected range:', range);
  }

  svgCalendarIconPaths = [
    'M6.66667 1.66667V5.00001',
    'M13.3333 1.66667V5.00001',
    'M15.8333 3.33333H4.16667C3.24619 3.33333 2.5 4.07952 2.5 4.99999V16.6667C2.5 17.5871 3.24619 18.3333 4.16667 18.3333H15.8333C16.7538 18.3333 17.5 17.5871 17.5 16.6667V4.99999C17.5 4.07952 16.7538 3.33333 15.8333 3.33333Z',
    'M2.5 8.33333H17.5',
  ];
}
