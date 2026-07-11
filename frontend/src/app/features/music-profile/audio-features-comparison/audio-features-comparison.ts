import { Component, computed, effect, input, signal } from '@angular/core';
import { AudioFeatures, TopTrack } from '@core/models/models';
import {
  AUDIO_FEATURE_INFO,
  audioFeatureTooltip,
} from '@shared/audio-features/audio-feature-info';
import { Icon } from '@shared/components/icon/icon';
import { AudioFeatureControls } from './audio-feature-controls/audio-feature-controls';
import { AudioFeaturesChart } from './audio-features-chart/audio-features-chart';
import {
  AudioComparisonFeature,
  AudioComparisonFeatureKey,
  AudioComparisonFeatureToggle,
  AudioComparisonChartRow,
  AudioComparisonTrackToggle,
} from './audio-features-comparison.models';
import { AudioTrackPicker } from './audio-track-picker/audio-track-picker';

@Component({
  selector: 'app-audio-features-comparison',
  imports: [AudioFeatureControls, AudioFeaturesChart, AudioTrackPicker, Icon],
  templateUrl: './audio-features-comparison.html',
  host: {
    class: 'flex w-full min-w-[0] flex-col gap-[2rem] max-[420px]:gap-[1.4rem]',
  },
})
export class AudioFeaturesComparison {
  private lastAvailableTrackIdsKey = '';
  private readonly selectedFeatureKeys = signal<AudioComparisonFeatureKey[]>([
    'energy',
    'danceability',
    'valence',
    'acousticness',
    'liveness',
  ]);
  private readonly selectAllFeaturesChecked = signal(false);
  private readonly selectedTrackIds = signal<string[] | null>(null);

  public readonly tracks = input<TopTrack[]>([]);
  public readonly audioFeatures = input<AudioFeatures[]>([]);
  public readonly isLoading = input(false);

  public readonly features: AudioComparisonFeature[] = [
    this.comparableFeature('energy', '#8b5cf6'),
    this.comparableFeature('danceability', '#ec4899'),
    this.comparableFeature('valence', '#3b82f6'),
    this.comparableFeature('acousticness', '#10b981'),
    this.comparableFeature('liveness', '#f59e0b'),
    this.comparableFeature('speechiness', '#ef4444'),
  ];

  public readonly selectedFeatures = computed(() =>
    this.features.filter((feature) => this.selectedFeatureKeys().includes(feature.key))
  );
  public readonly selectedFeatureKeyList = computed(() => this.selectedFeatureKeys());

  public readonly featureRows = computed(() => {
    const featuresByTrackId = this.audioFeaturesByTrackId();

    return this.tracks()
      .map((track, index) => {
        const features = featuresByTrackId.get(track.id);

        if (!features || features.error) {
          return null;
        }

        return {
          id: track.id,
          axisLabel: this.truncateTrackName(track.name),
          trackName: track.name,
          artists: track.artists.map((artist) => artist.name).join(', '),
          values: {
            energy: this.clampFeatureValue(features.energy),
            danceability: this.clampFeatureValue(features.danceability),
            valence: this.clampFeatureValue(features.valence),
            acousticness: this.clampFeatureValue(features.acousticness),
            liveness: this.clampFeatureValue(features.liveness),
            speechiness: this.clampFeatureValue(features.speechiness),
          },
        };
      })
      .filter((row): row is AudioComparisonChartRow => row !== null);
  });

  private readonly effectiveSelectedTrackIds = computed(
    () => this.selectedTrackIds() ?? this.featureRows().map((row) => row.id)
  );

  public readonly selectedFeatureRows = computed(() => {
    const selectedTrackIds = new Set(this.effectiveSelectedTrackIds());

    return this.featureRows().filter((row) => selectedTrackIds.has(row.id));
  });
  public readonly selectedTrackIdList = computed(() => this.effectiveSelectedTrackIds());

  public readonly hasChartData = computed(() =>
    this.hasEnoughSelectedTracks() &&
    this.selectedFeatures().some((feature) =>
      this.selectedFeatureRows().some((row) => row.values[feature.key] !== null)
    )
  );
  public readonly hasSelectedFeatures = computed(() => this.selectedFeatures().length > 0);
  public readonly isSelectAllFeaturesChecked = computed(() => this.selectAllFeaturesChecked());
  public readonly hasEnoughSelectedTracks = computed(() => this.selectedFeatureRows().length >= 2);
  public readonly selectedTracksCount = computed(() => this.selectedFeatureRows().length);
  public readonly needsSelectedFeatures = computed(
    () => this.featureRows().length > 0 && !this.hasSelectedFeatures()
  );
  public readonly needsMoreSelectedTracks = computed(
    () => this.featureRows().length > 0 && !this.hasEnoughSelectedTracks()
  );
  public readonly trackSelectionSummary = computed(
    () => `${this.selectedTracksCount()} z ${this.featureRows().length} wybranych`
  );
  public readonly subtitle = computed(() => {
    if (this.isLoading()) {
      return 'Przygotowuję porównanie najczęściej słuchanych utworów';
    }

    const tracksCount = this.featureRows().length;
    const requestedTracksCount = this.tracks().length;

    if (!tracksCount) {
      return 'Brak utworów z dostępnymi cechami audio';
    }

    return tracksCount === requestedTracksCount
      ? `Top ${tracksCount} utworów z dostępnymi cechami audio`
      : `${tracksCount} z ${requestedTracksCount} wybranych utworów ma dostępne cechy audio`;
  });

  constructor() {
    effect(() => {
      const availableTrackIdsKey = this.featureRows()
        .map((row) => row.id)
        .join('|');

      if (availableTrackIdsKey === this.lastAvailableTrackIdsKey) {
        return;
      }

      this.lastAvailableTrackIdsKey = availableTrackIdsKey;
      this.selectedTrackIds.set(null);
    });
  }

  public toggleFeature({ featureKey, checked }: AudioComparisonFeatureToggle): void {
    const selectedKeys = this.selectedFeatureKeys();

    if (checked) {
      const nextSelectedKeys = [...new Set([...selectedKeys, featureKey])];

      this.selectedFeatureKeys.set(nextSelectedKeys);
      this.selectAllFeaturesChecked.set(this.areAllFeaturesSelected(nextSelectedKeys));
      return;
    }

    this.selectedFeatureKeys.set(selectedKeys.filter((key) => key !== featureKey));
    this.selectAllFeaturesChecked.set(false);
  }

  public selectAllFeatures(): void {
    this.selectedFeatureKeys.set(this.features.map((feature) => feature.key));
  }

  public toggleSelectAllFeatures(): void {
    if (this.selectAllFeaturesChecked()) {
      return;
    }

    this.selectAllFeaturesChecked.set(true);
    this.selectAllFeatures();
  }

  public clearSelectedFeatures(): void {
    this.selectAllFeaturesChecked.set(false);
    this.selectedFeatureKeys.set([]);
  }

  private areAllFeaturesSelected(selectedKeys: AudioComparisonFeatureKey[]): boolean {
    const selectedKeysSet = new Set(selectedKeys);

    return this.features.every((feature) => selectedKeysSet.has(feature.key));
  }

  public toggleTrack({ trackId, checked }: AudioComparisonTrackToggle): void {
    const selectedTrackIds = this.effectiveSelectedTrackIds();

    if (checked) {
      this.selectedTrackIds.set([...new Set([...selectedTrackIds, trackId])]);
      return;
    }

    this.selectedTrackIds.set(selectedTrackIds.filter((selectedTrackId) => selectedTrackId !== trackId));
  }

  public selectAllTracks(): void {
    this.selectedTrackIds.set(this.featureRows().map((row) => row.id));
  }

  public clearSelectedTracks(): void {
    this.selectedTrackIds.set([]);
  }

  private audioFeaturesByTrackId(): Map<string, AudioFeatures> {
    const featuresByTrackId = new Map<string, AudioFeatures>();

    for (const features of this.audioFeatures()) {
      if (features.spotifyId) {
        featuresByTrackId.set(features.spotifyId, features);
      }

      if (features.id) {
        featuresByTrackId.set(features.id, features);
      }
    }

    return featuresByTrackId;
  }

  private clampFeatureValue(value: number | null | undefined): number | null {
    if (typeof value !== 'number') {
      return null;
    }

    return Math.min(Math.max(value, 0), 1);
  }

  private comparableFeature(key: AudioComparisonFeatureKey, color: string): AudioComparisonFeature {
    return {
      key,
      color,
      label: AUDIO_FEATURE_INFO[key].label,
      tooltip: audioFeatureTooltip(key),
    };
  }

  private truncateTrackName(trackName: string): string {
    const maxLength = 18;

    return trackName.length > maxLength ? `${trackName.slice(0, maxLength - 3)}...` : trackName;
  }
}
