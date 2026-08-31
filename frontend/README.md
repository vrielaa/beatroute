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
