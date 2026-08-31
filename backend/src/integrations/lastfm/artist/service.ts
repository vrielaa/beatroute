import { buildArtistGenreDistribution } from "../../../domain/music-genres/artist-genre-distribution.js";
import { createLastfmArtistGateway } from "./gateway.js";
import { mapArtistLookupToGenreInput, mapLastfmArtistInfo } from "./mapper.js";
import type {
  LastfmArtistApiResponse,
  LastfmArtistGateway,
  LastfmArtistLookup,
} from "./types.js";
import { fetchFromLastfm } from "../lastfm.client.js";

const INVALID_API_KEY_ERROR_CODE = 10;
const GENRE_SOURCE = "lastfm-artist-info-tags";

/** Zależności przypadków użycia związanych z artystami Last.fm. */
type LastfmArtistServiceDependencies = {
  /** Gateway dostarczający surowe dane artystów. */
  artistGateway: LastfmArtistGateway;
};

/**
 * Tworzy przypadki użycia dotyczące danych artystów Last.fm.
 * Przyjęcie gatewaya jako zależności oddziela logikę aplikacji od klienta HTTP
 * i pozwala zastąpić Last.fm atrapą w testach.
 *
 * @param dependencies - Zależności serwisu artystów.
 * @returns Operacje pobierania artysty i budowania rozkładu gatunków.
 */
function createLastfmArtistService({
  artistGateway,
}: LastfmArtistServiceDependencies) {
  /**
   * Pobiera i mapuje informacje o jednym artyście.
   *
   * @param artistName - Nazwa artysty wysyłana do Last.fm.
   * @returns Dane artysty w modelu używanym przez aplikację.
   * @throws Przekazuje błąd zwrócony przez gateway.
   */
  async function getArtistInfo(artistName: string) {
    const response = await artistGateway.lookupArtist(artistName);

    return mapLastfmArtistInfo(response, artistName);
  }

  /**
   * Buduje rozkład gatunków dla unikalnych artystów.
   * Pojedyncze nieudane zapytania nie przerywają obliczeń, ale błędny klucz API
   * lub niepowodzenie wszystkich zapytań kończy operację błędem.
   *
   * @param artistNames - Nazwy artystów, które mają zostać sklasyfikowane.
   * @returns Rozkład gatunków wraz z identyfikatorem źródła danych.
   * @throws Błąd Last.fm krytyczny dla wiarygodności całego wyniku.
   */
  async function getArtistGenreDistribution(artistNames: string[]) {
    const uniqueArtistNames = deduplicateArtistNames(artistNames);
    const lookups = await artistGateway.lookupMany(uniqueArtistNames);

    assertNoCriticalLookupFailure(lookups);

    const artists = lookups.map(mapArtistLookupToGenreInput);
    const distribution = buildArtistGenreDistribution(artists);

    return {
      ...distribution,
      source: GENRE_SOURCE,
    };
  }

  return {
    getArtistInfo,
    getArtistGenreDistribution,
  };
}

/**
 * Usuwa powtórzone nazwy artystów bez rozróżniania wielkości liter.
 * Dla każdego artysty zachowuje pierwszą pisownię z listy wejściowej.
 *
 * @param artistNames - Nazwy artystów, które mogą zawierać powtórzenia.
 * @returns Unikalne nazwy w kolejności pierwszego wystąpienia.
 */
function deduplicateArtistNames(artistNames: string[]): string[] {
  const uniqueArtistNames: string[] = [];
  const normalizedNames = new Set<string>();

  for (const artistName of artistNames) {
    const normalizedName = artistName.toLocaleLowerCase();

    if (normalizedNames.has(normalizedName)) {
      continue;
    }

    normalizedNames.add(normalizedName);
    uniqueArtistNames.push(artistName);
  }

  return uniqueArtistNames;
}

/**
 * Przerywa przetwarzanie dla błędnego klucza API lub awarii wszystkich zapytań.
 * Pojedyncze nieudane zapytania pozostają dozwolone jako częściowy wynik.
 *
 * @param lookups - Wyniki zapytań o wszystkich unikalnych artystów.
 * @throws Błąd nieprawidłowego klucza API lub pierwszy błąd całkowitej awarii.
 */
function assertNoCriticalLookupFailure(lookups: LastfmArtistLookup[]): void {
  const failures = lookups.filter(isRejectedLookup);
  const invalidApiKeyFailure = failures.find((lookup) =>
    hasLastfmErrorCode(lookup.error, INVALID_API_KEY_ERROR_CODE)
  );

  if (invalidApiKeyFailure) {
    throw invalidApiKeyFailure.error;
  }

  if (lookups.length > 0 && failures.length === lookups.length) {
    throw failures[0].error;
  }
}

/**
 * Sprawdza, czy wyszukiwanie artysty zakończyło się błędem.
 *
 * @param lookup - Wynik zapytania o artystę.
 * @returns `true`, gdy wynik ma status `rejected`; zawęża przy tym jego typ.
 */
function isRejectedLookup(
  lookup: LastfmArtistLookup
): lookup is Extract<LastfmArtistLookup, { status: "rejected" }> {
  return lookup.status === "rejected";
}

/**
 * Sprawdza kod błędu zwróconego przez Last.fm bez używania `any`.
 *
 * @param error - Nieznana wartość przechwycona jako błąd.
 * @param expectedCode - Kod błędu oczekiwany przez wywołującego.
 * @returns `true`, gdy wartość jest obiektem z oczekiwanym kodem.
 */
function hasLastfmErrorCode(error: unknown, expectedCode: number): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }

  return error.code === expectedCode;
}

/** Produkcyjny gateway łączący wąski port artystów z ogólnym klientem Last.fm. */
const defaultLastfmArtistGateway = createLastfmArtistGateway({
  requestArtistInfo: (artistName) =>
    fetchFromLastfm("artist.getInfo", {
      artist: artistName,
      autocorrect: 1,
    }) as Promise<LastfmArtistApiResponse>,
});

/** Serwis artystów korzystający z produkcyjnego gatewaya Last.fm. */
const lastfmArtistService = createLastfmArtistService({
  artistGateway: defaultLastfmArtistGateway,
});

export { createLastfmArtistService, lastfmArtistService };
