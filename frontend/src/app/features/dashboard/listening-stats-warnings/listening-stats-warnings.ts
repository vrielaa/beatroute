import { Component, computed, input } from '@angular/core';
import { TimeRange } from '@core/models/models';

@Component({
  selector: 'app-listening-stats-warnings',
  templateUrl: './listening-stats-warnings.html',
  host: {
    class: 'contents',
  },
})
export class ListeningStatsWarnings {
  public readonly selectedTimeRange = input<TimeRange>('short_term');
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
}
