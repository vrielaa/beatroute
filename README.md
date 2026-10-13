# BeatRoute

BeatRoute is an engineering-thesis web application for analysing a user's music
preferences and generating playlists from a supplied collection of tracks. It
combines Spotify listening data with Last.fm genres and audio features from
ReccoBeats or Soundcharts, then presents statistics and a PCA-based music map
with clustering.

The current version includes Spotify login, a user profile, top tracks and
artists, audio-feature statistics, Last.fm genres, a music map and a working
playlist generator based on an imported file of Spotify track IDs.

Track-category percentages are calculated only from available measurements
of the relevant feature. No measurements produce `null` (shown as "Brak danych"),
while measured tracks with no category matches produce 0%. The music profile
shows how many requested tracks have a measurement for each percentage.

The dashboard and music profile distinguish an empty Spotify track list, missing
audio measurements, and a failed request. Failures display a retry button using
the current filters. If audio analysis fails, the dashboard keeps the track list
already retrieved from Spotify; changing filters cancels the previous request.

## Playlist generator

### Input file

Import a UTF-8 JSON file containing only a version and Spotify track IDs:

```json
{
  "version": 1,
  "spotifyTrackIds": ["3sNVsP50132BTNlImLx70i", "4U4LEUWV8sFtos5PdjfDA7"]
}
```

Use [playlist-track-ids.json](examples/playlist-track-ids.json) as the input example.
The file must contain 1–500 entries before deduplication. IDs are 22 alphanumeric
characters, case-sensitive and trimmed; URLs and `spotify:track:` URIs are not
accepted. Duplicates are removed while preserving first-occurrence order.
Additional properties are ignored. Frontend and backend independently validate
this format. Names, artists and audio measurements are not required in the file.

The previous `tracks`/`audioFeatures` format is no longer accepted by the file
picker. The [synthetic full dataset](examples/playlist-dataset.json) remains an
internal example for testing the generator endpoint without provider calls.

### What happens after import

1. Selecting a file reads and validates it locally, then displays the criteria
   form. Import and criteria edits do not request track metadata or audio features.
2. Clicking **Generuj playlistę** starts `POST /api/playlist-generator/prepare-dataset`.
   It requires a Spotify session and uses its access token, not a token from the
   file. The backend retrieves Spotify names/artists and ReccoBeats measurements.
   Last.fm and Soundcharts are not used in this preparation process.
3. The frontend keeps the prepared dataset in component memory and sends it,
   requirements and preferences to `POST /api/playlist-generator/generate`.
   This endpoint validates the complete dataset, filters it and ranks accepted
   tracks without a Spotify session or any external API calls.
4. Results show accepted tracks, preference scores, available measurements and
   all rejection reasons. A ranking can legitimately be empty.
5. Top N selects the first N accepted tracks locally, with a validated count and
   a selection counter. The full ranking and scores remain visible and unchanged.
   A new result resets the selection to all accepted tracks. Switching to manual
   mode preserves the current selection and disables N. Accepted tracks have
   checkboxes that are editable only in manual mode; switching back restores Top N.
   Manual choices are ordered by ranking, not by clicks. The results component
   emits selected IDs to the page for the save flow.
   Removing the result, including when starting a new analysis, clears that list.
6. Enter a playlist name and click **Zapisz w Spotify** to save only the selection.
   The Signal Forms name field requires 1–100 characters after trimming. A pending
   save locks file import, criteria, selection and repeated submission; it does not
   retrieve measurements or recalculate scores. Success shows the playlist link
   and confirmed track count. Another save requires an explicit new action.

The progress card appears only after clicking Generate. Its three stages are
data retrieval, analysis/ranking, and a ready result. The counter describes
stages, not processed tracks or estimated remaining time; it advances on API
responses rather than a timer. Cached data starts directly at the analysis stage.
Preparation reads Spotify metadata sequentially and looks up audio data in batches
of up to 40 IDs, with individual audio requests controlled by the shared scheduler.
A large collection can therefore involve many provider requests while the first
stage remains active; the UI does not invent per-track progress or an ETA.

Editing criteria clears the previous result but retains successfully prepared
data. The next Generate click only repeats analysis. Replacing the file clears
the data, criteria and result; cancelling the file picker preserves them.
Navigating away destroys the component and its in-memory dataset. Replacing a
file, changing criteria or leaving the page cancels the pending browser request,
but does not guarantee that already-started backend/provider work is stopped.

### Criteria and missing data

- Requirements are an optional inclusive positive BPM range and optional maximum
  speechiness/liveness values. Every active requirement must be satisfied.
- Preferences are energy, danceability, valence, acousticness and instrumentalness,
  each with low/medium/high or no preference. They affect order, not acceptance.
- Fuzzy matches use equal weights and average only available measurements. A score
  is not a probability of liking a song. Zero-match tracks remain eligible when
  they meet the requirements. Ties use measurement closeness, then source order.
- `null` means a missing measurement, not zero. A missing measurement required by
  an active filter rejects the track; a missing preference measurement is left
  unscored. With no active preferences, source order is preserved.

The prepared response contains `dataset`, `skippedTracks` and `incompleteTracks`.
Tracks without metadata or any useful generator measurement are omitted. Partial
measurements remain in the dataset and are reported separately. This is distinct
from rejection by user criteria. An empty prepared dataset blocks generation.
Retrieval failures display an error rather than an empty success. If every audio
read fails due to an outage, the original integration error, including `Retry-After`
when supplied, is propagated. Partial per-track failures still allow other tracks
to be prepared. Expected missing measurements (404) are reported as missing data.
Generate can retry after an error without selecting the file again; a failed
analysis does not discard data already prepared successfully.

Both endpoints have a 1 MiB JSON body limit; other endpoints retain 100 KiB.
Vitest covers validation and domain logic. Supertest covers authentication, errors,
parser limits and the preparation-to-generation flow with actual services and
mocked provider boundaries. Angular tests cover import, forms, progress, retries,
cancellation, cache reuse and presentation. Preparation, generation and saving
are described in OpenAPI.

### Playlist saving

`POST /api/playlist-generator/save` accepts `{ "name": "Playlist name", "trackIds": ["Spotify ID"] }`.
It requires a Spotify session with `playlist-modify-private`; the token comes only
from the session. The backend validates 1–500 unique IDs, creates a private
playlist and adds them in order, in sequential batches of up to 100.
It returns `201` with `id`, `name`, `spotifyUrl` and `trackCount` after all batches
are confirmed. It does not fetch metadata or rerun ranking.

Writes are not automatically retried. If adding tracks fails after creation,
`PLAYLIST_SAVE_INCOMPLETE` includes the existing playlist and confirmed progress
in `error.details.progress`. An unconfirmed batch may already have been written:
check the playlist before another save, even when `Retry-After` is provided.
The UI displays validated progress and a Spotify link for partial failures. It
does not offer automatic resumption; an acknowledged new save creates another
playlist. It validates complete confirmations and rejects unsafe or inconsistent
links and counts before showing success. Connection failures and timeouts warn
that the playlist may already exist. Leaving the view stops local waiting but
does not undo a backend write, so wait for its response before navigating away.

### Scope still planned

Only the Spotify-ID file source is currently available. Saved Spotify tracks and
user-owned/collaborated playlists are planned sources, not implemented options.
The output is a new private Spotify playlist, not a JSON export. Top N and manual
selection, the Signal Forms save form and complete/partial-save presentation are
implemented. Saving requires a user session with `playlist-modify-private`;
older sessions may need reconnecting through Spotify login to grant that scope.
Importing IDs is not an offline mode: the first preparation requires Spotify,
ReccoBeats and a working backend. The pure generator can be tested separately
with the synthetic dataset.

Detailed criteria and implementation decisions are documented in
[Playlist generator requirements](PLAYLIST-GENERATOR-REQUIREMENTS.md).

## Technology

- Angular 22 and TypeScript frontend
- Express 5 and TypeScript backend
- Spotify Web API and Spotify Accounts OAuth
- Last.fm API
- ReccoBeats audio features for batch analysis and Soundcharts audio features
  for individual track lookups
- Vitest, Supertest, ESLint and Prettier

Use Node.js 24, which is also used by GitHub Actions.

## Architecture

The backend is divided into domain, application, integration and HTTP layers.
Domain modules contain PCA, clustering, audio statistics and genre
classification without depending on Express or a provider API. Application
modules combine operations such as building a Spotify/Last.fm track profile.
Integration modules contain provider clients, adapters and mappers. Last.fm
artist and track adapters combine fetching and mapping in one service each.
Express routers validate requests and receive their services and middleware through
explicit dependencies, which keeps the core logic independently testable.
Production dependencies for Last.fm, track analysis, playlist preparation and saving are assembled in
`composition.ts` beside their routers.

For playlists, `application/playlist-generator` prepares provider data and coordinates saving;
`domain/playlist-generator` contains deterministic filtering and ranking.
Routers handle authorization and input validation. The Angular page controls
the process and cache; the progress and results components only present state.

## Local setup

Install dependencies in all three packages:

```bash
npm install
npm --prefix backend install
npm --prefix frontend install
```

Copy `backend/.env.example` to `backend/.env` and provide the required credentials. Secrets and local certificates must never be committed.

### OAuth callback URLs

Configure the following callback URLs in the provider dashboards:

```text
Spotify: http://127.0.0.1:3000/auth/spotify/callback
Last.fm: http://127.0.0.1:3000/auth/lastfm/callback
```

The Spotify callback must match the dashboard value exactly, including the protocol, host and port.

### Local HTTPS certificate

The Angular development server uses HTTPS. Generate a trusted local certificate with `mkcert`:

```bash
brew install mkcert
mkcert -install
mkdir -p frontend/certs
mkcert -cert-file frontend/certs/127.0.0.1.pem -key-file frontend/certs/127.0.0.1-key.pem 127.0.0.1 localhost
chmod 600 frontend/certs/127.0.0.1-key.pem
```

The entire `frontend/certs/` directory is ignored by Git.

## Running the application

Start the frontend and backend together:

```bash
npm run dev
```

The application is available at `https://127.0.0.1:4200`, the backend at
`http://127.0.0.1:3000`, and OpenAPI documentation at
`http://127.0.0.1:3000/api-docs`.

The Angular proxy forwards `/api` and `/auth` requests to the backend. The
backend exposes Spotify OAuth, session, profile/top-items, track audio-feature,
Last.fm genre/track, music-map and playlist-generator endpoints. Protected endpoints require the
corresponding Spotify or Last.fm session.

## Quality checks

```bash
npm run lint
npm run format:check
npm --prefix backend run typecheck
npm --prefix backend test
npm --prefix frontend test -- --watch=false
npm --prefix frontend run build
```

Husky and lint-staged run ESLint and Prettier for staged files before every commit. GitHub Actions repeat linting, backend type checking and tests, frontend tests, production build and dependency audits.

## API errors

Backend errors use one response format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Description of the error",
    "details": {}
  }
}
```

`details` is present only when additional safe information is available.
Failures of Spotify, Last.fm, ReccoBeats and Soundcharts are represented by
dedicated integration error classes and mapped centrally by the Express error
handler (normally as `502`).

## Current deployment limitation

The application currently supports local development only. Production mode
requires an external `express-session` store, proxy configuration and
production cookie settings. Availability and rate limits of external APIs may
also reduce the number or completeness of analysed tracks.
