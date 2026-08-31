import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { TimeRange } from '@core/models/models';
import { ListeningStatsFilters } from '@features/dashboard/listening-stats-filters/listening-stats-filters';

@Component({
  selector: 'app-analysis-filters-drawer',
  imports: [ListeningStatsFilters],
  templateUrl: './analysis-filters-drawer.html',
  styleUrl: './analysis-filters-drawer.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: {
    class: 'analysis-filters-drawer-host',
  },
})
class AnalysisFiltersDrawer {
  public readonly isOpen = input(false);
  public readonly selectedTimeRange = input<TimeRange>('short_term');
  public readonly selectedTracksRange = input(10);
  public readonly selectedArtistsRange = input(10);

  public readonly close = output<void>();
  public readonly timeRangeChange = output<TimeRange>();
  public readonly selectedTracksRangeChange = output<number>();
  public readonly selectedArtistsRangeChange = output<number>();
}

export { AnalysisFiltersDrawer };
