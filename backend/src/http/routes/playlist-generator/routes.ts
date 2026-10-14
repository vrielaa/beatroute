import { Router } from "express";
import { generatePlaylist } from "@domain/playlist-generator/generate-playlist.js";
import { parsePlaylistGeneratorDataset } from "@http/routes/playlist-generator/dataset.validator.js";
import { parsePlaylistGeneratorRequirements } from "@http/routes/playlist-generator/requirements.validator.js";
import { parsePlaylistGeneratorPreferences } from "@http/routes/playlist-generator/preferences.validator.js";
import { parsePlaylistTrackIdsFile } from "./track-ids.validator.js";
import {
  parsePlaylistToSave,
  parsePlaylistResumeId,
} from "./save-playlist.validator.js";
import { PartialPlaylistSaveError } from "@application/playlist-generator/partial-playlist-save.error.js";
import { saveSession } from "@http/session.js";
import { playlistDatasetService, playlistSaveService } from "./composition.js";
import { HttpError } from "@http/errors/http-error.js";
import ensureSpotifyAccessToken from "@integrations/spotify/middleware/ensureSpotifyAccessToken.js";
import type { RequestHandler } from "express";

/**
 * Operacje przygotowania zbioru i zapisu playlisty oraz autoryzacja żądań do API.
 * Typy operacji wynikają z implementacji, bez osobnych typów całych serwisów.
 *
 * @property prepareDataset - Uzupełnia zwalidowane ID o metadane i cechy audio.
 * @property savePlaylist - Zapisuje wybrane ID jako nową, prywatną playlistę.
 * @property resumePlaylist - Sprawdza istniejącą playlistę i dopisuje brakującą końcówkę wyboru.
 * @property authorize - Sprawdza i w razie potrzeby odnawia token w sesji Spotify.
 */
type PlaylistGeneratorRouterDependencies = {
  prepareDataset: typeof playlistDatasetService.prepareDataset;
  savePlaylist: typeof playlistSaveService.savePlaylist;
  resumePlaylist: typeof playlistSaveService.resumePlaylist;
  authorize: RequestHandler;
};

/**
 * Tworzy router przygotowania danych, generowania i zapisu playlisty.
 * Endpoint POST /prepare-dataset wymaga sesji Spotify. Odczytuje z req.body:
 * - version: liczbową wersję formatu 1;
 * - spotifyTrackIds: od 1 do 500 identyfikatorów utworów Spotify.
 * Walidator przycina ID i usuwa duplikaty przed pobieraniem danych.
 * Token bierze z req.session.spotify.accessToken po wykonaniu authorize,
 * nigdy z body. Kontekst cache metadanych bierze z req.sessionID, nie z pliku
 * ani body; odnowienie tokenu bez zmiany sesji zachowuje dostęp do wpisów.
 * Zwraca dataset, skippedTracks i incompleteTracks bez identyfikatora sesji.
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
 *
 * Endpoint POST /save wymaga sesji i uprawnienia playlist-modify-private.
 * Odczytuje dwa pola req.body:
 * - name: nazwę nowej playlisty, od 1 do 100 znaków po przycięciu;
 * - trackIds: od 1 do 500 unikalnych Spotify ID w kolejności wybranej przez użytkownika.
 * Waliduje body i przekazuje token wyłącznie z sesji po wykonaniu authorize.
 * Nie przyjmuje tokenu, ID docelowej playlisty ani ustawienia public z body.
 * Nie przelicza rankingu ani nie sprawdza ponownie kryteriów generatora.
 * Zwraca 201 z id, name, spotifyUrl i trackCount dopiero po potwierdzeniu zapisu.
 * Błąd przerywa zapis bez ponawiania; po utworzeniu playlisty centralny middleware
 * zwraca PLAYLIST_SAVE_INCOMPLETE z jej danymi i liczbą potwierdzonych utworów.
 * Pierwotny wybór i postęp są wówczas zachowane w req.session.pendingPlaylistSave.
 *
 * Endpoint POST /resume-save wymaga sesji oraz uprawnień playlist-modify-private
 * i playlist-read-private. Odczytuje z req.body wyłącznie playlistId i porównuje je
 * z zapisem oczekującym w sesji. Utwory, kolejność i dane playlisty pochodzą z sesji,
 * nie z żądania. Sukces zwraca 200 i usuwa stan oczekujący. Kolejny błąd zapisu
 * aktualizuje postęp, a błąd odczytu lub konflikt pozostawia poprzedni stan.
 *
 * Parsowanie JSON-a i limit 1 MiB dla tego routera są skonfigurowane w app.ts,
 * przed parserem ogólnym.
 *
 * @param dependencies - Przygotowanie zbioru, zapis playlisty i autoryzacja Spotify.
 * @returns Router Express obsługujący przygotowanie, analizę i zapis playlisty.
 */
function createPlaylistGeneratorRouter({
  prepareDataset,
  savePlaylist,
  resumePlaylist,
  authorize,
}: PlaylistGeneratorRouterDependencies): Router {
  const router = Router();

  router.post("/prepare-dataset", authorize, async (req, res) => {
    const file = parsePlaylistTrackIdsFile(req.body);
    const preparedDataset = await prepareDataset(
      file,
      req.session.spotify!.accessToken,
      req.sessionID
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

  router.post("/save", authorize, async (req, res) => {
    const spotifySession = req.session.spotify!;
    const grantedScopes = (spotifySession.scope ?? "").split(/\s+/);

    if (!grantedScopes.includes("playlist-modify-private")) {
      throw new HttpError(
        403,
        "SPOTIFY_PLAYLIST_PERMISSION_REQUIRED",
        "Połącz ponownie konto Spotify i zezwól na zapisywanie prywatnych playlist"
      );
    }

    const playlist = parsePlaylistToSave(req.body);
    try {
      const savedPlaylist = await savePlaylist(
        playlist,
        spotifySession.accessToken
      );
      delete req.session.pendingPlaylistSave;
      await saveSession(req.session);
      res.status(201).json(savedPlaylist);
    } catch (error) {
      if (error instanceof PartialPlaylistSaveError) {
        req.session.pendingPlaylistSave = {
          progress: { ...error.progress },
          trackIds: [...playlist.trackIds],
        };
        await saveSession(req.session);
      }

      throw error;
    }
  });

  router.post("/resume-save", authorize, async (req, res) => {
    const spotifySession = req.session.spotify!;
    const grantedScopes = (spotifySession.scope ?? "").split(/\s+/);

    if (
      !grantedScopes.includes("playlist-modify-private") ||
      !grantedScopes.includes("playlist-read-private")
    ) {
      throw new HttpError(
        403,
        "SPOTIFY_PLAYLIST_PERMISSION_REQUIRED",
        "Połącz ponownie Spotify i zezwól na odczyt oraz zapis prywatnych playlist"
      );
    }

    const playlistId = parsePlaylistResumeId(req.body);
    const pending = req.session.pendingPlaylistSave;

    if (!pending || pending.progress.id !== playlistId) {
      throw new HttpError(
        409,
        "PLAYLIST_RESUME_UNAVAILABLE",
        "Brak zapisu tej playlisty do wznowienia w bieżącej sesji"
      );
    }

    try {
      const saved = await resumePlaylist(pending, spotifySession.accessToken);
      delete req.session.pendingPlaylistSave;
      await saveSession(req.session);
      res.json(saved);
    } catch (error) {
      if (error instanceof PartialPlaylistSaveError) {
        req.session.pendingPlaylistSave = {
          progress: { ...error.progress },
          trackIds: [...pending.trackIds],
        };
        await saveSession(req.session);
      }

      throw error;
    }
  });

  return router;
}

/** Router montowany w app.ts pod /api/playlist-generator. */
const playlistGeneratorRouter = createPlaylistGeneratorRouter({
  prepareDataset: playlistDatasetService.prepareDataset,
  savePlaylist: playlistSaveService.savePlaylist,
  resumePlaylist: playlistSaveService.resumePlaylist,
  authorize: ensureSpotifyAccessToken,
});

export { createPlaylistGeneratorRouter };
export default playlistGeneratorRouter;
