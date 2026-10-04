import type {
  MusicMapFeatureKey,
  MusicMapRequest,
} from "@domain/music-map/types.js";

/** Minimalne dane utworu wymagane od źródła katalogu muzycznego. */
type MusicMapSourceTrack = {
  id: string;
  name: string;
  artists: { name: string }[];
  album?: {
    name: string;
    images?: { url: string }[];
  };
  external_urls?: { spotify?: string };
};

/** Wynik pobrania utworów przeznaczonych do analizy mapy muzycznej. */
type MusicMapTracksPage = {
  items: MusicMapSourceTrack[];
  total: number;
};

/** Źródło utworów użytkownika potrzebnych do zbudowania mapy. */
type MusicMapTracksReader = {
  getCurrentUserTopTracks(
    accessToken: string,
    selection: Pick<MusicMapRequest, "limit" | "timeRange">
  ): Promise<MusicMapTracksPage>;
};

/** Cechy audio znalezione przez zewnętrzne źródło danych. */
type MusicMapSourceAudioFeatures = {
  spotifyId: string;
  id?: string;
  timeSignature?: number | null;
} & Partial<Record<MusicMapFeatureKey, number | null>>;

/** Nieudane wyszukanie cech audio dla wskazanego utworu. */
type MusicMapSourceAudioFeaturesError = {
  spotifyId: string;
  error: string;
};

/** Wynik wyszukania cech audio zwracany przez źródło danych. */
type MusicMapSourceAudioFeaturesResult =
  MusicMapSourceAudioFeatures | MusicMapSourceAudioFeaturesError;

/** Źródło cech audio dla wielu identyfikatorów Spotify. */
type MusicMapAudioFeaturesReader = {
  getManyTrackAudioFeaturesBySpotifyIds(
    spotifyIds: string[]
  ): Promise<MusicMapSourceAudioFeaturesResult[]>;
};

export type {
  MusicMapSourceTrack,
  MusicMapTracksReader,
  MusicMapSourceAudioFeaturesResult,
  MusicMapAudioFeaturesReader,
};
