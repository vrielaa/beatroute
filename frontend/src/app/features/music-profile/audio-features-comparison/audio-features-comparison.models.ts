import { AudioFeatureInfoKey } from '@shared/audio-features/audio-feature-info';
import { TooltipContent } from '@shared/tooltip/tooltip-content';

export type AudioComparisonFeatureKey = Extract<
  AudioFeatureInfoKey,
  'energy' | 'danceability' | 'valence' | 'acousticness' | 'liveness' | 'speechiness'
>;

export type AudioComparisonFeature = {
  key: AudioComparisonFeatureKey;
  label: string;
  color: string;
  tooltip: TooltipContent;
};

export type AudioComparisonChartRow = {
  id: string;
  axisLabel: string;
  trackName: string;
  artists: string;
  values: Record<AudioComparisonFeatureKey, number | null>;
};

export type AudioComparisonChartPoint = {
  id: string;
  x: number;
  y: number;
  value: number;
  featureLabel: string;
  formattedValue: string;
  tooltip: string;
};

export type AudioComparisonChartPlot = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type AudioComparisonXAxisLabel = {
  id: string;
  label: string;
  title: string;
  x: number;
};

export type AudioComparisonYAxisTick = {
  value: number;
  label: string;
  y: number;
};

export type AudioComparisonFeatureToggle = {
  featureKey: AudioComparisonFeatureKey;
  checked: boolean;
};

export type AudioComparisonTrackToggle = {
  trackId: string;
  checked: boolean;
};
