# BeatRoute

BeatRoute is an engineering-thesis web application for analysing a user's music preferences. It combines Spotify listening data with Last.fm genres and audio features from ReccoBeats or Soundcharts, then presents statistics and a PCA-based music map with clustering.

The current version focuses on analysis rather than playlist generation. After
Spotify login, the user can inspect their profile, top tracks and artists,
audio-feature statistics, Last.fm artist genres, and a PCA/clustering-based
music map. The playlist-generator screen exists in the frontend as a prepared
view, but the end-to-end playlist workflow is not implemented yet.

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
Integration modules contain provider clients, gateways and mappers. Express
routers validate requests and receive their services and middleware through
explicit dependencies, which keeps the core logic independently testable.

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
Last.fm genre/track and music-map endpoints. Protected endpoints require the
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
