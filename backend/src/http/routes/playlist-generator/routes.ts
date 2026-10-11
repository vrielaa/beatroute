import { Router } from "express";
import { generatePlaylist } from "@domain/playlist-generator/generate-playlist.js";
import { parsePlaylistGeneratorDataset } from "@http/routes/playlist-generator/dataset.validator.js";
import { parsePlaylistGeneratorRequirements } from "@http/routes/playlist-generator/requirements.validator.js";
import { parsePlaylistGeneratorPreferences } from "@http/routes/playlist-generator/preferences.validator.js";
import { parsePlaylistTrackIdsFile } from "./track-ids.validator.js";
import { playlistDatasetService } from "./composition.js";
import ensureSpotifyAccessToken from "@integrations/spotify/middleware/ensureSpotifyAccessToken.js";
import type { RequestHandler } from "express";

/**
 * Operacja przygotowania zbioru oraz autoryzacja żądań korzystających z API.
 * Typ prepareDataset wynika z implementacji serwisu, bez osobnego typu całego serwisu.
 *
 * @property prepareDataset - Uzupełnia zwalidowane ID o metadane i cechy audio.
 * @property authorize - Sprawdza i w razie potrzeby odnawia token w sesji Spotify.
 */
type PlaylistGeneratorRouterDependencies = {
  prepareDataset: typeof playlistDatasetService.prepareDataset;
  authorize: RequestHandler;
};

/**
 * Tworzy router przygotowania danych i generowania playlisty.
 * Endpoint POST /prepare-dataset wymaga sesji Spotify. Odczytuje z req.body:
 * - version: liczbową wersję formatu 1;
 * - spotifyTrackIds: od 1 do 500 identyfikatorów utworów Spotify.
 * Walidator przycina ID i usuwa duplikaty przed pobieraniem danych.
 * Token bierze z req.session.spotify.accessToken po wykonaniu authorize,
 * nigdy z body. Zwraca dataset, skippedTracks i incompleteTracks.
 * Pusty przygotowany zbiór jest poprawnym wynikiem odczytu, ale nie wejściem generatora.
 *
 * Endpoint POST /generate odczytuje trzy pola req.body:
 * - dataset: zbiór wersji 1, zawierający od 1 do 500 utworów z cechami audio;
 * - requirements: zakres BPM i maksima speechiness oraz liveness, z null dla wyłączenia;
 * - preferences: poziomy pięciu cech wpływających na ranking, z null dla wyłączenia.
 * Każde pole sprawdza odpowiedni walidator przed wywołaniem generatora domenowego.
 * Brak body lub pola skutkuje błędem walidacji, obsługiwanym przez centralny middleware.
 * Zwraca JSON z rankedTracks i rejectedTracks; pusty ranking jest poprawnym wynikiem.
 * Samo generowanie nie wymaga sesji Spotify ani pobierania danych z API.
 * Parsowanie JSON-a i limit 1 MiB dla tego routera są skonfigurowane w app.ts,
 * przed parserem ogólnym.
 *
 * @param dependencies - Przygotowanie zbioru i middleware autoryzacji Spotify.
 * @returns Router Express obsługujący przygotowanie i analizę zbioru playlisty.
 */
function createPlaylistGeneratorRouter({
  prepareDataset,
  authorize,
}: PlaylistGeneratorRouterDependencies): Router {
  const router = Router();

  router.post("/prepare-dataset", authorize, async (req, res) => {
    const file = parsePlaylistTrackIdsFile(req.body);
    const preparedDataset = await prepareDataset(
      file,
      req.session.spotify!.accessToken
    );

    res.json(preparedDataset);
  });

  router.post("/generate", (req, res) => {
    const dataset = parsePlaylistGeneratorDataset(req.body?.dataset);
    const requirements = parsePlaylistGeneratorRequirements(
      req.body?.requirements
    );
    const preferences = parsePlaylistGeneratorPreferences(
      req.body?.preferences
    );

    const generatedPlaylist = generatePlaylist(
      dataset,
      requirements,
      preferences
    );

    res.json(generatedPlaylist);
  });

  return router;
}

/** Router montowany w app.ts pod /api/playlist-generator. */
const playlistGeneratorRouter = createPlaylistGeneratorRouter({
  prepareDataset: playlistDatasetService.prepareDataset,
  authorize: ensureSpotifyAccessToken,
});

export { createPlaylistGeneratorRouter };
export default playlistGeneratorRouter;
