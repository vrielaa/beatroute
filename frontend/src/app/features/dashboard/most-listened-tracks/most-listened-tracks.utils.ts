import { AudioFeatures, TimeRange } from '@core/models/models';
import {
  AUDIO_FEATURE_INFO,
  AudioFeatureInfoKey,
  audioFeatureTooltip,
} from '@shared/audio-features/audio-feature-info';
import { TrackAudioFeatureRow } from './most-listened-tracks.models';

const KEY_NAMES = ['C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F', 'F#/Gb', 'G', 'G#/Ab', 'A', 'A#/Bb', 'B'];

const PERIOD_LABELS: Record<TimeRange, string> = {
  short_term: 'ostatniego miesiąca',
  medium_term: 'ostatnich 6 miesięcy',
  long_term: 'ostatniego roku',
};

function indexAudioFeaturesBySpotifyId(audioFeatures: AudioFeatures[]): Map<string, AudioFeatures> {
  return new Map(
    audioFeatures
      .filter((features): features is AudioFeatures & { spotifyId: string } =>
        Boolean(features.spotifyId)
      )
      .map((features) => [features.spotifyId, features])
  );
}

function buildTrackAudioFeatureRows(features: AudioFeatures | null): TrackAudioFeatureRow[] {
  if (!features || features.error) return [];

  return [
    featureRow('tempo', formatNumber(features.tempo, 0, ' BPM')),
    featureRow('energy', formatNumber(features.energy, 2)),
    featureRow('danceability', formatNumber(features.danceability, 2)),
    featureRow('valence', formatNumber(features.valence, 2)),
    featureRow('acousticness', formatNumber(features.acousticness, 2)),
    featureRow('instrumentalness', formatNumber(features.instrumentalness, 2)),
    featureRow('liveness', formatNumber(features.liveness, 2)),
    featureRow('speechiness', formatNumber(features.speechiness, 2)),
    featureRow('loudness', formatNumber(features.loudness, 1, ' dB')),
    featureRow('key', formatKey(features.key)),
    featureRow('mode', formatMode(features.mode)),
    featureRow('timeSignature', formatTimeSignature(features.timeSignature)),
  ];
}

function getListeningPeriodLabel(timeRange: TimeRange): string {
  return PERIOD_LABELS[timeRange];
}

function formatHiddenTracksLabel(count: number): string {
  if (count === 1) return 'utwór';
  if (count > 1 && count < 5) return 'utwory';

  return 'utworów';
}

function featureRow(key: AudioFeatureInfoKey, value: string): TrackAudioFeatureRow {
  return {
    key,
    label: AUDIO_FEATURE_INFO[key].label,
    value,
    tooltip: audioFeatureTooltip(key),
  };
}

function formatNumber(value: number | null | undefined, decimals: number, unit = ''): string {
  return typeof value === 'number' ? `${value.toFixed(decimals)}${unit}` : 'Brak danych';
}

function formatKey(value: number | null | undefined): string {
  return typeof value === 'number' && value >= 0
    ? KEY_NAMES[value] ?? 'Brak danych'
    : 'Brak danych';
}

function formatMode(value: number | null | undefined): string {
  if (value === 1) return 'Durowy';
  if (value === 0) return 'Molowy';

  return 'Brak danych';
}

function formatTimeSignature(value: number | null | undefined): string {
  return typeof value === 'number' ? `${value}/4` : 'Brak danych';
}

export {
  indexAudioFeaturesBySpotifyId,
  buildTrackAudioFeatureRows,
  getListeningPeriodLabel,
  formatHiddenTracksLabel,
};
