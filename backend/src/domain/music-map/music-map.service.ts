import { getManyTrackAudioFeaturesBySpotifyIds } from "../../integrations/reccobeats/reccobeats.service.js";
import { getCurrentUserTopTracks } from "../../integrations/spotify/spotify.service.js";
import {
  describeAudioCharacter,
  describeClusterName,
} from "./music-map-descriptions.js";
import { analyzeMusicMapRows } from "./music-map-analysis.js";
import type {
  AnalyzableTrack,
  AudioFeatureValues,
  Coordinate,
  MusicMapAnalysis,
  MusicMapCluster,
  MusicMapFeatureKey,
  MusicMapPoint,
  MusicMapPointContext,
  MusicMapProjection,
  MusicMapProjectionData,
  MusicMapRequest,
  MusicMapSkippedTrack,
  MusicMapSourceData,
  NormalizedPoint,
  SpotifyTopTracksResponse,
  SpotifyTrack,
  TrackAudioFeatures,
  PreparedMusicMapTrack,
  TopTracksSelection,
} from "./music-map.types.js";

/** Cechy audio wykorzystywane do klasteryzacji i projekcji utworów. */
export const MUSIC_MAP_FEATURE_KEYS: MusicMapFeatureKey[] = [
  "acousticness",
  "danceability",
  "energy",
  "instrumentalness",
  "liveness",
  "speechiness",
  "valence",
  "loudness",
  "tempo",
  "key",
  "mode",
];

/**
 * Buduje mapę muzyczną dla top utworów zalogowanego użytkownika.
 * Łączy pobieranie danych ze Spotify i ReccoBeats z analizą domenową.
 *
 * @param input - Token Spotify, filtry utworów i opcjonalna liczba klastrów.
 * @returns Gotowa projekcja mapy muzycznej.
 */
export async function buildMusicMap({
  accessToken,
  limit,
  timeRange,
  clusterCount,
}: MusicMapRequest): Promise<MusicMapProjection> {
  const { tracks, audioFeatures, metadata } =
    await getTopTracksWithAudioFeatures({
      accessToken,
      limit,
      timeRange,
    });

  return buildMusicMapProjection({
    tracks,
    audioFeatures,
    requestedClusterCount: clusterCount,
    metadata,
  });
}

/**
 * Pobiera top utwory Spotify oraz odpowiadające im cechy audio z ReccoBeats.
 *
 * @param input - Token Spotify, limit utworów i analizowany okres.
 * @returns Utwory, cechy audio oraz metadane wykonanego zapytania.
 */
export async function getTopTracksWithAudioFeatures({
  accessToken,
  limit,
  timeRange,
}: TopTracksSelection): Promise<MusicMapSourceData> {
  const topTracks = (await getCurrentUserTopTracks(accessToken, {
    limit,
    timeRange,
  })) as SpotifyTopTracksResponse;
  const tracks = topTracks.items ?? [];
  const trackIds = tracks.map((track) => track.id).filter(Boolean);
  const audioFeatures: TrackAudioFeatures[] = trackIds.length
    ? ((await getManyTrackAudioFeaturesBySpotifyIds(
        trackIds
      )) as TrackAudioFeatures[])
    : [];

  return {
    topTracks,
    tracks,
    audioFeatures,
    metadata: {
      timeRange,
      requestedLimit: limit,
      spotifyReturnedTracksCount: tracks.length,
      spotifyTotalTracksCount: topTracks.total ?? tracks.length,
    },
  };
}

/**
 * Przekształca pobrane utwory i cechy audio w klastry oraz punkty mapy.
 * Funkcja nie pobiera danych z zewnętrznych API.
 *
 * @param input - Utwory, ich cechy audio, ustawienia klastrów i metadane.
 * @returns Wynik analizy gotowy do zwrócenia przez API.
 */
export function buildMusicMapProjection({
  tracks,
  audioFeatures,
  requestedClusterCount = null,
  metadata = {},
}: MusicMapProjectionData): MusicMapProjection {
  const audioFeaturesBySpotifyId = indexAudioFeaturesBySpotifyId(audioFeatures);
  const trackRows = tracks.map((track) =>
    buildTrackFeatureRow(track, audioFeaturesBySpotifyId)
  );
  const { validRows, skippedTracks } = partitionTrackRows(trackRows);

  const featureVectors = validRows.map((track) => track.vector);
  const analysis = analyzeMusicMapRows(
    featureVectors,
    MUSIC_MAP_FEATURE_KEYS,
    requestedClusterCount
  );

  const normalizedPoints = normalizeProjectedCoordinates(analysis.coordinates);
  const clusters = buildClusterSummaries(validRows, analysis.clusterLabels);
  const points = buildMusicMapPoints({
    tracks: validRows,
    clusterLabels: analysis.clusterLabels,
    coordinates: analysis.coordinates,
    normalizedPoints,
    clusters,
  });

  return {
    source: "spotify-top-tracks-reccobeats-audio-features",
    ...metadata,
    requestedClusterCount,
    selectedClusterCount: analysis.selectedClusterCount,
    selectedClusterCountSource: analysis.selectedClusterCountSource,
    appliedClusterCount: getAppliedClusterCount(analysis.clusterLabels),
    candidateClusterResults: analysis.candidateClusterResults,
    featureKeys: MUSIC_MAP_FEATURE_KEYS,
    activeFeatureKeys: analysis.activeFeatureKeys,
    explainedVariance: analysis.explainedVariance,
    tracksWithAudioFeaturesCount: validRows.length,
    skippedTracksCount: skippedTracks.length,
    clusters,
    points,
    skippedTracks,
  };
}

/**
 * Indeksuje cechy audio według identyfikatora utworu Spotify.
 *
 * @param audioFeatures - Wyniki pobrane z ReccoBeats.
 * @returns Mapa umożliwiająca szybkie znalezienie cech dla utworu.
 */
function indexAudioFeaturesBySpotifyId(
  audioFeatures: TrackAudioFeatures[]
): Map<string, TrackAudioFeatures> {
  const indexedFeatures = new Map<string, TrackAudioFeatures>();

  for (const features of audioFeatures) {
    indexedFeatures.set(features.spotifyId, features);
  }

  return indexedFeatures;
}

/**
 * Oddziela utwory gotowe do analizy od utworów bez kompletnych cech audio.
 * Pole `vector` jest usuwane z informacji o pominiętych utworach.
 *
 * @param rows - Wiersze utworów przygotowane do analizy.
 * @returns Poprawne wiersze oraz lista pominiętych utworów.
 */
function partitionTrackRows(rows: PreparedMusicMapTrack[]): {
  validRows: AnalyzableTrack[];
  skippedTracks: MusicMapSkippedTrack[];
} {
  const validRows: AnalyzableTrack[] = [];
  const skippedTracks: MusicMapSkippedTrack[] = [];

  for (const row of rows) {
    if (row.vector) {
      validRows.push(row);
      continue;
    }

    const { vector, ...skippedTrack } = row;
    skippedTracks.push(skippedTrack);
  }

  return { validRows, skippedTracks };
}

/**
 * Łączy wynik projekcji i klasteryzacji z informacjami o utworach.
 *
 * @param input - Wiersze, etykiety klastrów, współrzędne i opisy klastrów.
 * @returns Punkty przeznaczone do wyświetlenia na wykresie.
 */
function buildMusicMapPoints({
  tracks,
  clusterLabels,
  coordinates,
  normalizedPoints,
  clusters,
}: MusicMapPointContext): MusicMapPoint[] {
  const clusterDescriptionsById = new Map<number, string>(
    clusters.map((cluster) => [cluster.id, cluster.description])
  );

  return tracks.map((track, index) => {
    const cluster = clusterLabels[index] ?? 0;
    const normalizedPoint = normalizedPoints[index] ?? { x: 0, y: 0 };
    const [rawX = 0, rawY = 0] = coordinates[index] ?? [];

    return {
      id: track.id,
      name: track.name,
      artists: track.artists,
      album: track.album,
      imageUrl: track.imageUrl,
      spotifyUrl: track.spotifyUrl,
      description: track.description,
      clusterDescription: clusterDescriptionsById.get(cluster) ?? "",
      x: normalizedPoint.x,
      y: normalizedPoint.y,
      rawX: round(rawX),
      rawY: round(rawY),
      cluster,
      audioFeatures: track.audioFeatures,
    };
  });
}

/**
 * Buduje wektor cech pojedynczego utworu.
 * Utwór bez danych lub z niekompletnymi cechami zostaje oznaczony jako pominięty.
 *
 * @param track - Utwór pobrany ze Spotify.
 * @param audioFeaturesBySpotifyId - Cechy audio zindeksowane według Spotify ID.
 * @returns Poprawny wiersz analizy albo wiersz z powodem pominięcia.
 */
function buildTrackFeatureRow(
  track: SpotifyTrack,
  audioFeaturesBySpotifyId: Map<string, TrackAudioFeatures>
): PreparedMusicMapTrack {
  const features = audioFeaturesBySpotifyId.get(track.id);
  const baseTrack = {
    id: track.id,
    name: track.name,
    artists: (track.artists ?? []).map((artist) => artist.name),
    album: track.album?.name ?? null,
    imageUrl: track.album?.images?.[0]?.url ?? null,
    spotifyUrl: track.external_urls?.spotify ?? null,
  };

  if (!features || features.error) {
    return {
      ...baseTrack,
      reason: features?.error ?? "Audio features not found",
      vector: null,
    };
  }

  const vector = MUSIC_MAP_FEATURE_KEYS.map((key) => features[key]);

  if (!vector.every(isNumber)) {
    return {
      ...baseTrack,
      reason: "Incomplete audio features",
      vector: null,
    };
  }

  const audioFeatures = Object.fromEntries(
    MUSIC_MAP_FEATURE_KEYS.map((key, index) => [key, round(vector[index])])
  ) as AudioFeatureValues;

  return {
    ...baseTrack,
    vector,
    audioFeatures,
    description: describeAudioCharacter(audioFeatures),
  };
}

/**
 * Grupuje przeanalizowane utwory według etykiet klastrów i tworzy ich opisy.
 *
 * @param rows - Utwory posiadające kompletne cechy audio.
 * @param clusterLabels - Numer klastra przypisany do każdego wiersza.
 * @returns Posortowane podsumowania klastrów.
 */
function buildClusterSummaries(
  rows: AnalyzableTrack[],
  clusterLabels: number[]
): MusicMapCluster[] {
  const groupedRows = new Map<number, AnalyzableTrack[]>();

  rows.forEach((row, index) => {
    const cluster = clusterLabels[index] ?? 0;
    const clusterRows = groupedRows.get(cluster) ?? [];

    clusterRows.push(row);
    groupedRows.set(cluster, clusterRows);
  });

  return [...groupedRows.entries()]
    .sort(([leftCluster], [rightCluster]) => leftCluster - rightCluster)
    .map(([cluster, clusterRows]) => {
      const audioFeatures = averageAudioFeatures(clusterRows);

      return {
        id: cluster,
        label: describeClusterName(audioFeatures),
        description: describeAudioCharacter(audioFeatures),
        averageAudioFeatures: audioFeatures,
        tracksCount: clusterRows.length,
        trackIds: clusterRows.map((row) => row.id),
      };
    });
}

/**
 * Oblicza średnią wartość każdej cechy audio dla wskazanych utworów.
 *
 * @param rows - Utwory należące do jednego klastra.
 * @returns Uśrednione i zaokrąglone cechy audio klastra.
 */
function averageAudioFeatures(rows: AnalyzableTrack[]): AudioFeatureValues {
  return Object.fromEntries(
    MUSIC_MAP_FEATURE_KEYS.map((key) => [
      key,
      round(average(rows.map((row) => row.audioFeatures[key]))),
    ])
  ) as AudioFeatureValues;
}

/**
 * Skaluje osobno obie osie projekcji do zakresu od -1 do 1.
 *
 * @param coordinates - Surowe współrzędne otrzymane z PCA.
 * @returns Współrzędne gotowe do rozmieszczenia punktów na wykresie.
 */
function normalizeProjectedCoordinates(
  coordinates: Coordinate[]
): NormalizedPoint[] {
  const xValues = coordinates.map(([x]) => x);
  const yValues = coordinates.map(([, y]) => y);
  const xMin = Math.min(...xValues, 0);
  const xMax = Math.max(...xValues, 0);
  const yMin = Math.min(...yValues, 0);
  const yMax = Math.max(...yValues, 0);

  return coordinates.map(([x, y]) => ({
    x: round(normalizeToUnitRange(x, xMin, xMax)),
    y: round(normalizeToUnitRange(y, yMin, yMax)),
  }));
}

/**
 * Przekształca pojedynczą wartość do zakresu od -1 do 1.
 *
 * @param value - Normalizowana wartość.
 * @param min - Najmniejsza wartość na danej osi.
 * @param max - Największa wartość na danej osi.
 * @returns Wartość znormalizowana albo zero, gdy wszystkie wartości są równe.
 */
function normalizeToUnitRange(value: number, min: number, max: number): number {
  if (max === min) {
    return 0;
  }

  return ((value - min) / (max - min)) * 2 - 1;
}

/**
 * Liczy, ile różnych klastrów rzeczywiście występuje w wyniku analizy.
 *
 * @param clusterLabels - Etykiety klastrów przypisane do utworów.
 * @returns Liczba unikalnych etykiet.
 */
function getAppliedClusterCount(clusterLabels: number[]): number {
  return new Set(clusterLabels).size;
}

/**
 * Oblicza średnią arytmetyczną przekazanych wartości.
 *
 * @param values - Wartości liczbowe.
 * @returns Średnia arytmetyczna.
 */
function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Zaokrągla liczbę do wskazanej liczby miejsc po przecinku.
 *
 * @param value - Zaokrąglana liczba.
 * @param digits - Liczba miejsc po przecinku; domyślnie cztery.
 * @returns Zaokrąglona liczba.
 */
function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

/**
 * Sprawdza, czy wartość cechy audio jest liczbą.
 * Pełni również rolę strażnika typu podczas walidacji wektora.
 *
 * @param value - Sprawdzana wartość cechy.
 * @returns `true`, jeśli wartość jest liczbą.
 */
function isNumber(value: number | null | undefined): value is number {
  return typeof value === "number";
}
