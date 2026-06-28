import { Injectable, signal } from '@angular/core';
import { TimeRange } from '@core/models/models';

@Injectable({
  providedIn: 'root',
})
export class AnalysisFiltersStore {
  public readonly selectedTimeRange = signal<TimeRange>('short_term');
  public readonly selectedTracksRange = signal(10);
  public readonly selectedArtistsRange = signal(10);

  public setTimeRange(timeRange: TimeRange): void {
    this.selectedTimeRange.set(timeRange);
  }

  public setTracksRange(tracksRange: number): void {
    this.selectedTracksRange.set(tracksRange);
  }

  public setArtistsRange(artistsRange: number): void {
    this.selectedArtistsRange.set(artistsRange);
  }
}
