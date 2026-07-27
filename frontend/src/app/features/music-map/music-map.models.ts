import { MusicMapCluster, MusicMapPoint } from '@core/models/models';

export type MusicMapAxisTick = {
  value: number;
  label: string;
  x: number;
  y: number;
};

export type MusicMapClusterMetric = {
  label: string;
  value: string;
};

export type MusicMapClusterDetail = {
  cluster: MusicMapCluster;
  points: MusicMapPoint[];
  metrics: MusicMapClusterMetric[];
};

export const MUSIC_MAP_CLUSTER_COLORS = [
  '#ef4444',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#a855f7',
];
