import type {
  ErrorLogger,
  LastfmArtistApiResponse,
  LastfmArtistGateway,
  LastfmArtistLookup,
} from "./types.js";

/**
 * Określa zależności gatewaya artystów Last.fm.
 *
 * @property requestArtistInfo - Adapter wykonujący pojedyncze zapytanie `artist.getInfo`.
 * @property logger - Logger rejestrujący nieudane zapytania zbiorcze.
 */
type LastfmArtistGatewayDependencies = {
  requestArtistInfo: (artistName: string) => Promise<LastfmArtistApiResponse>;
  logger?: ErrorLogger;
};

/**
 * Tworzy gateway odpowiedzialny za pobieranie danych artystów z Last.fm.
 * Ograniczanie równoległości i tempa wywołań HTTP pozostawia schedulerowi
 * skonfigurowanemu w kliencie Last.fm.
 *
 * @param dependencies - Adapter HTTP i opcjonalny logger.
 * @returns Gateway obsługujący zapytania o jednego lub wielu artystów.
 */
function createLastfmArtistGateway({
  requestArtistInfo,
  logger = console,
}: LastfmArtistGatewayDependencies): LastfmArtistGateway {
  /**
   * Pobiera dane wielu artystów, zachowując kolejność wejściową.
   * Błąd pojedynczego zapytania staje się wynikiem `rejected`, więc pozostałe
   * dane nadal mogą zostać wykorzystane.
   *
   * @param artistNames - Nazwy artystów do pobrania.
   * @returns Wynik dla każdej przekazanej nazwy, w tej samej kolejności.
   */
  function lookupMany(artistNames: string[]): Promise<LastfmArtistLookup[]> {
    return Promise.all(artistNames.map(resolveLookup));
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
