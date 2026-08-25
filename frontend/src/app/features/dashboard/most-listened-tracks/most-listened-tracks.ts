import { Component, computed, input, signal, ChangeDetectionStrategy } from '@angular/core';
import { AudioFeatures, TimeRange, TopTrack } from '@src/app/core/models/models';
import { Icon } from '@shared/components/icon/icon';
import { DASHBOARD_FULL_WIDTH_SECTION_HOST_CLASS } from '../dashboard-host-classes';
import { MostListenedTrackItem } from './most-listened-track-item/most-listened-track-item';
import { TrackAudioFeatureRow } from './most-listened-tracks.models';
import {
  buildTrackAudioFeatureRows,
  formatHiddenTracksLabel,
  getListeningPeriodLabel,
  indexAudioFeaturesBySpotifyId,
} from './most-listened-tracks.utils';

@Component({
  selector: 'app-most-listened-tracks',
  imports: [Icon, MostListenedTrackItem],
  templateUrl: './most-listened-tracks.html',
  styleUrl: './most-listened-tracks.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: {
    class: DASHBOARD_FULL_WIDTH_SECTION_HOST_CLASS,
  },
})
export class MostListenedTracks {
  private readonly collapsedItemsLimit = 5;

  public readonly tracks = input<TopTrack[]>([]);
  public readonly audioFeatures = input<AudioFeatures[]>([]);
  public readonly timeRange = input<TimeRange>('short_term');
  public readonly isLoading = input(false);
  public readonly isExpanded = signal(false);

  public readonly visibleTracks = computed(() => {
    const tracks = this.tracks();

    return this.isExpanded() ? tracks : tracks.slice(0, this.collapsedItemsLimit);
  });

  public readonly hiddenTracksCount = computed(() =>
    Math.max(this.tracks().length - this.collapsedItemsLimit, 0)
  );

  public readonly canToggleTracks = computed(() => this.hiddenTracksCount() > 0);
  public readonly toggleTracksLabel = computed(() => {
    if (this.isExpanded()) return 'Zwiń listę';

    const hiddenCount = this.hiddenTracksCount();
    return `Pokaż jeszcze ${hiddenCount} ${formatHiddenTracksLabel(hiddenCount)}`;
  });

  public readonly audioFeaturesByTrackId = computed(() =>
    indexAudioFeaturesBySpotifyId(this.audioFeatures())
  );

  public readonly periodLabel = computed(() => getListeningPeriodLabel(this.timeRange()));

  public toggleExpanded(): void {
    this.isExpanded.update((isExpanded) => !isExpanded);
  }

  public audioFeaturesFor(track: TopTrack): AudioFeatures | null {
    return this.audioFeaturesByTrackId().get(track.id) ?? null;
  }

  public audioFeatureRows(track: TopTrack): TrackAudioFeatureRow[] {
    return buildTrackAudioFeatureRows(this.audioFeaturesFor(track));
  }
}
