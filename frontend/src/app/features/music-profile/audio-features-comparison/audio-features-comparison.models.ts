import { AudioFeatureInfoKey } from '@shared/audio-features/audio-feature-info';
import { TooltipContent } from '@shared/tooltip/tooltip-content';

type AudioComparisonFeatureKey = Extract<
  AudioFeatureInfoKey,
  'energy' | 'danceability' | 'valence' | 'acousticness' | 'liveness' | 'speechiness'
>;

type AudioComparisonFeature = {
  key: AudioComparisonFeatureKey;
  label: string;
  color: string;
  tooltip: TooltipContent;
};

type AudioComparisonChartRow = {
  id: string;
  axisLabel: string;
  trackName: string;
  artists: string;
  values: Record<AudioComparisonFeatureKey, number | null>;
};

type AudioComparisonChartPoint = {
  id: string;
  x: number;
  y: number;
  value: number;
  featureLabel: string;
  formattedValue: string;
  tooltip: string;
};

type AudioComparisonChartPlot = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type AudioComparisonXAxisLabel = {
  id: string;
  label: string;
  title: string;
  x: number;
};

type AudioComparisonYAxisTick = {
  value: number;
  label: string;
  y: number;
};

type AudioComparisonFeatureToggle = {
  featureKey: AudioComparisonFeatureKey;
  checked: boolean;
};

type AudioComparisonTrackToggle = {
  trackId: string;
  checked: boolean;
};

export type {
  AudioComparisonFeatureKey,
  AudioComparisonFeature,
  AudioComparisonChartRow,
  AudioComparisonChartPoint,
  AudioComparisonChartPlot,
  AudioComparisonXAxisLabel,
  AudioComparisonYAxisTick,
  AudioComparisonFeatureToggle,
  AudioComparisonTrackToggle,
};
