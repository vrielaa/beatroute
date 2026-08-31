import type {
  ErrorLogger,
  LastfmArtistApiResponse,
  LastfmArtistGateway,
  LastfmArtistLookup,
} from "./types.js";

const DEFAULT_BATCH_SIZE = 5;

/** Zależności wymagane do utworzenia gatewaya artystów Last.fm. */
type LastfmArtistGatewayDependencies = {
  /** Wąski adapter wykonujący pojedyncze zapytanie `artist.getInfo`. */
  requestArtistInfo: (artistName: string) => Promise<LastfmArtistApiResponse>;
  /** Maksymalna liczba zapytań wykonywanych jednocześnie. */
  batchSize?: number;
  /** Logger używany do rejestrowania nieudanych zapytań zbiorczych. */
  logger?: ErrorLogger;
};

/**
 * Tworzy gateway odpowiedzialny za pobieranie danych artystów z Last.fm.
 * Zapytania zbiorcze wykonuje równolegle w ograniczonych partiach.
 *
 * @param dependencies - Adapter HTTP, rozmiar partii i opcjonalny logger.
 * @returns Gateway obsługujący zapytania o jednego lub wielu artystów.
 * @throws {RangeError} Gdy rozmiar partii nie jest dodatnią liczbą całkowitą.
 */
function createLastfmArtistGateway({
  requestArtistInfo,
  batchSize = DEFAULT_BATCH_SIZE,
  logger = console,
}: LastfmArtistGatewayDependencies): LastfmArtistGateway {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new RangeError(
      "Last.fm artist batch size must be a positive integer"
    );
  }

  /**
   * Pobiera dane wielu artystów w partiach, zachowując kolejność wejściową.
   * Błąd pojedynczego zapytania staje się wynikiem `rejected`, więc pozostałe
   * dane nadal mogą zostać wykorzystane.
   *
   * @param artistNames - Nazwy artystów do pobrania.
   * @returns Wynik dla każdej przekazanej nazwy, w tej samej kolejności.
   */
  async function lookupMany(
    artistNames: string[]
  ): Promise<LastfmArtistLookup[]> {
    const lookups: LastfmArtistLookup[] = [];

    for (
      let batchStart = 0;
      batchStart < artistNames.length;
      batchStart += batchSize
    ) {
      const currentBatch = artistNames.slice(
        batchStart,
        batchStart + batchSize
      );
      const batchLookups = await Promise.all(currentBatch.map(resolveLookup));

      lookups.push(...batchLookups);
    }

    return lookups;
  }

  /**
   * Wykonuje pojedyncze zapytanie i zamienia wyjątek na jawny wynik operacji.
   *
   * @param artistName - Nazwa artysty wysyłana do Last.fm.
   * @returns Wynik `fulfilled` z odpowiedzią albo `rejected` z błędem.
   */
  async function resolveLookup(
    artistName: string
  ): Promise<LastfmArtistLookup> {
    try {
      const response = await requestArtistInfo(artistName);

      return {
        status: "fulfilled",
        requestedName: artistName,
        response,
      };
    } catch (error) {
      logger.error(`Last.fm artist info error for "${artistName}":`, error);

      return {
        status: "rejected",
        requestedName: artistName,
        error,
      };
    }
  }

  return {
    lookupArtist: requestArtistInfo,
    lookupMany,
  };
}

export { createLastfmArtistGateway };
