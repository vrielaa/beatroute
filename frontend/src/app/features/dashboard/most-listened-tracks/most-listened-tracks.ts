import { Component, computed, input, signal } from '@angular/core';
import { AudioFeatures, TimeRange, TopTrack } from '@src/app/core/models/models';
import {
  AUDIO_FEATURE_INFO,
  AudioFeatureInfoKey,
  audioFeatureTooltip,
} from '@shared/audio-features/audio-feature-info';
import { Icon } from '@shared/components/icon/icon';
import { DASHBOARD_FULL_WIDTH_SECTION_HOST_CLASS } from '../dashboard-host-classes';
import { MostListenedTrackItem } from './most-listened-track-item/most-listened-track-item';
import { TrackAudioFeatureRow } from './most-listened-tracks.models';

@Component({
  selector: 'app-most-listened-tracks',
  imports: [Icon, MostListenedTrackItem],
  templateUrl: './most-listened-tracks.html',
  styleUrl: './most-listened-tracks.scss',
  host: {
    class: DASHBOARD_FULL_WIDTH_SECTION_HOST_CLASS,
  },
})
export class MostListenedTracks {
  private readonly collapsedItemsLimit = 5;
  private readonly keyNames = ['C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F', 'F#/Gb', 'G', 'G#/Ab', 'A', 'A#/Bb', 'B'];

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
    return `Pokaż jeszcze ${hiddenCount} ${this.formatTrackCount(hiddenCount)}`;
  });

  public readonly audioFeaturesByTrackId = computed(() => {
    const featuresByTrackId = new Map<string, AudioFeatures>();

    for (const features of this.audioFeatures()) {
      if (features.spotifyId) {
        featuresByTrackId.set(features.spotifyId, features);
      }
    }

    return featuresByTrackId;
  });

  public readonly periodLabel = computed(() => {
    const labels: Record<TimeRange, string> = {
      short_term: 'ostatniego miesiąca',
      medium_term: 'ostatnich 6 miesięcy',
      long_term: 'ostatniego roku',
    };

    return labels[this.timeRange()];
  });

  public toggleExpanded(): void {
    this.isExpanded.update((isExpanded) => !isExpanded);
  }

  public audioFeaturesFor(track: TopTrack): AudioFeatures | null {
    return this.audioFeaturesByTrackId().get(track.id) ?? null;
  }

  public audioFeatureRows(track: TopTrack): TrackAudioFeatureRow[] {
    const features = this.audioFeaturesFor(track);

    if (!features || features.error) {
      return [];
    }

    return [
      this.audioFeatureRow('tempo', this.formatNumber(features.tempo, 0, ' BPM')),
      this.audioFeatureRow('energy', this.formatNumber(features.energy, 2)),
      this.audioFeatureRow('danceability', this.formatNumber(features.danceability, 2)),
      this.audioFeatureRow('valence', this.formatNumber(features.valence, 2)),
      this.audioFeatureRow('acousticness', this.formatNumber(features.acousticness, 2)),
      this.audioFeatureRow('instrumentalness', this.formatNumber(features.instrumentalness, 2)),
      this.audioFeatureRow('liveness', this.formatNumber(features.liveness, 2)),
      this.audioFeatureRow('speechiness', this.formatNumber(features.speechiness, 2)),
      this.audioFeatureRow('loudness', this.formatNumber(features.loudness, 1, ' dB')),
      this.audioFeatureRow('key', this.formatKey(features.key)),
      this.audioFeatureRow('mode', this.formatMode(features.mode)),
      this.audioFeatureRow('timeSignature', this.formatTimeSignature(features.timeSignature)),
    ];
  }

  private audioFeatureRow(key: AudioFeatureInfoKey, value: string): TrackAudioFeatureRow {
    return {
      key,
      label: AUDIO_FEATURE_INFO[key].label,
      value,
      tooltip: audioFeatureTooltip(key),
    };
  }

  private formatNumber(value: number | null | undefined, decimals: number, unit = ''): string {
    return typeof value === 'number' ? `${value.toFixed(decimals)}${unit}` : 'Brak danych';
  }

  private formatKey(value: number | null | undefined): string {
    if (typeof value !== 'number' || value < 0) {
      return 'Brak danych';
    }

    return this.keyNames[value] ?? 'Brak danych';
  }

  private formatMode(value: number | null | undefined): string {
    if (value === 1) return 'Durowy';
    if (value === 0) return 'Molowy';

    return 'Brak danych';
  }

  private formatTimeSignature(value: number | null | undefined): string {
    return typeof value === 'number' ? `${value}/4` : 'Brak danych';
  }

  private formatTrackCount(count: number): string {
    if (count === 1) return 'utwór';
    if (count > 1 && count < 5) return 'utwory';

    return 'utworów';
  }
}
