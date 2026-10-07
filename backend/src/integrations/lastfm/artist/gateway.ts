import type {
  ErrorLogger,
  LastfmArtistApiResponse,
  LastfmArtistGateway,
  LastfmArtistInfoResult,
} from "./types.js";

/**
 * Określa zależności gatewaya artystów Last.fm.
 *
 * @property fetchArtistInfo - Adapter wykonujący pojedyncze zapytanie `artist.getInfo`.
 * @property logger - Logger rejestrujący nieudane zapytania zbiorcze.
 */
type LastfmArtistGatewayDependencies = {
  fetchArtistInfo: (artistName: string) => Promise<LastfmArtistApiResponse>;
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
  fetchArtistInfo,
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
  function getManyArtistInfoResults(
    artistNames: string[]
  ): Promise<LastfmArtistInfoResult[]> {
    return Promise.all(artistNames.map(getArtistInfoResult));
  }

  /**
   * Wykonuje pojedyncze zapytanie i zamienia wyjątek na jawny wynik operacji.
   *
   * @param artistName - Nazwa artysty wysyłana do Last.fm.
   * @returns Wynik `fulfilled` z odpowiedzią albo `rejected` z błędem.
   */
  async function getArtistInfoResult(
    artistName: string
  ): Promise<LastfmArtistInfoResult> {
    try {
      const response = await fetchArtistInfo(artistName);

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
    getArtistInfo: fetchArtistInfo,
    getManyArtistInfoResults,
  };
}

export { createLastfmArtistGateway };
