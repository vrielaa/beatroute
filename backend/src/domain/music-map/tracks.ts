import { describeAudioCharacter } from "./descriptions.js";
import { MUSIC_MAP_FEATURE_KEYS } from "./features.js";
import { round, isFiniteNumber } from "./math.js";
import type {
  AnalyzableMusicMapTrack,
  AudioFeatureValues,
  MusicMapTrack,
  SkippedMusicMapTrack,
  TrackAudioFeaturesLookup,
} from "./types.js";

/** Stan przygotowania jednego utworu do analizy. */
type TrackPreparation =
  | { status: "analyzable"; track: AnalyzableMusicMapTrack }
  | { status: "skipped"; track: SkippedMusicMapTrack };

/** Utwory rozdzielone według możliwości uwzględnienia ich w analizie. */
type MusicMapTrackPartition = {
  analyzableTracks: AnalyzableMusicMapTrack[];
  skippedTracks: SkippedMusicMapTrack[];
};

/**
 * Łączy utwory z cechami audio i rozdziela je według możliwości analizy.
 * Funkcja nie pobiera danych i nie modyfikuje przekazanych tablic.
 *
 * @param tracks - Znormalizowane dane utworów przeznaczonych do analizy.
 * @param audioFeatures - Wyniki wyszukiwania cech audio dla utworów.
 * @returns Utwory gotowe do analizy oraz informacje o utworach pominiętych.
 */
function prepareMusicMapTracks(
  tracks: MusicMapTrack[],
  audioFeatures: TrackAudioFeaturesLookup[]
): MusicMapTrackPartition {
  const audioFeaturesByTrackId = createAudioFeaturesByTrackIdMap(audioFeatures);
  const trackPreparations = tracks.map((track) =>
    prepareTrack(track, audioFeaturesByTrackId)
  );

  return partitionTracks(trackPreparations);
}

/**
 * Tworzy mapę pozwalającą znaleźć wynik cech audio bez przeszukiwania tablicy.
 * Kluczem jest identyfikator utworu używany w całej domenie mapy muzycznej.
 *
 * @param audioFeatures - Wyniki wyszukiwania cech audio dla utworów.
 * @returns Wyniki cech audio dostępne według identyfikatora utworu.
 */
function createAudioFeaturesByTrackIdMap(
  audioFeatures: TrackAudioFeaturesLookup[]
): Map<string, TrackAudioFeaturesLookup> {
  const audioFeaturesByTrackId = new Map<string, TrackAudioFeaturesLookup>();

  for (const lookup of audioFeatures) {
    audioFeaturesByTrackId.set(lookup.trackId, lookup);
  }

  return audioFeaturesByTrackId;
}

/**
 * Sprawdza wynik pobrania cech i przygotowuje jeden utwór do analizy.
 * Nieudane pobranie lub niekompletny wektor daje jawny stan `skipped`.
 *
 * @param track - Znormalizowane dane utworu.
 * @param audioFeaturesByTrackId - Wyniki cech audio dostępne według ID utworu.
 * @returns Utwór gotowy do analizy albo utwór z powodem pominięcia.
 */
function prepareTrack(
  track: MusicMapTrack,
  audioFeaturesByTrackId: Map<string, TrackAudioFeaturesLookup>
): TrackPreparation {
  const audioFeatures = audioFeaturesByTrackId.get(track.id);

  if (!audioFeatures) {
    return createSkippedTrack(track, "Audio features not found");
  }

  if (audioFeatures.status === "failed") {
    return createSkippedTrack(track, audioFeatures.reason);
  }

  const vector = MUSIC_MAP_FEATURE_KEYS.map(
    (key) => audioFeatures.features[key]
  );

  if (!vector.every(isFiniteNumber)) {
    return createSkippedTrack(track, "Incomplete audio features");
  }

  const featureValues = Object.fromEntries(
    MUSIC_MAP_FEATURE_KEYS.map((key, index) => [key, round(vector[index])])
  ) as AudioFeatureValues;

  return {
    status: "analyzable",
    track: {
      ...track,
      vector,
      audioFeatures: featureValues,
      description: describeAudioCharacter(featureValues),
    },
  };
}

/** Tworzy jawny wynik pominięcia utworu wraz z jego przyczyną. */
function createSkippedTrack(
  track: MusicMapTrack,
  reason: string
): TrackPreparation {
  return {
    status: "skipped",
    track: { ...track, reason },
  };
}

/**
 * Rozdziela przygotowane utwory na analizowane i pominięte.
 * Jawne pole `status` pozwala TypeScriptowi rozpoznać właściwy typ utworu.
 *
 * @param trackPreparations - Wyniki przygotowania kolejnych utworów.
 * @returns Dwie nazwane kolekcje utworów.
 */
function partitionTracks(
  trackPreparations: TrackPreparation[]
): MusicMapTrackPartition {
  const analyzableTracks: AnalyzableMusicMapTrack[] = [];
  const skippedTracks: SkippedMusicMapTrack[] = [];

  for (const preparation of trackPreparations) {
    if (preparation.status === "analyzable") {
      analyzableTracks.push(preparation.track);
    } else {
      skippedTracks.push(preparation.track);
    }
  }

  return { analyzableTracks, skippedTracks };
}

export { prepareMusicMapTracks };
