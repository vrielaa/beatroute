import type {
  AnalyzableMusicMapTrack,
  AudioFeatureValues,
  MusicMapCluster,
} from "./types.js";
import { describeAudioCharacter, describeClusterName } from "./descriptions.js";
import { MUSIC_MAP_FEATURE_KEYS } from "./features.js";
import { average, round } from "./math.js";

/**
 * Grupuje przeanalizowane utwory według etykiet klastrów i tworzy ich opisy.
 *
 * @param tracks - Utwory posiadające kompletne cechy audio.
 * @param clusterLabels - Numer klastra przypisany do każdego utworu.
 * @returns Posortowane podsumowania klastrów.
 */
function buildClusterSummaries(
  tracks: AnalyzableMusicMapTrack[],
  clusterLabels: number[]
): MusicMapCluster[] {
  const tracksByCluster = new Map<number, AnalyzableMusicMapTrack[]>();

  tracks.forEach((track, index) => {
    const cluster = clusterLabels[index] ?? 0;
    const clusterTracks = tracksByCluster.get(cluster) ?? [];

    clusterTracks.push(track);
    tracksByCluster.set(cluster, clusterTracks);
  });

  return [...tracksByCluster.entries()]
    .sort(([leftCluster], [rightCluster]) => leftCluster - rightCluster)
    .map(([cluster, clusterTracks]) => {
      const audioFeatures = averageAudioFeatures(clusterTracks);

      return {
        id: cluster,
        label: describeClusterName(audioFeatures),
        description: describeAudioCharacter(audioFeatures),
        averageAudioFeatures: audioFeatures,
        tracksCount: clusterTracks.length,
        trackIds: clusterTracks.map((track) => track.id),
      };
    });
}

/**
 * Oblicza średnią wartość każdej cechy audio dla wskazanych utworów.
 *
 * @param tracks - Utwory należące do jednego klastra.
 * @returns Uśrednione i zaokrąglone cechy audio klastra.
 */
function averageAudioFeatures(
  tracks: AnalyzableMusicMapTrack[]
): AudioFeatureValues {
  return Object.fromEntries(
    MUSIC_MAP_FEATURE_KEYS.map((key) => [
      key,
      round(average(tracks.map((track) => track.audioFeatures[key]))),
    ])
  ) as AudioFeatureValues;
}

/**
 * Liczy, ile różnych klastrów rzeczywiście występuje w wyniku analizy.
 *
 * @param clusterLabels - Etykiety klastrów przypisane do utworów.
 * @returns Liczba unikalnych etykiet.
 */
function getAppliedClusterCount(clusterLabels: number[]): number {
  return new Set(clusterLabels).size;
}

export { buildClusterSummaries, getAppliedClusterCount };
