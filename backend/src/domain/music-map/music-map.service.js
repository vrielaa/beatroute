import { kmeans } from "ml-kmeans";
import { PCA } from "ml-pca";

import { getManyTrackAudioFeaturesBySpotifyIds } from "../../integrations/reccobeats/reccobeats.service.js";
import { getCurrentUserTopTracks } from "../../integrations/spotify/spotify.service.js";

export const MUSIC_MAP_FEATURE_KEYS = [
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

const DEFAULT_KMEANS_SEED = 42;
const MAX_AUTO_CLUSTER_COUNT = 8;
const METHODOLOGY_TEXT =
  "Mapa została utworzona na podstawie cech audio utworów. Liczbę klastrów można ustawić suwakiem, a wyniki silhouette score i inertia pomagają ocenić podział. Pozycje punktów wyznaczono metodą PCA.";

export async function buildMusicMap({
  accessToken,
  limit,
  timeRange,
  clusterCount,
}) {
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

export async function getTopTracksWithAudioFeatures({
  accessToken,
  limit,
  timeRange,
}) {
  const topTracks = await getCurrentUserTopTracks(accessToken, {
    limit,
    timeRange,
  });
  const tracks = topTracks.items ?? [];
  const trackIds = tracks.map((track) => track.id).filter(Boolean);
  const audioFeatures = trackIds.length
    ? await getManyTrackAudioFeaturesBySpotifyIds(trackIds)
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

export function buildMusicMapProjection({
  tracks,
  audioFeatures,
  requestedClusterCount = null,
  metadata = {},
}) {
  const audioFeaturesBySpotifyId = new Map(
    audioFeatures
      .filter((features) => features?.spotifyId)
      .map((features) => [features.spotifyId, features])
  );
  const rows = tracks.map((track) =>
    buildTrackFeatureRow(track, audioFeaturesBySpotifyId)
  );
  const validRows = rows.filter((row) => row.vector);
  const skippedTracks = rows
    .filter((row) => !row.vector)
    .map(({ vector, ...row }) => row);
  const analysis = analyzeRows(validRows, requestedClusterCount);
  const normalizedPoints = normalizeProjectedCoordinates(analysis.coordinates);
  const clusters = buildClusterSummaries(validRows, analysis.clusterLabels);
  const clusterDescriptionsById = new Map(
    clusters.map((cluster) => [cluster.id, cluster.description])
  );

  return {
    source: "spotify-top-tracks-reccobeats-audio-features",
    methodologyText: METHODOLOGY_TEXT,
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
    points: validRows.map((row, index) => {
      const cluster = analysis.clusterLabels[index] ?? 0;

      return {
        id: row.id,
        name: row.name,
        artists: row.artists,
        album: row.album,
        imageUrl: row.imageUrl,
        spotifyUrl: row.spotifyUrl,
        description: row.description,
        clusterDescription: clusterDescriptionsById.get(cluster) ?? "",
        x: normalizedPoints[index].x,
        y: normalizedPoints[index].y,
        rawX: round(analysis.coordinates[index]?.[0] ?? 0),
        rawY: round(analysis.coordinates[index]?.[1] ?? 0),
        cluster,
        audioFeatures: row.audioFeatures,
      };
    }),
    skippedTracks,
  };
}

function buildTrackFeatureRow(track, audioFeaturesBySpotifyId) {
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

  if (vector.some((value) => typeof value !== "number")) {
    return {
      ...baseTrack,
      reason: "Incomplete audio features",
      vector: null,
    };
  }

  const audioFeatures = Object.fromEntries(
    MUSIC_MAP_FEATURE_KEYS.map((key, index) => [key, round(vector[index])])
  );

  return {
    ...baseTrack,
    vector,
    audioFeatures,
    description: describeAudioCharacter(audioFeatures),
  };
}

function analyzeRows(rows, requestedClusterCount) {
  const activeFeatureIndexes = getVariableFeatureIndexes(rows);
  const activeFeatureKeys = activeFeatureIndexes.map(
    (index) => MUSIC_MAP_FEATURE_KEYS[index]
  );

  if (rows.length < 2 || !activeFeatureIndexes.length) {
    return buildFallbackAnalysis(rows, activeFeatureKeys);
  }

  const rawMatrix = rows.map((row) =>
    activeFeatureIndexes.map((index) => row.vector[index])
  );
  const scaledMatrix = standardizeMatrix(rawMatrix);
  const candidateClusterResults = evaluateClusterCandidates(scaledMatrix);
  const maxSupportedClusterCount = getMaxSupportedClusterCount(scaledMatrix);
  const selectedClusterCount = selectClusterCount({
    candidateClusterResults,
    maxSupportedClusterCount,
    requestedClusterCount,
  });
  const selectedClusterCountSource = requestedClusterCount
    ? "manual"
    : candidateClusterResults.length
    ? "silhouette-score"
    : "fallback";
  const clusterLabels = clusterMatrix(scaledMatrix, selectedClusterCount);
  const projection = projectScaledMatrix(scaledMatrix);

  return {
    activeFeatureKeys,
    selectedClusterCount,
    selectedClusterCountSource,
    candidateClusterResults,
    clusterLabels,
    coordinates: projection.coordinates,
    explainedVariance: projection.explainedVariance,
  };
}

function buildFallbackAnalysis(rows, activeFeatureKeys) {
  return {
    activeFeatureKeys,
    selectedClusterCount: rows.length ? 1 : 0,
    selectedClusterCountSource: "fallback",
    candidateClusterResults: [],
    clusterLabels: rows.map(() => 0),
    coordinates: rows.map(() => [0, 0]),
    explainedVariance: [],
  };
}

function getVariableFeatureIndexes(rows) {
  if (rows.length < 2) {
    return [];
  }

  return MUSIC_MAP_FEATURE_KEYS.flatMap((_, featureIndex) => {
    const values = rows.map((row) => row.vector[featureIndex]);
    const min = Math.min(...values);
    const max = Math.max(...values);

    return min === max ? [] : [featureIndex];
  });
}

function standardizeMatrix(matrix) {
  const columnsCount = matrix[0]?.length ?? 0;
  const means = Array.from({ length: columnsCount }, (_, columnIndex) =>
    average(matrix.map((row) => row[columnIndex]))
  );
  const standardDeviations = Array.from(
    { length: columnsCount },
    (_, columnIndex) => {
      const values = matrix.map((row) => row[columnIndex]);
      const mean = means[columnIndex];
      const variance = average(values.map((value) => (value - mean) ** 2));
      const standardDeviation = Math.sqrt(variance);

      return standardDeviation || 1;
    }
  );

  return matrix.map((row) =>
    row.map(
      (value, columnIndex) =>
        (value - means[columnIndex]) / standardDeviations[columnIndex]
    )
  );
}

function evaluateClusterCandidates(matrix) {
  const maxClusterCount = getMaxSupportedClusterCount(matrix);

  if (maxClusterCount < 2) {
    return [];
  }

  return Array.from({ length: maxClusterCount - 1 }, (_, index) => {
    const clusterCount = index + 2;
    const result = kmeans(matrix, clusterCount, {
      seed: DEFAULT_KMEANS_SEED,
    });

    return {
      k: clusterCount,
      inertia: round(calculateInertia(matrix, result), 4),
      silhouetteScore: round(
        calculateSilhouetteScore(matrix, result.clusters),
        4
      ),
    };
  });
}

function selectClusterCount({
  candidateClusterResults,
  maxSupportedClusterCount,
  requestedClusterCount,
}) {
  if (requestedClusterCount) {
    return Math.min(requestedClusterCount, maxSupportedClusterCount);
  }

  if (!candidateClusterResults.length) {
    return 1;
  }

  return candidateClusterResults.reduce((bestResult, result) => {
    if (result.silhouetteScore > bestResult.silhouetteScore) {
      return result;
    }

    if (
      result.silhouetteScore === bestResult.silhouetteScore &&
      result.k < bestResult.k
    ) {
      return result;
    }

    return bestResult;
  }).k;
}

function getMaxSupportedClusterCount(matrix) {
  return Math.min(
    MAX_AUTO_CLUSTER_COUNT,
    matrix.length - 1,
    getUniqueRowsCount(matrix)
  );
}

function clusterMatrix(matrix, clusterCount) {
  if (clusterCount < 2) {
    return matrix.map(() => 0);
  }

  return kmeans(matrix, clusterCount, {
    seed: DEFAULT_KMEANS_SEED,
  }).clusters;
}

function projectScaledMatrix(matrix) {
  if (matrix.length < 2 || !matrix[0]?.length) {
    return {
      coordinates: matrix.map(() => [0, 0]),
      explainedVariance: [],
    };
  }

  if (matrix[0].length === 1) {
    return projectSingleFeature(matrix);
  }

  const pca = new PCA(matrix, { center: false, scale: false });
  const coordinates = pca.predict(matrix, { nComponents: 2 }).to2DArray();

  return {
    coordinates,
    explainedVariance: pca
      .getExplainedVariance()
      .slice(0, 2)
      .map((value) => round(value, 4)),
  };
}

function projectSingleFeature(matrix) {
  const values = matrix.map((row) => row[0]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;

  return {
    coordinates: values.map((value) => [((value - min) / spread) * 2 - 1, 0]),
    explainedVariance: [1],
  };
}

function calculateInertia(matrix, result) {
  return matrix.reduce((sum, row, index) => {
    const centroid = result.centroids[result.clusters[index]];

    return sum + squaredEuclideanDistance(row, centroid);
  }, 0);
}

function calculateSilhouetteScore(matrix, clusterLabels) {
  const uniqueClusters = [...new Set(clusterLabels)];

  if (uniqueClusters.length < 2) {
    return 0;
  }

  const scores = matrix.map((row, index) => {
    const ownCluster = clusterLabels[index];
    const ownClusterRows = matrix.filter(
      (_, rowIndex) =>
        clusterLabels[rowIndex] === ownCluster && rowIndex !== index
    );

    if (!ownClusterRows.length) {
      return 0;
    }

    const ownClusterDistance = average(
      ownClusterRows.map((otherRow) => euclideanDistance(row, otherRow))
    );
    const nearestOtherClusterDistance = Math.min(
      ...uniqueClusters
        .filter((cluster) => cluster !== ownCluster)
        .map((cluster) => {
          const clusterRows = matrix.filter(
            (_, rowIndex) => clusterLabels[rowIndex] === cluster
          );

          return average(
            clusterRows.map((otherRow) => euclideanDistance(row, otherRow))
          );
        })
    );
    const denominator = Math.max(
      ownClusterDistance,
      nearestOtherClusterDistance
    );

    return denominator === 0
      ? 0
      : (nearestOtherClusterDistance - ownClusterDistance) / denominator;
  });

  return average(scores);
}

function buildClusterSummaries(rows, clusterLabels) {
  const groupedRows = new Map();

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

function averageAudioFeatures(rows) {
  return Object.fromEntries(
    MUSIC_MAP_FEATURE_KEYS.map((key) => [
      key,
      round(average(rows.map((row) => row.audioFeatures[key]))),
    ])
  );
}

function describeClusterName(features) {
  if (features.energy >= 0.65 && features.danceability >= 0.6) {
    return "Energetyczne i taneczne";
  }

  if (features.energy <= 0.45 && features.acousticness >= 0.45) {
    return "Spokojne i akustyczne";
  }

  if (features.valence <= 0.35) {
    return "Melancholijne";
  }

  if (features.speechiness >= 0.33) {
    return "Mówione i rapowe";
  }

  if (features.instrumentalness >= 0.45) {
    return "Instrumentalne";
  }

  if (features.tempo >= 130) {
    return "Szybsze i rytmiczne";
  }

  return "Umiarkowane cechy audio";
}

function describeAudioCharacter(features) {
  const labels = [];

  if (features.energy >= 0.7 && features.tempo >= 120) {
    labels.push("dynamiczny i pobudzający");
  } else if (features.energy <= 0.4 && features.tempo <= 100) {
    labels.push("spokojny i wyciszony");
  }

  if (features.danceability >= 0.65 && features.energy >= 0.55) {
    labels.push("rytmiczny i taneczny");
  }

  if (features.valence >= 0.6 && features.energy >= 0.55) {
    labels.push("pogodny i energetyczny");
  } else if (features.valence >= 0.6) {
    labels.push("jasny i pozytywny");
  } else if (features.valence <= 0.35 && features.energy >= 0.6) {
    labels.push("intensywny, ale melancholijny");
  } else if (features.valence <= 0.35) {
    labels.push("melancholijny i ciemniejszy w nastroju");
  }

  if (features.acousticness >= 0.5 && features.energy <= 0.55) {
    labels.push("kameralny i organiczny");
  } else if (features.acousticness >= 0.5) {
    labels.push("bardziej akustyczny");
  }

  if (features.speechiness >= 0.66) {
    labels.push("oparty głównie na mowie");
  } else if (features.speechiness >= 0.33) {
    labels.push("z wyraźną partią mówioną lub rapową");
  }

  if (features.instrumentalness >= 0.5) {
    labels.push("z wyraźnymi elementami instrumentalnymi");
  }

  if (features.liveness >= 0.6) {
    labels.push("brzmiący jak nagranie live");
  }

  if (features.loudness >= -6 && features.energy >= 0.6) {
    labels.push("mocno wyeksponowany brzmieniowo");
  } else if (features.loudness <= -12 && features.energy <= 0.5) {
    labels.push("delikatnie zmiksowany");
  }

  if (features.tempo >= 140) {
    labels.push("szybkie tempo");
  } else if (features.tempo <= 90) {
    labels.push("wolniejsze tempo");
  }

  return labels.length
    ? labels.join(", ")
    : "bez jednej dominującej cechy: energia, taneczność, nastrój, akustyczność, mowa, instrumentalność i tempo są bliżej wartości pośrednich";
}

function normalizeProjectedCoordinates(coordinates) {
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

function normalizeToUnitRange(value, min, max) {
  if (max === min) {
    return 0;
  }

  return ((value - min) / (max - min)) * 2 - 1;
}

function getAppliedClusterCount(clusterLabels) {
  return new Set(clusterLabels).size;
}

function getUniqueRowsCount(matrix) {
  return new Set(
    matrix.map((row) => row.map((value) => round(value, 8)).join(":"))
  ).size;
}

function squaredEuclideanDistance(left, right) {
  return left.reduce(
    (sum, value, index) => sum + (value - right[index]) ** 2,
    0
  );
}

function euclideanDistance(left, right) {
  return Math.sqrt(squaredEuclideanDistance(left, right));
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value, digits = 4) {
  return Number(value.toFixed(digits));
}
