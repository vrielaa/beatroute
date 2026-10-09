import { Router } from "express";
import { generatePlaylist } from "@domain/playlist-generator/generate-playlist.js";
import { parsePlaylistGeneratorDataset } from "@http/routes/playlist-generator/dataset.validator.js";
import { parsePlaylistGeneratorRequirements } from "@http/routes/playlist-generator/requirements.validator.js";
import { parsePlaylistGeneratorPreferences } from "@http/routes/playlist-generator/preferences.validator.js";

/**
 * Tworzy router generowania playlisty z dostarczonego zbioru i pomiarów.
 * Endpoint POST /generate odczytuje trzy pola req.body:
 * - dataset: zbiór wersji 1, zawierający od 1 do 500 utworów z cechami audio;
 * - requirements: zakres BPM i maksima speechiness oraz liveness, z null dla wyłączenia;
 * - preferences: poziomy pięciu cech wpływających na ranking, z null dla wyłączenia.
 * Każde pole sprawdza odpowiedni walidator przed wywołaniem generatora domenowego.
 * Brak body lub pola skutkuje błędem walidacji, obsługiwanym przez centralny middleware.
 * Zwraca JSON z rankedTracks i rejectedTracks; pusty ranking jest poprawnym wynikiem.
 * Nie wymaga sesji Spotify ani pobierania danych z API. Parsowanie JSON-a i limit
 * 1 MiB dla tego routera są skonfigurowane w app.ts, przed parserem ogólnym.
 *
 * @returns Router Express obsługujący plikowy wariant generatora playlist.
 */
function createPlaylistGeneratorRouter(): Router {
  const router = Router();

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
const playlistGeneratorRouter = createPlaylistGeneratorRouter();

export default playlistGeneratorRouter;
