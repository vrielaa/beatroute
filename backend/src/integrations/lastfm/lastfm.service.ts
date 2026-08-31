import { fetchFromLastfm } from "./lastfm.client.js";
import { LastfmApiError } from "./lastfm-api.error.js";

type LastfmRequest = typeof fetchFromLastfm;

/** Tworzy operacje sesji i profilu użytkownika Last.fm. */
function createLastfmService(request: LastfmRequest) {
  async function createLastfmSession(
    token: string
  ): Promise<{ key: string; name: string }> {
    const data = await request("auth.getSession", { token }, { signed: true });

    if (!data?.session?.key || !data?.session?.name) {
      throw new LastfmApiError(
        "Last.fm nie zwrócił poprawnej sesji użytkownika"
      );
    }

    return data.session;
  }

  async function getLastfmUserInfo(username: string): Promise<{
    name: string;
    url: string;
    image: string;
  }> {
    const data = await request("user.getInfo", { user: username });

    if (!data?.user) {
      throw new LastfmApiError("Last.fm nie zwrócił profilu użytkownika");
    }

    return data.user;
  }

  return { createLastfmSession, getLastfmUserInfo };
}

const lastfmService = createLastfmService(fetchFromLastfm);
const { createLastfmSession, getLastfmUserInfo } = lastfmService;

export { createLastfmService, createLastfmSession, getLastfmUserInfo };
