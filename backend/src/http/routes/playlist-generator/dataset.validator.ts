import type {
  PlaylistDataset,
  PlaylistAudioFeatures,
  PlaylistTrack,
} from "@domain/playlist-generator/types.js";
import { RequestValidationError } from "@http/request-validation-error.js";
const MAX_TRACKS_LIMIT = 500;

/**
 * Sprawdza zbiór wejściowy generatora i zwraca jego znormalizowaną kopię.
 * Akceptuje wersję 1 i od 1 do 500 utworów z unikalnymi identyfikatorami.
 * Przy każdym utworze sprawdza metadane i wszystkie osiem pomiarów cech audio;
 * null oznacza brak pomiaru, a brak pola jest błędem. Przycina teksty i nie
 * przenosi dodatkowych pól do wyniku. Nie sprawdza dopasowania do kryteriów.
 *
 * @param value - Dane odczytane z JSON-a, przed sprawdzeniem ich struktury.
 * @returns Zbiór gotowy do przekazania algorytmowi generatora.
 * @throws RequestValidationError Gdy struktura, wartości lub liczba utworów są niepoprawne.
 */
function parsePlaylistGeneratorDataset(value: unknown): PlaylistDataset {
  const uniqueIds = new Set<string>();

  const dataset = requireRecord(
    value,
    'Pole "dataset" musi być obiektem zbioru playlist'
  );

  const version = dataset.version;

  if (version !== 1) {
    throw new RequestValidationError("Nieobsługiwana wersja zbioru playlist");
  }

  const tracks = requireArray(
    dataset.tracks,
    'Pole "dataset.tracks" musi być tablicą'
  );

  if (tracks.length === 0) {
    throw new RequestValidationError(
      'Pole "dataset.tracks" nie może być pustą tablicą'
    );
  }

  if (tracks.length > MAX_TRACKS_LIMIT) {
    throw new RequestValidationError(
      `Pole "dataset.tracks" nie może przekraczać limitu ${MAX_TRACKS_LIMIT}`
    );
  }

  return {
    version: 1,
    tracks: tracks.map((track) => validateTrack(track, uniqueIds)),
  };
}

/** Zwraca obiekt z polami do dalszego sprawdzenia; odrzuca null i tablice. */
function requireRecord(
  value: unknown,
  message: string
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestValidationError(message);
  }

  return value as Record<string, unknown>;
}

/** Zwraca przycięty, niepusty tekst albo zgłasza błąd walidacji. */
function requireString(value: unknown, message: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new RequestValidationError(message);
  }

  return value.trim();
}

/** Sprawdza, czy wartość jest tablicą; jej elementy są walidowane osobno. */
function requireArray(value: unknown, message: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new RequestValidationError(message);
  }

  return value;
}

/** Akceptuje dodatnie, skończone tempo w BPM albo null przy braku pomiaru. */
function requireTempo(value: unknown): number | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new RequestValidationError(
      "Pole 'audioFeatures.tempo' musi być dodatnią, skończoną liczbą albo null"
    );
  }

  return value;
}

/** Akceptuje skończony pomiar w zakresie 0–1 albo null przy braku pomiaru. */
function requireUnitAudioFeature(
  value: unknown,
  featureName: string
): number | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RequestValidationError(
      `Pole 'audioFeatures.${featureName}' musi być skończoną liczbą albo null`
    );
  }

  if (value < 0 || value > 1) {
    throw new RequestValidationError(
      `Pole 'audioFeatures.${featureName}' musi być liczbą od 0 do 1 albo null`
    );
  }

  return value;
}

/** Sprawdza utwór, normalizuje teksty i rejestruje jego identyfikator w zbiorze. */
function validateTrack(track: unknown, uniqueIds: Set<string>): PlaylistTrack {
  const trackRecord = requireRecord(track, "Każdy utwór musi być obiektem");

  const id = requireString(
    trackRecord.id,
    "Pole id musi być niepustym tekstem"
  );

  if (uniqueIds.has(id)) {
    throw new RequestValidationError(
      "Identyfikatory utworów muszą być unikalne"
    );
  }

  uniqueIds.add(id);

  const name = requireString(
    trackRecord.name,
    "Pole name musi być niepustym tekstem"
  );

  const artistValues = requireArray(
    trackRecord.artists,
    "Pole artists musi być tablicą"
  );

  if (artistValues.length === 0) {
    throw new RequestValidationError(
      "Utwór musi mieć przynajmniej jednego artystę"
    );
  }

  const artists = artistValues.map((artist) =>
    requireString(artist, "Nazwa artysty musi być niepustym tekstem")
  );

  const features = requireRecord(
    trackRecord.audioFeatures,
    "Pole audioFeatures musi być obiektem"
  );

  const audioFeatures = validateTrackAudioFeatures(features);

  return { id, name, artists, audioFeatures };
}

/** Buduje osiem sprawdzonych pomiarów, bez dodatkowych pól wejściowych. */
function validateTrackAudioFeatures(
  audioFeatures: Record<string, unknown>
): PlaylistAudioFeatures {
  return {
    tempo: requireTempo(audioFeatures.tempo),
    energy: requireUnitAudioFeature(audioFeatures.energy, "energy"),
    danceability: requireUnitAudioFeature(
      audioFeatures.danceability,
      "danceability"
    ),
    valence: requireUnitAudioFeature(audioFeatures.valence, "valence"),
    acousticness: requireUnitAudioFeature(
      audioFeatures.acousticness,
      "acousticness"
    ),
    instrumentalness: requireUnitAudioFeature(
      audioFeatures.instrumentalness,
      "instrumentalness"
    ),
    speechiness: requireUnitAudioFeature(
      audioFeatures.speechiness,
      "speechiness"
    ),
    liveness: requireUnitAudioFeature(audioFeatures.liveness, "liveness"),
  };
}

export { parsePlaylistGeneratorDataset };
