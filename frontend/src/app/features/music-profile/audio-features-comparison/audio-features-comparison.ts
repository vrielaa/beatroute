import { Component, computed, effect, input, signal } from '@angular/core';
import { AudioFeatures, TopTrack } from '@core/models/models';
import { Icon } from '@shared/components/icon/icon';

type ComparableAudioFeatureKey =
  | 'energy'
  | 'danceability'
  | 'valence'
  | 'acousticness'
  | 'liveness'
  | 'speechiness';

type ComparableAudioFeature = {
  key: ComparableAudioFeatureKey;
  label: string;
  color: string;
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
  imports: [Icon],
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
    { key: 'energy', label: 'Energia', color: '#8b5cf6' },
    { key: 'danceability', label: 'Taneczność', color: '#ec4899' },
    { key: 'valence', label: 'Nastrój', color: '#3b82f6' },
    { key: 'acousticness', label: 'Akustyczność', color: '#10b981' },
    { key: 'liveness', label: 'Live', color: '#f59e0b' },
    { key: 'speechiness', label: 'Mowa', color: '#ef4444' },
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
  public readonly hasEnoughSelectedTracks = computed(() => this.selectedFeatureRows().length >= 2);
  public readonly selectedTracksCount = computed(() => this.selectedFeatureRows().length);
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
      this.selectedFeatureKeys.set([...new Set([...selectedKeys, featureKey])]);
      return;
    }

    if (selectedKeys.length === 1) return;

    this.selectedFeatureKeys.set(selectedKeys.filter((key) => key !== featureKey));
  }

  public isFeatureSelected(featureKey: ComparableAudioFeatureKey): boolean {
    return this.selectedFeatureKeys().includes(featureKey);
  }

  public isLastSelectedFeature(featureKey: ComparableAudioFeatureKey): boolean {
    const selectedKeys = this.selectedFeatureKeys();

    return selectedKeys.length === 1 && selectedKeys[0] === featureKey;
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

  private truncateTrackName(trackName: string): string {
    const maxLength = 18;

    return trackName.length > maxLength ? `${trackName.slice(0, maxLength - 3)}...` : trackName;
  }
}
