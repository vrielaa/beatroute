/** Błąd odpowiedzi otrzymanej ze Spotify Web API. */
export class SpotifyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly data: unknown = null
  ) {
    super(message);
    this.name = "SpotifyApiError";
  }
}
