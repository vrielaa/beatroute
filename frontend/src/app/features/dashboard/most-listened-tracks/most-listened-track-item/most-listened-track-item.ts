import { Component, computed, input } from '@angular/core';
import { TopTrack } from '@core/models/models';
import { Tooltip } from '@shared/components/tooltip/tooltip';
import { TrackAudioFeatureRow } from '../most-listened-tracks.models';

@Component({
  selector: 'app-most-listened-track-item',
  imports: [Tooltip],
  templateUrl: './most-listened-track-item.html',
  host: {
    class: 'most-listened-track-item',
  },
})
export class MostListenedTrackItem {
  public readonly track = input.required<TopTrack>();
  public readonly index = input.required<number>();
  public readonly featureRows = input.required<TrackAudioFeatureRow[]>();

  public readonly artistNames = computed(() =>
    this.track()
      .artists.map((artist) => artist.name)
      .join(', ')
  );
  public readonly hasAudioFeatures = computed(() => this.featureRows().length > 0);
}
