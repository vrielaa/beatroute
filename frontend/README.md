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
form, progress card and result components. Import, preparation/progress and
generation have separate page-level test files. The progress card presents
actual API stages; it does not estimate processed tracks or advance on a timer.

The initial preparation requires a Spotify session and external APIs. The full
synthetic dataset is an internal backend example, not a supported UI import.
