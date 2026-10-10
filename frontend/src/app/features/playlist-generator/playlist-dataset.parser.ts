import type {
  PlaylistAudioFeatures,
  PlaylistDataset,
  PlaylistTrack,
} from './playlist-generator.models';

const MAX_TRACKS_LIMIT = 500;

/**
 * Sprawdza dane odczytane z pliku JSON i buduje zbiór generatora w wersji 1.
 * Akceptuje od 1 do 500 utworów z unikalnymi identyfikatorami po przycięciu
 * tekstów. Wymaga metadanych i wszystkich ośmiu pomiarów; null oznacza brak
 * pomiaru, nie zero. Zwraca nowy zbiór bez dodatkowych pól i nie zmienia wejścia.
 * Nie odczytuje pliku, nie parsuje tekstu JSON i nie wywołuje żadnego API.
 * Backend niezależnie sprawdza zbiór przesłany w żądaniu generowania playlisty.
 *
 * @param value - Dane uzyskane z JSON.parse, przed sprawdzeniem ich struktury.
 * @returns Znormalizowany zbiór gotowy do zapisania w stanie widoku.
 * @throws Error Gdy format, metadane, pomiary lub liczba utworów są niepoprawne.
 */
function parsePlaylistDataset(value: unknown): PlaylistDataset {
  const dataset = requireRecord(value, 'Zbiór');

  if (dataset['version'] !== 1) {
    throw new Error('Nieobsługiwana wersja zbioru: pole version musi mieć wartość 1');
  }

  const tracks = requireArray(dataset['tracks'], 'Pole tracks');

  if (tracks.length === 0 || tracks.length > MAX_TRACKS_LIMIT) {
    throw new Error(`Zbiór musi zawierać od 1 do ${MAX_TRACKS_LIMIT} utworów`);
  }

  const uniqueIds = new Set<string>();

  return {
    version: 1,
    tracks: tracks.map((track, index) => validateTrack(track, index, uniqueIds)),
  };
}

/** Sprawdza metadane utworu, przycina teksty i rejestruje jego unikalne ID. */
function validateTrack(value: unknown, index: number, uniqueIds: Set<string>): PlaylistTrack {
  const label = `Utwór ${index + 1}`;
  const track = requireRecord(value, label);
  const id = requireString(track['id'], `${label}: pole id`);

  if (uniqueIds.has(id)) {
    throw new Error(`${label}: identyfikator "${id}" jest powtórzony w zbiorze`);
  }

  uniqueIds.add(id);

  const name = requireString(track['name'], `${label}: pole name`);
  const artistValues = requireArray(track['artists'], `${label}: pole artists`);

  if (artistValues.length === 0) {
    throw new Error(`${label}: pole artists musi zawierać przynajmniej jednego artystę`);
  }

  const artists = artistValues.map((artist, artistIndex) =>
    requireString(artist, `${label}: pole artists[${artistIndex}]`)
  );
  const features = requireRecord(track['audioFeatures'], `${label}: pole audioFeatures`);
  const audioFeatures = validateAudioFeatures(features, label);

  return { id, name, artists, audioFeatures };
}

/** Wymaga ośmiu pól pomiarów i buduje ich sprawdzoną kopię bez dodatkowych pól. */
function validateAudioFeatures(
  features: Record<string, unknown>,
  trackLabel: string
): PlaylistAudioFeatures {
  const requiredKeys: (keyof PlaylistAudioFeatures)[] = [
    'tempo',
    'energy',
    'danceability',
    'valence',
    'acousticness',
    'instrumentalness',
    'speechiness',
    'liveness',
  ];

  for (const key of requiredKeys) {
    if (!Object.hasOwn(features, key)) {
      throw new Error(`${trackLabel}: brak pola audioFeatures.${key}`);
    }
  }

  const label = `${trackLabel}: pole audioFeatures`;

  return {
    tempo: requireTempo(features['tempo'], `${label}.tempo`),
    energy: requireUnitMeasurement(features['energy'], `${label}.energy`),
    danceability: requireUnitMeasurement(features['danceability'], `${label}.danceability`),
    valence: requireUnitMeasurement(features['valence'], `${label}.valence`),
    acousticness: requireUnitMeasurement(features['acousticness'], `${label}.acousticness`),
    instrumentalness: requireUnitMeasurement(
      features['instrumentalness'],
      `${label}.instrumentalness`
    ),
    speechiness: requireUnitMeasurement(features['speechiness'], `${label}.speechiness`),
    liveness: requireUnitMeasurement(features['liveness'], `${label}.liveness`),
  };
}

/** Zwraca obiekt do dalszego sprawdzenia; odrzuca null, tablice i wartości proste. */
function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} musi być obiektem`);
  }

  return value as Record<string, unknown>;
}

/** Zwraca przycięty, niepusty tekst; nie konwertuje innych wartości na string. */
function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} musi być niepustym tekstem`);
  }

  return value.trim();
}

/** Wymaga tablicy; jej elementy są sprawdzane osobno. */
function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} musi być tablicą`);
  }

  return value;
}

/** Akceptuje dodatnie, skończone tempo w BPM albo null przy braku pomiaru. */
function requireTempo(value: unknown, label: string): number | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} musi być dodatnią, skończoną liczbą albo null`);
  }

  return value;
}

/** Akceptuje skończony pomiar z zakresu 0–1 albo null; zero pozostaje pomiarem. */
function requireUnitMeasurement(value: unknown, label: string): number | null {
  if (
    value !== null &&
    (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)
  ) {
    throw new Error(`${label} musi być skończoną liczbą od 0 do 1 albo null`);
  }

  return value;
}

export { parsePlaylistDataset };
