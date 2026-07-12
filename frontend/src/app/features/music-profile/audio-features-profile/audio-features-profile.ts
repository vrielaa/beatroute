import { Component, computed, input } from '@angular/core';
import { AudioStats } from '@core/models/models';
import { AUDIO_FEATURE_INFO, AudioFeatureInfoKey } from '@shared/audio-features/audio-feature-info';

type AudioProfileFeature = {
  key: AudioFeatureInfoKey;
  label: string;
  value: number | null;
};

type AudioProfileAxis = AudioProfileFeature & {
  axisEndX: number;
  axisEndY: number;
  labelX: number;
  labelY: number;
  labelAnchor: 'start' | 'middle' | 'end';
};

type AudioProfileTick = {
  value: number;
  label: string;
  labelX: number;
  labelY: number;
};

const CHART_WIDTH = 520;
const CHART_HEIGHT = 380;
const CHART_CENTER_X = 260;
const CHART_CENTER_Y = 205;
const CHART_RADIUS = 118;
const CHART_LABEL_RADIUS = 154;
const CHART_GRID_VALUES = [1, 0.75, 0.5, 0.25];
const CHART_TICK_VALUES = [0.75, 0.5, 0.25, 0];
const RADAR_FEATURE_KEYS = [
  'energy',
  'danceability',
  'valence',
  'acousticness',
  'liveness',
  'speechiness',
] as const satisfies readonly AudioFeatureInfoKey[];

@Component({
  selector: 'app-audio-features-profile',
  templateUrl: './audio-features-profile.html',
  styleUrl: './audio-features-profile.scss',
  host: {
    class: 'audio-features-profile',
  },
})
export class AudioFeaturesProfile {
  public readonly audioStats = input<AudioStats | null>(null);
  public readonly isLoading = input(false);

  public readonly chartViewBox = `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`;
  public readonly centerX = CHART_CENTER_X;
  public readonly centerY = CHART_CENTER_Y;

  public readonly features = computed<AudioProfileFeature[]>(() => {
    const stats = this.audioStats();

    return RADAR_FEATURE_KEYS.map((key) => ({
      key,
      label: AUDIO_FEATURE_INFO[key].label,
      value: this.averageFeatureValue(key, stats),
    }));
  });

  public readonly hasAnyFeature = computed(() =>
    this.features().some((feature) => feature.value !== null)
  );

  public readonly axes = computed<AudioProfileAxis[]>(() =>
    this.features().map((feature, index) => {
      const angle = this.angleForIndex(index);
      const axisEnd = this.pointAt(angle, CHART_RADIUS);
      const labelPoint = this.pointAt(angle, CHART_LABEL_RADIUS);

      return {
        ...feature,
        axisEndX: axisEnd.x,
        axisEndY: axisEnd.y,
        labelX: labelPoint.x,
        labelY: labelPoint.y,
        labelAnchor: this.labelAnchor(labelPoint.x),
      };
    })
  );

  public readonly gridPolygons = computed(() =>
    CHART_GRID_VALUES.map((value) => this.polygonPointsForValue(value))
  );

  public readonly ticks = computed<AudioProfileTick[]>(() =>
    CHART_TICK_VALUES.map((value) => ({
      value,
      label: this.formatTickValue(value),
      labelX: CHART_CENTER_X + 8,
      labelY: CHART_CENTER_Y - CHART_RADIUS * value + 4,
    }))
  );

  public readonly profilePolygonPoints = computed(() =>
    this.features()
      .map((feature, index) => {
        const value = feature.value ?? 0;
        const point = this.pointAt(
          this.angleForIndex(index),
          CHART_RADIUS * this.clampValue(value)
        );

        return `${point.x},${point.y}`;
      })
      .join(' ')
  );

  public readonly profilePointMarkers = computed(() =>
    this.features().map((feature, index) => {
      const value = feature.value ?? 0;
      const point = this.pointAt(this.angleForIndex(index), CHART_RADIUS * this.clampValue(value));

      return {
        ...feature,
        x: point.x,
        y: point.y,
        displayValue: feature.value === null ? 'Brak danych' : feature.value.toFixed(2),
      };
    })
  );

  private averageFeatureValue(key: AudioFeatureInfoKey, stats: AudioStats | null): number | null {
    switch (key) {
      case 'energy':
        return stats?.averageEnergy ?? null;
      case 'danceability':
        return stats?.averageDanceability ?? null;
      case 'valence':
        return stats?.averageValence ?? null;
      case 'acousticness':
        return stats?.averageAcousticness ?? null;
      case 'liveness':
        return stats?.averageLiveness ?? null;
      case 'speechiness':
        return stats?.averageSpeechiness ?? null;
      default:
        return null;
    }
  }

  private polygonPointsForValue(value: number): string {
    return RADAR_FEATURE_KEYS.map((_, index) => {
      const point = this.pointAt(this.angleForIndex(index), CHART_RADIUS * value);

      return `${point.x},${point.y}`;
    }).join(' ');
  }

  private pointAt(angle: number, radius: number): { x: number; y: number } {
    return {
      x: this.roundCoordinate(CHART_CENTER_X + Math.cos(angle) * radius),
      y: this.roundCoordinate(CHART_CENTER_Y + Math.sin(angle) * radius),
    };
  }

  private angleForIndex(index: number): number {
    return -Math.PI / 2 + (index * 2 * Math.PI) / RADAR_FEATURE_KEYS.length;
  }

  private labelAnchor(labelX: number): 'start' | 'middle' | 'end' {
    if (labelX < CHART_CENTER_X - 8) {
      return 'end';
    }

    if (labelX > CHART_CENTER_X + 8) {
      return 'start';
    }

    return 'middle';
  }

  private clampValue(value: number): number {
    return Math.min(Math.max(value, 0), 1);
  }

  private formatTickValue(value: number): string {
    return value.toFixed(value % 1 === 0 ? 0 : 2);
  }

  private roundCoordinate(value: number): number {
    return Number(value.toFixed(2));
  }
}
