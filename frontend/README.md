# BeatRoute frontend

The frontend is an Angular 22 application. Project-wide setup, environment variables, local HTTPS certificates and quality checks are documented in the repository-level [`README.md`](../README.md).

## Commands

Run these commands from the `frontend` directory:

```bash
npm start
npm test -- --watch=false
npm run build
npm run format:check
```

The development server runs at `https://127.0.0.1:4200` and forwards `/auth` and `/api` requests to the backend according to `proxy.conf.json`.

## Playlist generator

The source switch offers **Plik** or **Zapisane utwory**. It makes no HTTP requests;
data preparation starts only after **Generuj playlistę**. Both sources share the
criteria form, ranking, selection and save flow.

The file picker accepts `version: 1` and `spotifyTrackIds`, not a full dataset.
See the [input example](../examples/playlist-track-ids.json) and
[generator workflow](../README.md#playlist-generator).

Import only reads and validates the file locally. The criteria form is immediately
available; metadata and audio features are fetched only after **Generuj playlistę**.
The page retains the prepared data while criteria change, so another click sends
only the analysis request. A replacement file resets data and criteria; cancelling
the picker does not. The cache lasts until the component is destroyed.

The feature directory separates the page and API service, criteria form,
progress card and result components. `data-preparation/` contains the ID parser,
file-batch helpers and saved-track preparation, together with their tests.
Import, preparation/progress,
generation and selection have separate page-level test files. The progress card presents
actual API stages; it does not estimate processed tracks or advance on a timer.

Saved-track preparation is connected to the page through
`data-preparation/playlist-saved-tracks-preparation.ts`. This module contains sequential requests,
page merging, deduplication and progress calculation. It uses the API service to
request one library page at a time and follows `nextOffset`. It reports progress
after each response and emits one deduplicated dataset only after every page succeeds.
An error or cancellation stops further requests; another subscription starts
from offset zero rather than reusing an interrupted library snapshot. The page
retains a complete nonempty dataset for repeated analyses. Before the first
response, progress has no total; afterwards it counts source positions up to 500,
including unavailable entries and duplicates. An empty library, missing useful
measurements and failures are displayed separately. Empty prepared libraries can
be fetched again with Generate. Switching sources clears prepared data and
criteria while retaining the imported file; source switching is locked during
reading, generation and saving. A pending partial save remains resumable.

Results include a Signal Forms count field and Top N/manual mode buttons. Top N
selects the first N accepted tracks without changing or requesting the ranking.
The counter excludes rejected tracks. A new result restores Top N with all accepted
tracks selected. Manual mode currently preserves that selection and disables N;
the accepted-track checkboxes become editable. In Top N they only show the
automatic choice and are disabled. Manual choices retain ranking order, including
after re-selecting a track. Rejected tracks have no selection control.
The results component emits a copy of the selected IDs via selectedTrackIdsChange.
The page stores them in selectedTrackIds, restricted to the current accepted ranking
and its order. Clearing a result also clears selection, including while another
analysis is pending or after a criteria/file change. Cancelling the file picker
preserves selection. Submitting the save form writes the current selection to
Spotify; interrupted saves can be resumed against the same playlist.

Page tests cover the library-to-save flow with real components and Signal Forms,
but mocked HTTP responses. They do not send requests to Spotify or ReccoBeats.

The initial preparation requires a Spotify session and external APIs. The full
synthetic dataset is an internal backend example, not a supported UI import.
