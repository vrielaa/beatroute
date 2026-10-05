import type {
  TrackAudioFeatures,
  TrackAudioFeaturesResult,
  TrackAudioStats,
} from "./types.js";

/** Oblicza średnią arytmetyczną lub zwraca `null` dla pustego zbioru. */
function average(values: number[]): number | null {
  if (!values.length) {
    return null;
  }

  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

/** Zaokrągla liczbę, zachowując `null` oznaczający brak wyniku. */
function roundIfNumber(value: number | null, digits = 2): number | null {
  if (value === null) {
    return null;
  }

  return Number(value.toFixed(digits));
}

/** Wyznacza najczęściej występującą wartość lub `null` dla pustego zbioru. */
function mode(values: number[]): number | null {
  if (!values.length) {
    return null;
  }

  const counts = new Map<number, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  let mostFrequentValue: number | null = null;
  let highestCount = -1;

  for (const [value, count] of counts.entries()) {
    if (count > highestCount) {
      mostFrequentValue = value;
      highestCount = count;
    }
  }

  return mostFrequentValue;
}

/** Zamienia udział elementów na zaokrągloną wartość procentową. */
function percentage(count: number, total: number): number {
  if (!total) {
    return 0;
  }

  return Math.round((count / total) * 100);
}

/** Sprawdza, czy wynik zawiera cechy audio zamiast opisu błędu. */
function hasAudioFeatures(
  result: TrackAudioFeaturesResult
): result is TrackAudioFeatures {
  return !("error" in result);
}

/**
 * Oblicza zbiorcze statystyki dla poprawnie pobranych cech audio.
 * Nieudane odczyty są pomijane, a brak pojedynczej wartości nie wpływa na
 * statystykę pozostałych wartości tej cechy.
 *
 * @param results - Niezależne od dostawcy wyniki odczytu cech utworów.
 * @returns Średnie, dominanty, liczności i udziały procentowe.
 */
function calculateAudioStats(
  results: TrackAudioFeaturesResult[]
): TrackAudioStats {
  const tracks = results.filter(hasAudioFeatures);
  const tempos = tracks
    .map((track) => track.tempo)
    .filter((value): value is number => typeof value === "number");
  const energies = tracks
    .map((track) => track.energy)
    .filter((value): value is number => typeof value === "number");
  const danceabilities = tracks
    .map((track) => track.danceability)
    .filter((value): value is number => typeof value === "number");
  const valences = tracks
    .map((track) => track.valence)
    .filter((value): value is number => typeof value === "number");
  const acousticnesses = tracks
    .map((track) => track.acousticness)
    .filter((value): value is number => typeof value === "number");
  const instrumentalnesses = tracks
    .map((track) => track.instrumentalness)
    .filter((value): value is number => typeof value === "number");
  const livenesses = tracks
    .map((track) => track.liveness)
    .filter((value): value is number => typeof value === "number");
  const speechinesses = tracks
    .map((track) => track.speechiness)
    .filter((value): value is number => typeof value === "number");
  const loudnesses = tracks
    .map((track) => track.loudness)
    .filter((value): value is number => typeof value === "number");
  const keys = tracks
    .map((track) => track.key)
    .filter(
      (value): value is number => typeof value === "number" && value >= 0
    );
  const modes = tracks
    .map((track) => track.mode)
    .filter((value): value is number => value === 0 || value === 1);
  const timeSignatures = tracks
    .map((track) => track.timeSignature)
    .filter((value): value is number => typeof value === "number");

  const liveTracksCount = tracks.filter(
    (track) => typeof track.liveness === "number" && track.liveness > 0.8
  ).length;
  const instrumentalTracksCount = tracks.filter(
    (track) =>
      typeof track.instrumentalness === "number" && track.instrumentalness > 0.5
  ).length;
  const speechHeavyTracksCount = tracks.filter(
    (track) => typeof track.speechiness === "number" && track.speechiness > 0.66
  ).length;
  const majorCount = modes.filter((value) => value === 1).length;
  const minorCount = modes.filter((value) => value === 0).length;

  return {
    trackCount: tracks.length,
    averageBpm: roundIfNumber(average(tempos), 0),
    averageEnergy: roundIfNumber(average(energies)),
    averageDanceability: roundIfNumber(average(danceabilities)),
    averageValence: roundIfNumber(average(valences)),
    averageAcousticness: roundIfNumber(average(acousticnesses)),
    averageInstrumentalness: roundIfNumber(average(instrumentalnesses)),
    averageLiveness: roundIfNumber(average(livenesses)),
    averageSpeechiness: roundIfNumber(average(speechinesses)),
    averageLoudness: roundIfNumber(average(loudnesses)),
    dominantKey: mode(keys),
    dominantMode: mode(modes),
    dominantTimeSignature: mode(timeSignatures),
    majorPercentage: percentage(majorCount, modes.length),
    minorPercentage: percentage(minorCount, modes.length),
    liveTrackPercentage: percentage(liveTracksCount, tracks.length),
    instrumentalTrackPercentage: percentage(
      instrumentalTracksCount,
      tracks.length
    ),
    speechHeavyTrackPercentage: percentage(
      speechHeavyTracksCount,
      tracks.length
    ),
  };
}

export { calculateAudioStats };
