import { fetchFromLastfm } from "./lastfm.client.js";
import { LastfmApiError } from "./lastfm-api.error.js";

type LastfmRequest = typeof fetchFromLastfm;

/** Tworzy operację pobierania profilu użytkownika Last.fm. */
function createLastfmUserReader(request: LastfmRequest) {
  return async function getLastfmUserInfo(username: string): Promise<{
    name: string;
    url: string;
    image: string;
  }> {
    const data = await request("user.getInfo", { user: username });

    if (!data?.user) {
      throw new LastfmApiError(
        "Last.fm nie zwrócił profilu użytkownika",
        null,
        "invalid-response"
      );
    }

    return data.user;
  };
}

const getLastfmUserInfo = createLastfmUserReader(fetchFromLastfm);

export { createLastfmUserReader, getLastfmUserInfo };
