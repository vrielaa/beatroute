# BeatRoute

BeatRoute is an engineering-thesis web application for analysing a user's music
preferences and generating playlists from a supplied collection of tracks. It
combines Spotify listening data with Last.fm genres and audio features from
ReccoBeats or Soundcharts, then presents statistics and a PCA-based music map
with clustering.

The current version includes Spotify login, a user profile, top tracks and
artists, audio-feature statistics, Last.fm genres, a music map and a working
playlist generator based on an imported file of Spotify track IDs or the user's
saved Spotify tracks. Importing an owned/collaborative playlist is not implemented yet.

Track-category percentages are calculated only from available measurements
of the relevant feature. No measurements produce `null` (shown as "Brak danych"),
while measured tracks with no category matches produce 0%. The music profile
shows how many requested tracks have a measurement for each percentage.

The dashboard and music profile distinguish an empty Spotify track list, missing
audio measurements, and a failed request. Failures display a retry button using
the current filters. If audio analysis fails, the dashboard keeps the track list
already retrieved from Spotify; changing filters cancels the previous request.

`GET /api/me/top-tracks` accepts `limit` (1–40, default 10), `time_range`
and `offset` (a nonnegative safe integer, default 0). Each request returns just
one Spotify page and preserves its order and pagination. Use the same period
for subsequent pages; advance the offset by the number of source positions read,
not just tracks with measurements. `next: null` marks the end. An empty page
before the declared end or inconsistent page counters produce a 502 integration
error, not an empty result. Requests without an offset still read the first page.
Automatic replacement of tracks with missing measurements is not implemented yet.

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

### Saved Spotify tracks

Select **Zapisane utwory**, choose criteria and click **Generuj playlistę**.
Selecting the source or editing criteria does not read provider data. The frontend
then prepares library pages sequentially, displays real progress and runs one
ranking request after all pages succeed. The first request shows a waiting state
without an invented total or percentage. An empty library, missing measurements
and a failed request have separate messages; an empty preparation does not run ranking.

`POST /api/playlist-generator/prepare-saved-tracks` accepts `{ "offset": 0 }`.
It requires a Spotify session with `user-library-read`; reconnect Spotify if the
existing session lacks this permission. Tokens and user IDs are not accepted from
the body. Each request prepares up to 50 library positions within the first 500,
using metadata from the library response and audio measurements from ReccoBeats,
without additional Spotify metadata requests for individual tracks.

The response contains `preparedDataset`, `pagination` and `unavailableItemsCount`.
`pagination.processedItems` counts source positions in the current page, including
unavailable entries and duplicates, not just prepared tracks. Use `nextOffset`
for the next request; `null` ends preparation at the library end or 500-position
cap. An empty library returns an empty dataset, not an error. This endpoint does
not rank tracks or save a playlist. The frontend merges pages, deduplicates IDs
and keeps the first prepared occurrence and its missing-measurement information.
An ID successfully prepared on any page is removed from the final omissions list.

A complete nonempty dataset is kept in component memory for new criteria, without
reading Spotify or ReccoBeats again. A failed or cancelled library preparation
restarts at offset zero on the next Generate click, because saved-track pagination
is not a stable snapshot. An empty prepared library can also be fetched again.
Switching sources clears prepared data, progress, results and criteria, but keeps
the imported ID file for returning to file mode. Switching is locked during file
reading, generation and saving. Pending partial saves survive a source change and
can still be resumed using the original selection in the backend session.

Both sources use the same ranking, Top N/manual selection and Spotify save flow
described below. There is no separate library ranking algorithm or save endpoint.

### What happens after import

1. Selecting a file reads and validates it locally, then displays the criteria
   form. Import and criteria edits do not request track metadata or audio features.
2. Clicking **Generuj playlistę** starts sequential preparation requests to
   `POST /api/playlist-generator/prepare-dataset`, each with up to 20 IDs.
   They require a Spotify session and use its access token, not a token from the
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

Frontend tests cover saved-track preparation, ranking-response handling, Top N
and manual selection, saving and resuming a partial save after changing sources.
They use real components and Signal Forms with mocked HTTP responses, not live
Spotify writes; backend/domain behaviour is verified separately by backend tests.

The progress card appears only after clicking Generate. Its three stages are
data retrieval, analysis/ranking, and a ready result. The browser prepares the file
in sequential batches of up to 20 IDs through the existing preparation endpoint.
After each successful response, it retains the batch and updates the processed-ID,
prepared-track and skipped-track counters. Skipped IDs count as processed; the
progress bar describes data preparation, not completion of the whole generator.
The UI also identifies the currently requested batch, without inventing progress
inside a pending request or an ETA. After all batches, it merges the data and runs
one analysis/ranking request for the complete collection. Cached data starts
directly at the analysis stage. Batching does not reduce Spotify's per-track
metadata requests; the backend cache and shared scheduler still control them.

Editing criteria clears the previous result but retains successfully prepared
data, including completed batches from an interrupted preparation. After a failed
or cancelled preparation, another Generate click resumes at the first unfinished
batch; there is no automatic retry. Once the entire dataset is cached, the next
Generate click only repeats analysis. Cancel stops the pending browser request and
prevents later batches from being sent. Replacing the file clears all completed
batches, data, criteria and result; cancelling the file picker preserves them.
Navigating away destroys the component and its in-memory dataset. Replacing a
file, changing criteria or leaving the page cancels the pending browser request,
but does not guarantee that already-started backend/provider work is stopped.

### Criteria and missing data

- BPM is optional and offers two mutually exclusive modes: an inclusive positive
  range or one positive integer target. The range uses the original measurement.
  The target compares `Math.round(tempo)`: fractions below 0.5 round down, fractions
  from 0.5 round up. For example, 127.947 matches 128 BPM, but 128.5 does not.
  Neither mode changes the stored measurement. The form retains both drafts while
  sending only the active constraint; disabling BPM sends null for both fields.
  The backend rejects requests enabling both constraints. All four requirement
  fields (`tempoRange`, `targetBpm`, `maxSpeechiness`, `maxLiveness`) must be present.
- Maximum speechiness/liveness values remain optional. Every active requirement
  must be satisfied.
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

Spotify Web API reads, playlist writes and retry attempts share one in-memory
scheduler. It starts at most one provider request per 1000 ms across all users,
with at most five requests still running concurrently. Waiting for a rate or
concurrency slot does not consume the individual request timeout. This is a
conservative application setting, not a published Spotify quota or a guarantee
against `429`; large ID files can therefore take several minutes to prepare.

Spotify Web API requests also share an in-memory cooldown. A `429` stops new provider
calls for the duration of `Retry-After`; the read itself is not automatically
retried. Queued and new operations fail promptly with the remaining delay, while
already-running operations may finish. A pause caused by `503` remains an
availability error, not a rate-limit error. Local refusals report
`upstreamStatus: null` because no new Spotify response was received. The browser
respects `Retry-After` for GET retries and displays the error immediately when
the delay exceeds 30 seconds. POST requests are never automatically retried.
The local cooldown is lost on backend restart, which does not remove any limit
still enforced by Spotify. These limits apply to one backend process, not to
multiple server instances or the separate Spotify OAuth client.

Dataset preparation caches successfully normalized track names and artist names
within the backend service instance. Entries are scoped by the server-side session
ID and requested track ID, never by an access token or a context supplied in the
file. The session is still authorized before any cache lookup. Token renewal in
the same session preserves reuse; session regeneration starts a different scope.
Metadata remains valid for 24 hours from retrieval, with at most 1000 entries
across all sessions. Expired entries are removed on subsequent preparations;
capacity overflow removes the oldest entry. Each successful read is cached
immediately, so a later Spotify or audio-provider failure does not discard it.
Errors, missing tracks and unusable metadata are not cached. Returned data uses
copies so caller changes cannot corrupt the cache. Audio measurements are still
retrieved for each preparation. Restarting the backend clears the cache; there
is no persistent storage or sharing across processes.

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
The backend retains the original selected IDs and progress in the server session.
`POST /api/playlist-generator/resume-save` accepts only `{ "playlistId": "Spotify playlist ID" }`
and requires both `playlist-read-private` and `playlist-modify-private`. It reads
the current contents, verifies their order against the original selection and
appends only the missing suffix. A complete playlist returns success without a
write. Changed contents return `409`; read failures preserve the pending save,
and further write failures update its confirmed progress. It never creates a
replacement playlist or automatically retries a POST. Snapshot checks protect
the paginated read and an in-process lock prevents concurrent resumptions.
Spotify does not offer a conditional append here: manual changes or delayed
writes after verification remain an external race. Do not edit the playlist
during saving. Pending data lives in the session, not a durable job system;
server restart or session expiry can make resumption unavailable.
The UI displays validated progress and a Spotify link for partial failures. Its
**Resume save** button resumes the same playlist only after the user's click.
Changing criteria, selection or input file does not replace the pending save.
On a contents conflict or missing session state, it stops resumption and offers
an explicit new save instead. No POST is automatically retried. The local progress
is retained in the current view, not persisted across page reloads.
It validates complete confirmations and rejects unsafe or inconsistent
links and counts before showing success. Connection failures and timeouts warn
that the playlist may already exist. Leaving the view stops local waiting but
does not undo a backend write, so wait for its response before navigating away.

### Scope still planned

Only the Spotify-ID file source is currently available. Saved Spotify tracks and
user-owned/collaborated playlists are planned sources, not implemented options.
The output is a new private Spotify playlist, not a JSON export. Top N and manual
selection, the Signal Forms save form and complete/partial-save presentation are
implemented. Saving requires a user session with `playlist-modify-private`;
older sessions may need reconnecting through Spotify login to grant both playlist scopes.
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
Genre recognition rules live in `domain/music-genres`; Last.fm tag normalization
stays in the integration. Application services use the domain rules directly
and receive data-fetching operations as dependencies.
Express routers validate requests and receive their services and middleware through
explicit dependencies, which keeps the core logic independently testable.
Production dependencies for Last.fm, track analysis, playlist preparation and saving are assembled in
`composition.ts` beside their routers.

Dashboard and music profile use `POST /api/tracks/analysis` to retrieve audio
features and statistics calculated from the same provider results. The former
batch `/audio-features` and `/audio-stats` endpoints have been removed; the
single-track Soundcharts endpoint remains available. Music-map data retrieval
uses an application service, while its analysis router calls the domain function
directly after validating the dataset.

For playlists, `application/playlist-generator` prepares provider data and coordinates saving;
`domain/playlist-generator` contains deterministic filtering and ranking.
Routers handle authorization and input validation. The Angular page controls
data preparation, generation and cache. A component-scoped `PlaylistSaveStore`
owns save/resume requests, their state and partial progress; it is not shared
between generator instances. The progress and results components present state.

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
