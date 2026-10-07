import { fetchFromLastfm } from "./lastfm.client.js";
import { LastfmApiError } from "./lastfm-api.error.js";

type LastfmRequest = typeof fetchFromLastfm;

/** Tworzy operację wymiany jednorazowego tokenu na sesję Last.fm. */
function createLastfmSessionExchange(request: LastfmRequest) {
  return async function createLastfmSession(
    token: string
  ): Promise<{ key: string; name: string }> {
    const data = await request("auth.getSession", { token }, { signed: true });

    if (!data?.session?.key || !data?.session?.name) {
      throw new LastfmApiError(
        "Last.fm nie zwrócił poprawnej sesji użytkownika",
        null,
        { category: "invalid-response" }
      );
    }

    return data.session;
  };
}

const createLastfmSession = createLastfmSessionExchange(fetchFromLastfm);

export { createLastfmSessionExchange, createLastfmSession };
