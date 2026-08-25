import { AudioFeatures, TopTrack } from '@core/models/models';
import { AUDIO_FEATURE_INFO, audioFeatureTooltip } from '@shared/audio-features/audio-feature-info';
import {
  AudioComparisonChartRow,
  AudioComparisonFeature,
  AudioComparisonFeatureKey,
} from './audio-features-comparison.models';

const FEATURE_DEFINITIONS: ReadonlyArray<{
  key: AudioComparisonFeatureKey;
  color: string;
}> = [
  { key: 'energy', color: '#8b5cf6' },
  { key: 'danceability', color: '#ec4899' },
  { key: 'valence', color: '#3b82f6' },
  { key: 'acousticness', color: '#10b981' },
  { key: 'liveness', color: '#f59e0b' },
  { key: 'speechiness', color: '#ef4444' },
];

export function createAudioComparisonFeatures(): AudioComparisonFeature[] {
  return FEATURE_DEFINITIONS.map(({ key, color }) => ({
    key,
    color,
    label: AUDIO_FEATURE_INFO[key].label,
    tooltip: audioFeatureTooltip(key),
  }));
}

export function buildAudioComparisonRows(
  tracks: TopTrack[],
  audioFeatures: AudioFeatures[]
): AudioComparisonChartRow[] {
  const featuresByTrackId = indexAudioFeaturesByTrackId(audioFeatures);

  return tracks.flatMap((track) => {
    const features = featuresByTrackId.get(track.id);

    if (!features || features.error) {
      return [];
    }

    return [
      {
        id: track.id,
        axisLabel: truncateTrackName(track.name),
        trackName: track.name,
        artists: track.artists.map((artist) => artist.name).join(', '),
        values: {
          energy: clampFeatureValue(features.energy),
          danceability: clampFeatureValue(features.danceability),
          valence: clampFeatureValue(features.valence),
          acousticness: clampFeatureValue(features.acousticness),
          liveness: clampFeatureValue(features.liveness),
          speechiness: clampFeatureValue(features.speechiness),
        },
      },
    ];
  });
}

export function areAllComparisonFeaturesSelected(
  features: AudioComparisonFeature[],
  selectedKeys: AudioComparisonFeatureKey[]
): boolean {
  const selectedKeysSet = new Set(selectedKeys);

  return features.every((feature) => selectedKeysSet.has(feature.key));
}

export function getAudioComparisonSubtitle({
  isLoading,
  availableTracksCount,
  requestedTracksCount,
}: {
  isLoading: boolean;
  availableTracksCount: number;
  requestedTracksCount: number;
}): string {
  if (isLoading) {
    return 'Przygotowuję porównanie najczęściej słuchanych utworów';
  }

  if (!availableTracksCount) {
    return 'Brak utworów z dostępnymi cechami audio';
  }

  return availableTracksCount === requestedTracksCount
    ? `Top ${availableTracksCount} utworów z dostępnymi cechami audio`
    : `${availableTracksCount} z ${requestedTracksCount} wybranych utworów ma dostępne cechy audio`;
}

function indexAudioFeaturesByTrackId(audioFeatures: AudioFeatures[]): Map<string, AudioFeatures> {
  const featuresByTrackId = new Map<string, AudioFeatures>();

  for (const features of audioFeatures) {
    if (features.spotifyId) {
      featuresByTrackId.set(features.spotifyId, features);
    }

    if (features.id) {
      featuresByTrackId.set(features.id, features);
    }
  }

  return featuresByTrackId;
}

function clampFeatureValue(value: number | null | undefined): number | null {
  return typeof value === 'number' ? Math.min(Math.max(value, 0), 1) : null;
}

function truncateTrackName(trackName: string): string {
  const maxLength = 18;

  return trackName.length > maxLength ? `${trackName.slice(0, maxLength - 3)}...` : trackName;
}
