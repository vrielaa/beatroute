import { defaultReccoBeatsGateway } from "./reccobeats.gateway.js";
import { mapReccoBeatsAudioFeatures } from "./reccobeats.mapper.js";
import type { ReccoBeatsTrackAudioFeaturesResult } from "./reccobeats.types.js";
import type { ReccoBeatsGateway } from "./reccobeats.gateway.js";

/** Zależności wymagane przez serwis cech audio ReccoBeats. */
type ReccoBeatsServiceDependencies = {
  /** Gateway wyszukujący utwory i pobierający ich surowe cechy audio. */
  reccoBeatsGateway: ReccoBeatsGateway;
};

/**
 * Tworzy serwis wyszukujący utwory Spotify w ReccoBeats i pobierający ich
 * znormalizowane cechy audio. Wstrzyknięty gateway oddziela logikę serwisu od
 * komunikacji HTTP i pozwala zastąpić zewnętrzne API atrapą w testach.
 *
 * @param dependencies - Gateway udostępniający dane ReccoBeats.
 * @returns Operacje pobierania cech audio dla jednego lub wielu utworów Spotify.
 */
export function createReccoBeatsService({
  reccoBeatsGateway,
}: ReccoBeatsServiceDependencies) {
  /**
   * Pobiera i normalizuje cechy audio utworu wskazanego identyfikatorem ReccoBeats.
   *
   * @param trackId - Wewnętrzny identyfikator utworu ReccoBeats.
   * @returns Komplet cech audio z brakującymi wartościami zastąpionymi przez `null`.
   */
  async function getTrackAudioFeaturesByReccoBeatsId(trackId: string) {
    const data = await reccoBeatsGateway.getTrackAudioFeatures(trackId);

    return mapReccoBeatsAudioFeatures(data);
  }

  /**
   * Wyszukuje utwór po identyfikatorze Spotify, a następnie pobiera jego cechy audio.
   *
   * @param spotifyTrackId - Identyfikator utworu Spotify.
   * @returns Cechy audio wraz z identyfikatorami Spotify i ReccoBeats.
   * @throws {Error} Gdy ReccoBeats nie zwróci odpowiadającego utworu.
   */
  async function getTrackAudioFeaturesBySpotifyId(spotifyTrackId: string) {
    const tracks = await reccoBeatsGateway.findTracksBySpotifyIds([
      spotifyTrackId,
    ]);

    const track = tracks[0] ?? null;

    const reccoBeatsId = track?.id;

    if (!reccoBeatsId) {
      throw new Error(
        `ReccoBeats track not found for Spotify ID: ${spotifyTrackId}`
      );
    }

    const audio = await getTrackAudioFeaturesByReccoBeatsId(reccoBeatsId);

    return {
      id: reccoBeatsId,
      spotifyId: spotifyTrackId,
      ...audio,
    };
  }

  /**
   * Pobiera cechy audio dla wielu utworów Spotify.
   * Brak dopasowania albo błąd pojedynczego zapytania zapisuje w wyniku danego
   * utworu, nie przerywając przetwarzania pozostałych elementów.
   *
   * @param spotifyTrackIds - Identyfikatory utworów Spotify do przetworzenia.
   * @returns Wynik dla każdego identyfikatora: cechy audio albo opis błędu.
   */
  async function getManyTrackAudioFeaturesBySpotifyIds(
    spotifyTrackIds: string[]
  ): Promise<ReccoBeatsTrackAudioFeaturesResult[]> {
    const tracks = await reccoBeatsGateway.findTracksBySpotifyIds(
      spotifyTrackIds
    );

    const idMap = new Map();

    for (const track of tracks) {
      const spotifyId = getSpotifyIdFromHref(track?.href);

      if (spotifyId && track?.id) {
        idMap.set(spotifyId, track.id);
      }
    }

    const results = await Promise.all(
      spotifyTrackIds.map(async (spotifyId) => {
        const reccoBeatsId = idMap.get(spotifyId);

        if (!reccoBeatsId) {
          return {
            spotifyId,
            error: "ReccoBeats track not found",
          };
        }

        try {
          const audio = await getTrackAudioFeaturesByReccoBeatsId(reccoBeatsId);

          return {
            id: reccoBeatsId,
            spotifyId,
            ...audio,
          };
        } catch (error) {
          console.error(
            "[ReccoBeats service] audio fetch error for",
            spotifyId,
            error
          );

          return {
            spotifyId,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      })
    );

    return results;
  }

  /**
   * Odczytuje identyfikator utworu Spotify z odnośnika zwróconego przez ReccoBeats.
   *
   * @param href - Odnośnik do utworu Spotify albo brak wartości.
   * @returns Identyfikator Spotify lub `null`, jeśli odnośnik ma inny format.
   */
  function getSpotifyIdFromHref(
    href: string | undefined | null
  ): string | null {
    if (!href) {
      return null;
    }

    const match = href.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/);
    return match?.[1] ?? null;
  }

  return {
    getTrackAudioFeaturesBySpotifyId,
    getManyTrackAudioFeaturesBySpotifyIds,
  };
}

/** Serwis ReccoBeats korzystający z produkcyjnej konfiguracji gatewaya. */
export const reccoBeatsService = createReccoBeatsService({
  reccoBeatsGateway: defaultReccoBeatsGateway,
});
