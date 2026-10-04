/** Informuje, że dostępu Spotify nie można odnowić bez udziału użytkownika. */
class SpotifyReauthorizationRequiredError extends Error {
  constructor() {
    super("Ponowne połączenie konta Spotify jest wymagane");
    this.name = "SpotifyReauthorizationRequiredError";
  }
}

export { SpotifyReauthorizationRequiredError };
