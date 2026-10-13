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

The file picker accepts `version: 1` and `spotifyTrackIds`, not a full dataset.
See the [input example](../examples/playlist-track-ids.json) and
[generator workflow](../README.md#playlist-generator).

Import only reads and validates the file locally. The criteria form is immediately
available; metadata and audio features are fetched only after **Generuj playlistę**.
The page retains the prepared data while criteria change, so another click sends
only the analysis request. A replacement file resets data and criteria; cancelling
the picker does not. The cache lasts until the component is destroyed.

The feature directory separates the page and API service, ID parser, criteria
form, progress card and result components. Import, preparation/progress,
generation and selection have separate page-level test files. The progress card presents
actual API stages; it does not estimate processed tracks or advance on a timer.

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
preserves selection. Saving a Spotify playlist is still a subsequent step.

The initial preparation requires a Spotify session and external APIs. The full
synthetic dataset is an internal backend example, not a supported UI import.
