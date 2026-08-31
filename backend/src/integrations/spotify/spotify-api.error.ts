/** Błąd odpowiedzi otrzymanej ze Spotify Web API. */
class SpotifyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly data: unknown = null
  ) {
    super(message);
    this.name = "SpotifyApiError";
  }
}

export { SpotifyApiError };
