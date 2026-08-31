import { Component, computed, effect, input, signal, ChangeDetectionStrategy } from '@angular/core';
import { AudioFeatures, TopTrack } from '@core/models/models';
import { Icon } from '@shared/components/icon/icon';
import { AudioFeatureControls } from './audio-feature-controls/audio-feature-controls';
import { AudioFeaturesChart } from './audio-features-chart/audio-features-chart';
import {
  AudioComparisonFeature,
  AudioComparisonFeatureKey,
  AudioComparisonFeatureToggle,
  AudioComparisonTrackToggle,
} from './audio-features-comparison.models';
import { AudioTrackPicker } from './audio-track-picker/audio-track-picker';
import {
  areAllComparisonFeaturesSelected,
  buildAudioComparisonRows,
  createAudioComparisonFeatures,
  getAudioComparisonSubtitle,
} from './audio-features-comparison.utils';

@Component({
  selector: 'app-audio-features-comparison',
  imports: [AudioFeatureControls, AudioFeaturesChart, AudioTrackPicker, Icon],
  templateUrl: './audio-features-comparison.html',
  styleUrl: './audio-features-comparison.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: {
    class: 'audio-features-comparison',
  },
})
class AudioFeaturesComparison {
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

  public readonly features: AudioComparisonFeature[] = createAudioComparisonFeatures();

  public readonly selectedFeatures = computed(() =>
    this.features.filter((feature) => this.selectedFeatureKeys().includes(feature.key))
  );
  public readonly selectedFeatureKeyList = computed(() => this.selectedFeatureKeys());

  public readonly featureRows = computed(() =>
    buildAudioComparisonRows(this.tracks(), this.audioFeatures())
  );

  private readonly effectiveSelectedTrackIds = computed(
    () => this.selectedTrackIds() ?? this.featureRows().map((row) => row.id)
  );

  public readonly selectedFeatureRows = computed(() => {
    const selectedTrackIds = new Set(this.effectiveSelectedTrackIds());

    return this.featureRows().filter((row) => selectedTrackIds.has(row.id));
  });
  public readonly selectedTrackIdList = computed(() => this.effectiveSelectedTrackIds());

  public readonly hasChartData = computed(
    () =>
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
  public readonly subtitle = computed(() =>
    getAudioComparisonSubtitle({
      isLoading: this.isLoading(),
      availableTracksCount: this.featureRows().length,
      requestedTracksCount: this.tracks().length,
    })
  );

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
      this.selectAllFeaturesChecked.set(
        areAllComparisonFeaturesSelected(this.features, nextSelectedKeys)
      );
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

  public toggleTrack({ trackId, checked }: AudioComparisonTrackToggle): void {
    const selectedTrackIds = this.effectiveSelectedTrackIds();

    if (checked) {
      this.selectedTrackIds.set([...new Set([...selectedTrackIds, trackId])]);
      return;
    }

    this.selectedTrackIds.set(
      selectedTrackIds.filter((selectedTrackId) => selectedTrackId !== trackId)
    );
  }

  public selectAllTracks(): void {
    this.selectedTrackIds.set(this.featureRows().map((row) => row.id));
  }

  public clearSelectedTracks(): void {
    this.selectedTrackIds.set([]);
  }
}

export { AudioFeaturesComparison };
