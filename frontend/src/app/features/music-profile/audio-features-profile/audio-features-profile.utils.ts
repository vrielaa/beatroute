import { AudioStats } from '@core/models/models';
import { AUDIO_FEATURE_INFO, AudioFeatureInfoKey } from '@shared/audio-features/audio-feature-info';

export const AUDIO_PROFILE_CHART = {
  viewBox: '0 0 520 380',
  centerX: 260,
  centerY: 205,
} as const;

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

type AudioProfilePoint = AudioProfileFeature & {
  x: number;
  y: number;
  displayValue: string;
};

export type AudioProfileChartModel = {
  features: AudioProfileFeature[];
  hasAnyFeature: boolean;
  axes: AudioProfileAxis[];
  gridPolygons: string[];
  ticks: AudioProfileTick[];
  profilePolygonPoints: string;
  profilePointMarkers: AudioProfilePoint[];
};

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

const STATS_KEYS: Record<(typeof RADAR_FEATURE_KEYS)[number], keyof AudioStats> = {
  energy: 'averageEnergy',
  danceability: 'averageDanceability',
  valence: 'averageValence',
  acousticness: 'averageAcousticness',
  liveness: 'averageLiveness',
  speechiness: 'averageSpeechiness',
};

export function buildAudioProfileChart(stats: AudioStats | null): AudioProfileChartModel {
  const features = RADAR_FEATURE_KEYS.map((key) => ({
    key,
    label: AUDIO_FEATURE_INFO[key].label,
    value: averageFeatureValue(key, stats),
  }));

  return {
    features,
    hasAnyFeature: features.some((feature) => feature.value !== null),
    axes: features.map((feature, index) => buildAxis(feature, index)),
    gridPolygons: CHART_GRID_VALUES.map(polygonPointsForValue),
    ticks: CHART_TICK_VALUES.map(buildTick),
    profilePolygonPoints: features.map(profilePoint).join(' '),
    profilePointMarkers: features.map((feature, index) => {
      const point = pointAt(angleForIndex(index), CHART_RADIUS * clampValue(feature.value ?? 0));

      return {
        ...feature,
        ...point,
        displayValue: feature.value === null ? 'Brak danych' : feature.value.toFixed(2),
      };
    }),
  };
}

function averageFeatureValue(
  key: (typeof RADAR_FEATURE_KEYS)[number],
  stats: AudioStats | null
): number | null {
  const value = stats?.[STATS_KEYS[key]];

  return typeof value === 'number' ? value : null;
}

function buildAxis(feature: AudioProfileFeature, index: number): AudioProfileAxis {
  const angle = angleForIndex(index);
  const axisEnd = pointAt(angle, CHART_RADIUS);
  const labelPoint = pointAt(angle, CHART_LABEL_RADIUS);

  return {
    ...feature,
    axisEndX: axisEnd.x,
    axisEndY: axisEnd.y,
    labelX: labelPoint.x,
    labelY: labelPoint.y,
    labelAnchor: labelAnchor(labelPoint.x),
  };
}

function buildTick(value: number): AudioProfileTick {
  return {
    value,
    label: value.toFixed(value % 1 === 0 ? 0 : 2),
    labelX: AUDIO_PROFILE_CHART.centerX + 8,
    labelY: AUDIO_PROFILE_CHART.centerY - CHART_RADIUS * value + 4,
  };
}

function profilePoint(feature: AudioProfileFeature, index: number): string {
  const point = pointAt(angleForIndex(index), CHART_RADIUS * clampValue(feature.value ?? 0));

  return `${point.x},${point.y}`;
}

function polygonPointsForValue(value: number): string {
  return RADAR_FEATURE_KEYS.map((_, index) => {
    const point = pointAt(angleForIndex(index), CHART_RADIUS * value);

    return `${point.x},${point.y}`;
  }).join(' ');
}

function pointAt(angle: number, radius: number): { x: number; y: number } {
  return {
    x: roundCoordinate(AUDIO_PROFILE_CHART.centerX + Math.cos(angle) * radius),
    y: roundCoordinate(AUDIO_PROFILE_CHART.centerY + Math.sin(angle) * radius),
  };
}

function angleForIndex(index: number): number {
  return -Math.PI / 2 + (index * 2 * Math.PI) / RADAR_FEATURE_KEYS.length;
}

function labelAnchor(labelX: number): 'start' | 'middle' | 'end' {
  if (labelX < AUDIO_PROFILE_CHART.centerX - 8) return 'end';
  if (labelX > AUDIO_PROFILE_CHART.centerX + 8) return 'start';

  return 'middle';
}

function clampValue(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function roundCoordinate(value: number): number {
  return Number(value.toFixed(2));
}
