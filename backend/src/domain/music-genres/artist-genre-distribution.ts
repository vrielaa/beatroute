import type {
  Artist,
  GenreAccumulation,
  GenreAccumulator,
  GenreCandidate,
  GenreMap,
  SubgenreAccumulator,
  SubgenreMap,
} from "./artist-genre-distribution.types.js";

/**
 * Sortuje podgatunki malejąco według liczby dopasowań, a przy remisie
 * alfabetycznie według nazwy. Modyfikuje kolejność przekazanej tablicy.
 *
 * @param subgenres - Podgatunki zgromadzone podczas analizy artystów.
 * @returns Posortowana tablica podgatunków.
 */
function sortSubgenres(subgenres: Array<SubgenreAccumulator>) {
  return subgenres.sort((first, second) => {
    const countDifference = second.count - first.count;

    if (countDifference !== 0) {
      return countDifference;
    }

    return first.name.localeCompare(second.name);
  });
}

/**
 * Oblicza udział procentowy i zaokrągla go do jednego miejsca po przecinku.
 *
 * @param count - Liczba dopasowań wybranej kategorii.
 * @param total - Łączna liczba dopasowań.
 * @returns Obliczony procent albo zero, gdy nie ma żadnych dopasowań.
 */
function calcPercentage(count: number, total: number) {
  if (total === 0) {
    return 0;
  }

  return Number(((count / total) * 100).toFixed(1));
}

/**
 * Zamienia roboczą mapę podgatunków na posortowaną listę wynikową.
 * Dla każdego podgatunku oblicza procent i zamienia zbiór artystów na tablicę.
 *
 * @param subgenreMap - Mapa podgatunków zgromadzonych podczas analizy.
 * @returns Lista podgatunków gotowa do umieszczenia w odpowiedzi.
 */
function buildSubgenres(subgenreMap: Map<string, SubgenreAccumulator>) {
  const subgenres = Array.from(subgenreMap.values());

  let totalMatches = 0;
  for (const subgenre of subgenres) {
    totalMatches += subgenre.count;
  }

  const sortedSubgenres = sortSubgenres(subgenres);

  const result = sortedSubgenres.map((subgenre) => {
    const percentage = calcPercentage(subgenre.count, totalMatches);

    return {
      name: subgenre.name,
      count: subgenre.count,
      artists: Array.from(subgenre.artistNamesSet),
      percentage,
    };
  });

  return result;
}

/**
 * Wybiera nazwę artysty prezentowaną w wyniku.
 * Nazwa użyta w zapytaniu ma pierwszeństwo przed nazwą rozpoznaną przez API.
 *
 * @param artist - Analizowany artysta.
 * @returns Nazwa artysty używana w rozkładzie gatunków.
 */
function getArtistName(artist: Artist): string {
  if (artist.requestedName !== undefined) {
    return artist.requestedName;
  }

  if ("resolvedName" in artist) {
    return artist.resolvedName;
  }

  return artist.name;
}

/**
 * Sprawdza, czy kandydat został przypisany do gatunku kanonicznego.
 * Po pozytywnym sprawdzeniu TypeScript traktuje `canonicalName` jako string.
 *
 * @param candidate - Sprawdzany kandydat gatunku.
 * @returns `true`, jeśli kandydat ma nazwę gatunku kanonicznego.
 */
function isValidGenreCandidate(
  candidate: GenreCandidate
): candidate is GenreCandidate & { canonicalName: string } {
  return Boolean(candidate.canonicalName);
}

/**
 * Zwraca wyłącznie kandydatów przypisanych do gatunku kanonicznego.
 *
 * @param artist - Artysta wraz z kandydatami gatunków.
 * @returns Kandydaci, którzy przeszli walidację.
 */
function getValidCandidates(artist: Artist) {
  return (artist.genreCandidates ?? []).filter(isValidGenreCandidate);
}

/**
 * Pobiera istniejący akumulator gatunku albo tworzy i zapisuje nowy.
 *
 * @param genreMap - Mapa akumulatorów głównych gatunków.
 * @param canonicalName - Kanoniczna nazwa głównego gatunku.
 * @returns Akumulator odpowiadający wskazanemu gatunkowi.
 */
function getOrCreateGenre(
  genreMap: GenreMap,
  canonicalName: string
): GenreAccumulator {
  const existingGenre = genreMap.get(canonicalName);

  if (existingGenre) {
    return existingGenre;
  }

  const newGenre: GenreAccumulator = {
    name: canonicalName,
    count: 0,
    artistNamesSet: new Set(),
    subgenreMap: new Map(),
  };

  genreMap.set(canonicalName, newGenre);
  return newGenre;
}

/**
 * Pobiera istniejący akumulator podgatunku albo tworzy i zapisuje nowy.
 *
 * @param subgenreMap - Mapa podgatunków należących do głównego gatunku.
 * @param candidate - Kandydat opisujący dodawany podgatunek.
 * @returns Akumulator odpowiadający wskazanemu podgatunkowi.
 */
function getOrCreateSubgenre(
  subgenreMap: SubgenreMap,
  candidate: GenreCandidate
): SubgenreAccumulator {
  const existingSubgenre = subgenreMap.get(candidate.key);

  if (existingSubgenre) {
    return existingSubgenre;
  }

  const newSubgenre: SubgenreAccumulator = {
    name: candidate.name,
    count: 0,
    artistNamesSet: new Set(),
  };

  subgenreMap.set(candidate.key, newSubgenre);
  return newSubgenre;
}

/**
 * Dodaje pojedyncze dopasowanie artysty do gatunku i podgatunku.
 * Modyfikuje liczniki i zbiory artystów przechowywane w przekazanej mapie.
 *
 * @param genreMap - Mapa aktualnie zgromadzonych gatunków.
 * @param candidate - Prawidłowy kandydat gatunku.
 * @param artistName - Nazwa artysty przypisywanego do gatunku.
 */
function addGenreMatch(
  genreMap: GenreMap,
  candidate: GenreCandidate,
  artistName: string
) {
  if (!isValidGenreCandidate(candidate)) {
    return;
  }

  const genre = getOrCreateGenre(genreMap, candidate.canonicalName);
  const subgenre = getOrCreateSubgenre(genre.subgenreMap, candidate);

  subgenre.count += 1;
  subgenre.artistNamesSet.add(artistName);
  genre.count += 1;
  genre.artistNamesSet.add(artistName);
}

/**
 * Przechodzi przez artystów i gromadzi wszystkie dopasowania gatunków.
 * Osobno zapisuje artystów, dla których nie znaleziono prawidłowego gatunku.
 *
 * @param artists - Artyści poddawani analizie.
 * @returns Robocze akumulatory i statystyki dopasowania.
 */
function accumulateGenres(artists: Artist[]): GenreAccumulation {
  const genreMap: GenreMap = new Map();
  const unmatchedArtists: string[] = [];
  let totalGenreMatches = 0;

  for (const artist of artists) {
    const artistName = getArtistName(artist);
    const candidates = getValidCandidates(artist);

    if (candidates.length === 0) {
      unmatchedArtists.push(artistName);
      continue;
    }

    for (const candidate of candidates) {
      addGenreMatch(genreMap, candidate, artistName);
      totalGenreMatches += 1;
    }
  }

  return { genreMap, unmatchedArtists, totalGenreMatches };
}

/**
 * Sortuje główne gatunki malejąco według liczby dopasowań, a przy remisie
 * alfabetycznie według nazwy. Modyfikuje kolejność przekazanej tablicy.
 *
 * @param genres - Akumulatory głównych gatunków.
 * @returns Posortowana tablica gatunków.
 */
function sortGenres(genres: GenreAccumulator[]) {
  return genres.sort((first, second) => {
    const countDifference = second.count - first.count;

    if (countDifference !== 0) {
      return countDifference;
    }

    return first.name.localeCompare(second.name);
  });
}

/**
 * Zamienia roboczy akumulator gatunku na element odpowiedzi.
 *
 * @param genre - Akumulator przetwarzanego gatunku.
 * @param totalGenreMatches - Liczba wszystkich dopasowań gatunków.
 * @returns Gatunek wraz z procentem, artystami i podgatunkami.
 */
function buildGenre(genre: GenreAccumulator, totalGenreMatches: number) {
  return {
    name: genre.name,
    count: genre.count,
    artists: Array.from(genre.artistNamesSet),
    percentage: calcPercentage(genre.count, totalGenreMatches),
    subgenres: buildSubgenres(genre.subgenreMap),
  };
}

/**
 * Buduje posortowaną listę głównych gatunków z roboczej mapy.
 *
 * @param genreMap - Mapa gatunków zgromadzonych podczas analizy.
 * @param totalGenreMatches - Liczba wszystkich dopasowań gatunków.
 * @returns Lista głównych gatunków gotowa do umieszczenia w odpowiedzi.
 */
function buildGenres(genreMap: GenreMap, totalGenreMatches: number) {
  const genres = Array.from(genreMap.values());
  const sortedGenres = sortGenres(genres);

  const resultGenres = sortedGenres.map((genre) =>
    buildGenre(genre, totalGenreMatches)
  );

  return resultGenres;
}

/**
 * Buduje rozkład gatunków muzycznych na podstawie kandydatów przypisanych
 * do artystów. Grupuje podgatunki według gatunków kanonicznych, oblicza ich
 * udział procentowy i wskazuje artystów bez rozpoznanego gatunku.
 *
 * @param artists - Artyści wraz z kandydatami gatunków.
 * @returns Rozkład gatunków oraz zbiorcze statystyki dopasowania.
 */
function buildArtistGenreDistribution(artists: Artist[]) {
  const { genreMap, unmatchedArtists, totalGenreMatches } =
    accumulateGenres(artists);

  const genres = buildGenres(genreMap, totalGenreMatches);

  return {
    genres,
    totalArtists: artists.length,
    matchedArtists: artists.length - unmatchedArtists.length,
    totalGenreMatches,
    unmatchedArtists,
  };
}

export { buildArtistGenreDistribution };
