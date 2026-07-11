import { Component, computed, effect, input, signal } from '@angular/core';
import { AudioFeatures, TopTrack } from '@core/models/models';
import {
  AUDIO_FEATURE_INFO,
  AudioFeatureInfoKey,
  audioFeatureTooltip,
} from '@shared/audio-features/audio-feature-info';
import { Icon } from '@shared/components/icon/icon';
import { Tooltip } from '@shared/components/tooltip/tooltip';
import { TooltipContent } from '@shared/tooltip/tooltip-content';

type ComparableAudioFeatureKey = Extract<
  AudioFeatureInfoKey,
  'energy' | 'danceability' | 'valence' | 'acousticness' | 'liveness' | 'speechiness'
>;

type ComparableAudioFeature = {
  key: ComparableAudioFeatureKey;
  label: string;
  color: string;
  tooltip: TooltipContent;
};

type ChartRow = {
  id: string;
  axisLabel: string;
  trackName: string;
  artists: string;
  values: Record<ComparableAudioFeatureKey, number | null>;
};

type ChartPoint = {
  id: string;
  x: number;
  y: number;
  value: number;
  tooltip: string;
};

const CHART_WIDTH = 1000;
const CHART_HEIGHT = 360;
const CHART_PADDING = {
  top: 16,
  right: 24,
  bottom: 104,
  left: 52,
} as const;
const CHART_TICKS = [1, 0.75, 0.5, 0.25, 0];

@Component({
  selector: 'app-audio-features-comparison',
  imports: [Icon, Tooltip],
  templateUrl: './audio-features-comparison.html',
  host: {
    class: 'flex w-full min-w-[0] flex-col gap-[2rem] max-[420px]:gap-[1.4rem]',
  },
})
export class AudioFeaturesComparison {
  private readonly maxChartTracks = 10;
  private lastAvailableTrackIdsKey = '';
  private readonly selectedFeatureKeys = signal<ComparableAudioFeatureKey[]>([
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

  public readonly chartViewBox = `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`;
  public readonly chartPlot = {
    left: CHART_PADDING.left,
    top: CHART_PADDING.top,
    width: CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right,
    height: CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom,
  };

  public readonly features: ComparableAudioFeature[] = [
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

  public readonly featureRows = computed(() => {
    const featuresByTrackId = this.audioFeaturesByTrackId();

    return this.tracks()
      .slice(0, this.maxChartTracks)
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
      .filter((row): row is ChartRow => row !== null);
  });

  private readonly effectiveSelectedTrackIds = computed(
    () => this.selectedTrackIds() ?? this.featureRows().map((row) => row.id)
  );

  public readonly selectedFeatureRows = computed(() => {
    const selectedTrackIds = new Set(this.effectiveSelectedTrackIds());

    return this.featureRows().filter((row) => selectedTrackIds.has(row.id));
  });

  public readonly xAxisLabels = computed(() => {
    const rows = this.selectedFeatureRows();

    return rows.map((row, index) => ({
      id: row.id,
      label: row.axisLabel,
      title: `${row.trackName} - ${row.artists}`,
      x: this.chartX(index, rows.length),
    }));
  });

  public readonly yAxisTicks = CHART_TICKS.map((value) => ({
    value,
    label: value.toFixed(value % 1 === 0 ? 0 : 2),
    y: this.chartY(value),
  }));

  public readonly hasChartData = computed(() =>
    this.hasEnoughSelectedTracks() &&
    this.selectedFeatures().some((feature) => this.seriesPoints(feature.key).length > 0)
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

    return tracksCount
      ? `Top ${tracksCount} utworów z dostępnymi cechami audio`
      : 'Brak utworów z dostępnymi cechami audio';
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

  public toggleFeature(featureKey: ComparableAudioFeatureKey, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
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

  public isFeatureSelected(featureKey: ComparableAudioFeatureKey): boolean {
    return this.selectedFeatureKeys().includes(featureKey);
  }

  public selectAllFeatures(): void {
    this.selectedFeatureKeys.set(this.features.map((feature) => feature.key));
  }

  public toggleSelectAllFeatures(event: Event): void {
    event.preventDefault();

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

  private areAllFeaturesSelected(selectedKeys: ComparableAudioFeatureKey[]): boolean {
    const selectedKeysSet = new Set(selectedKeys);

    return this.features.every((feature) => selectedKeysSet.has(feature.key));
  }

  public toggleTrack(trackId: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const selectedTrackIds = this.effectiveSelectedTrackIds();

    if (checked) {
      this.selectedTrackIds.set([...new Set([...selectedTrackIds, trackId])]);
      return;
    }

    this.selectedTrackIds.set(selectedTrackIds.filter((selectedTrackId) => selectedTrackId !== trackId));
  }

  public isTrackSelected(trackId: string): boolean {
    return this.effectiveSelectedTrackIds().includes(trackId);
  }

  public selectAllTracks(): void {
    this.selectedTrackIds.set(this.featureRows().map((row) => row.id));
  }

  public clearSelectedTracks(): void {
    this.selectedTrackIds.set([]);
  }

  public seriesPoints(featureKey: ComparableAudioFeatureKey): ChartPoint[] {
    const rows = this.selectedFeatureRows();

    return rows.reduce<ChartPoint[]>((points, row, index) => {
      const value = row.values[featureKey];

      if (value === null) {
        return points;
      }

      points.push({
        id: `${featureKey}-${row.id}`,
        x: this.chartX(index, rows.length),
        y: this.chartY(value),
        value,
        tooltip: `${row.trackName} - ${row.artists}, ${this.featureLabel(featureKey)} ${value.toFixed(2)}`,
      });

      return points;
    }, []);
  }

  public polylinePoints(featureKey: ComparableAudioFeatureKey): string {
    return this.seriesPoints(featureKey)
      .map((point) => `${point.x},${point.y}`)
      .join(' ');
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

  private chartX(index: number, total: number): number {
    if (total <= 1) {
      return this.chartPlot.left + this.chartPlot.width / 2;
    }

    return this.chartPlot.left + (index / (total - 1)) * this.chartPlot.width;
  }

  private chartY(value: number): number {
    return this.chartPlot.top + (1 - value) * this.chartPlot.height;
  }

  private clampFeatureValue(value: number | null | undefined): number | null {
    if (typeof value !== 'number') {
      return null;
    }

    return Math.min(Math.max(value, 0), 1);
  }

  private featureLabel(featureKey: ComparableAudioFeatureKey): string {
    return this.features.find((feature) => feature.key === featureKey)?.label ?? featureKey;
  }

  private comparableFeature(key: ComparableAudioFeatureKey, color: string): ComparableAudioFeature {
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
