import type { PlaylistToSave } from "@application/playlist-generator/types.js";
import { RequestValidationError } from "@http/request-validation-error.js";

const MAX_PLAYLIST_NAME_LENGTH = 100;
const MAX_TRACKS_LIMIT = 500;
const SPOTIFY_TRACK_ID_PATTERN = /^[A-Za-z0-9]{22}$/;

/**
 * Sprawdza nazwę playlisty i identyfikatory utworów przeznaczonych do zapisu.
 * Wymaga nazwy o długości od 1 do 100 znaków po przycięciu oraz od 1 do 500 ID.
 * Przycina teksty, zachowuje kolejność i wielkość liter, a duplikaty odrzuca
 * zamiast usuwać je z wyboru użytkownika. Zwraca nowy obiekt i tablicę bez
 * dodatkowych pól; nie zmienia wejścia ani nie przechowuje ID między wywołaniami.
 * Nie sprawdza istnienia utworów, ich dopasowania do preferencji ani uprawnień
 * użytkownika. Nie odczytuje tokenu dostępu z wejścia i nie wywołuje zewnętrznych API.
 *
 * @param value - Treść żądania zawierająca name i trackIds.
 * @returns Nazwa i identyfikatory gotowe do przekazania operacji zapisu playlisty.
 * @throws RequestValidationError Gdy struktura, nazwa, liczba lub format ID są niepoprawne albo ID się powtarzają.
 */
function parsePlaylistToSave(value: unknown): PlaylistToSave {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestValidationError(
      "Dane do zapisu playlisty muszą być obiektem"
    );
  }

  const playlist = value as Record<string, unknown>;

  if (!Object.hasOwn(playlist, "name")) {
    throw new RequestValidationError("Pole name jest wymagane");
  }

  if (!Object.hasOwn(playlist, "trackIds")) {
    throw new RequestValidationError("Pole trackIds jest wymagane");
  }

  return {
    name: parsePlaylistName(playlist["name"]),
    trackIds: parsePlaylistTrackIds(playlist["trackIds"]),
  };
}

/** Przycina nazwę playlisty i sprawdza jej długość przed przekazaniem do zapisu. */
function parsePlaylistName(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new RequestValidationError("Pole name musi być niepustym tekstem");
  }

  const name = value.trim();

  if (name.length > MAX_PLAYLIST_NAME_LENGTH) {
    throw new RequestValidationError(
      `Nazwa playlisty może mieć maksymalnie ${MAX_PLAYLIST_NAME_LENGTH} znaków`
    );
  }

  return name;
}

/** Sprawdza liczbę i unikalność ID po przycięciu, zachowując kolejność wejściową. */
function parsePlaylistTrackIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new RequestValidationError("Pole trackIds musi być tablicą");
  }

  if (value.length === 0 || value.length > MAX_TRACKS_LIMIT) {
    throw new RequestValidationError(
      `Pole trackIds musi zawierać od 1 do ${MAX_TRACKS_LIMIT} identyfikatorów utworów`
    );
  }

  const trackIds: string[] = [];
  const uniqueIds = new Set<string>();

  for (let index = 0; index < value.length; index += 1) {
    const id = parseSpotifyTrackId(value[index], index);

    if (uniqueIds.has(id)) {
      throw new RequestValidationError(
        `Pole trackIds[${index}] powtarza identyfikator utworu`
      );
    }

    uniqueIds.add(id);
    trackIds.push(id);
  }

  return trackIds;
}

/** Przycina ID i sprawdza jego 22-znakowy format, bez odczytu Spotify API. */
function parseSpotifyTrackId(value: unknown, index: number): string {
  if (typeof value !== "string") {
    throw new RequestValidationError(
      `Pole trackIds[${index}] musi być tekstowym identyfikatorem Spotify`
    );
  }

  const id = value.trim();

  if (!SPOTIFY_TRACK_ID_PATTERN.test(id)) {
    throw new RequestValidationError(
      `Pole trackIds[${index}] musi zawierać Spotify ID złożone z 22 liter lub cyfr`
    );
  }

  return id;
}

export { parsePlaylistToSave };
