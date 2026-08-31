import type {
  ReccoBeatsTrackAudioFeaturesResult,
  ReccoBeatsTrackAudioFeatures,
  AudioStats,
} from "./reccobeats.types.js";

/**
 * Oblicza średnią arytmetyczną wartości liczbowych.
 *
 * @param values - Wartości uwzględniane w obliczeniu.
 * @returns Średnia albo `null` dla pustej tablicy.
 */
function average(values: number[]) {
  if (!values.length) {
    return null;
  }

  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

/**
 * Zaokrągla liczbę do wskazanej liczby miejsc po przecinku.
 *
 * @param value - Liczba do zaokrąglenia albo `null`.
 * @param digits - Liczba miejsc po przecinku.
 * @returns Zaokrąglona liczba albo `null`.
 */
function roundIfNumber(value: number | null, digits = 2) {
  if (typeof value !== "number") {
    return null;
  }

  return Number(value.toFixed(digits));
}

/**
 * Wyznacza najczęściej występującą wartość w zbiorze.
 *
 * @param values - Wartości uwzględniane podczas liczenia wystąpień.
 * @returns Dominanta albo `null` dla pustej tablicy.
 */
function mode(values: unknown[]) {
  if (!values.length) {
    return null;
  }

  const counts = new Map();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  let bestValue = null;
  let bestCount = -1;

  for (const [value, count] of counts.entries()) {
    if (count > bestCount) {
      bestValue = value;
      bestCount = count;
    }
  }

  return bestValue;
}

/**
 * Zamienia udział elementów na zaokrągloną wartość procentową.
 *
 * @param count - Liczba elementów spełniających warunek.
 * @param total - Łączna liczba analizowanych elementów.
 * @returns Procent w zakresie od 0 do 100; `0`, gdy zbiór jest pusty.
 */
function percentage(count: number, total: number) {
  if (!total) {
    return 0;
  }

  return Math.round((count / total) * 100);
}

/**
 * Oblicza zbiorcze statystyki cech audio dla poprawnie pobranych utworów.
 * Wyniki błędów są pomijane, a brak wartości danej cechy nie wpływa na jej
 * średnią, dominantę ani klasyfikację progową.
 *
 * @param audioFeatures - Cechy audio i błędy pobierania poszczególnych utworów.
 * @returns Średnie, dominanty, liczności i wartości procentowe profilu muzycznego.
 */
function calculateAudioStats(
  audioFeatures: ReccoBeatsTrackAudioFeaturesResult[]
): AudioStats {
  const validTracks = audioFeatures.filter(
    (track): track is ReccoBeatsTrackAudioFeatures => !("error" in track)
  );
  const tempos = validTracks
    .map((track) => track.tempo)
    .filter((value) => typeof value === "number");

  const energies = validTracks
    .map((track) => track.energy)
    .filter((value) => typeof value === "number");

  const danceabilities = validTracks
    .map((track) => track.danceability)
    .filter((value) => typeof value === "number");

  const valences = validTracks
    .map((track) => track.valence)
    .filter((value) => typeof value === "number");

  const acousticnesses = validTracks
    .map((track) => track.acousticness)
    .filter((value) => typeof value === "number");

  const instrumentalnesses = validTracks
    .map((track) => track.instrumentalness)
    .filter((value) => typeof value === "number");

  const livenesses = validTracks
    .map((track) => track.liveness)
    .filter((value) => typeof value === "number");

  const speechinesses = validTracks
    .map((track) => track.speechiness)
    .filter((value) => typeof value === "number");

  const loudnesses = validTracks
    .map((track) => track.loudness)
    .filter((value) => typeof value === "number");

  const keys = validTracks
    .map((track) => track.key)
    .filter((value) => typeof value === "number" && value >= 0);

  const modes = validTracks
    .map((track) => track.mode)
    .filter((value) => value === 0 || value === 1);

  const timeSignatures = validTracks
    .map((track) => track.timeSignature)
    .filter((value) => typeof value === "number");

  const liveTracksCount = validTracks.filter(
    (track) => typeof track.liveness === "number" && track.liveness > 0.8
  ).length;

  const instrumentalTracksCount = validTracks.filter(
    (track) =>
      typeof track.instrumentalness === "number" && track.instrumentalness > 0.5
  ).length;

  const speechHeavyTracksCount = validTracks.filter(
    (track) => typeof track.speechiness === "number" && track.speechiness > 0.66
  ).length;

  const majorCount = modes.filter((value) => value === 1).length;
  const minorCount = modes.filter((value) => value === 0).length;

  return {
    trackCount: validTracks.length,
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
    liveTrackPercentage: percentage(liveTracksCount, validTracks.length),
    instrumentalTrackPercentage: percentage(
      instrumentalTracksCount,
      validTracks.length
    ),
    speechHeavyTrackPercentage: percentage(
      speechHeavyTracksCount,
      validTracks.length
    ),
  };
}

export { calculateAudioStats };
