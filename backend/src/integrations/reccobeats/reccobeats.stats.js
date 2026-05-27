function average(values) {
  if (!values.length) {
    return null;
  }

  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function roundIfNumber(value, digits = 2) {
  if (typeof value !== 'number') {
    return null;
  }

  return Number(value.toFixed(digits));
}

function mode(values) {
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

function percentage(count, total) {
  if (!total) {
    return 0;
  }

  return Math.round((count / total) * 100);
}

export function calculateAudioStats(audioFeatures) {
  const validTracks = audioFeatures.filter((track) => track && !track.error);

  const tempos = validTracks
    .map((track) => track.tempo)
    .filter((value) => typeof value === 'number');

  const energies = validTracks
    .map((track) => track.energy)
    .filter((value) => typeof value === 'number');

  const danceabilities = validTracks
    .map((track) => track.danceability)
    .filter((value) => typeof value === 'number');

  const valences = validTracks
    .map((track) => track.valence)
    .filter((value) => typeof value === 'number');

  const acousticnesses = validTracks
    .map((track) => track.acousticness)
    .filter((value) => typeof value === 'number');

  const instrumentalnesses = validTracks
    .map((track) => track.instrumentalness)
    .filter((value) => typeof value === 'number');

  const livenesses = validTracks
    .map((track) => track.liveness)
    .filter((value) => typeof value === 'number');

  const speechinesses = validTracks
    .map((track) => track.speechiness)
    .filter((value) => typeof value === 'number');

  const loudnesses = validTracks
    .map((track) => track.loudness)
    .filter((value) => typeof value === 'number');

  const keys = validTracks
    .map((track) => track.key)
    .filter((value) => typeof value === 'number' && value >= 0);

  const modes = validTracks
    .map((track) => track.mode)
    .filter((value) => value === 0 || value === 1);

  const timeSignatures = validTracks
    .map((track) => track.timeSignature)
    .filter((value) => typeof value === 'number');

  const liveTracksCount = validTracks.filter(
    (track) => typeof track.liveness === 'number' && track.liveness > 0.8,
  ).length;

  const instrumentalTracksCount = validTracks.filter(
    (track) => typeof track.instrumentalness === 'number' && track.instrumentalness > 0.5,
  ).length;

  const speechHeavyTracksCount = validTracks.filter(
    (track) => typeof track.speechiness === 'number' && track.speechiness > 0.66,
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
    instrumentalTrackPercentage: percentage(instrumentalTracksCount, validTracks.length),
    speechHeavyTrackPercentage: percentage(speechHeavyTracksCount, validTracks.length),
  };
}