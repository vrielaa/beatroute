import { fetchFromLastfm } from "./lastfm.client.js";

async function createLastfmSession(
  token: string
): Promise<{ key: string; name: string }> {
  const data = await fetchFromLastfm(
    "auth.getSession",
    { token },
    { signed: true }
  );

  if (!data?.session?.key || !data?.session?.name) {
    throw new Error("Last.fm nie zwrócił poprawnej sesji użytkownika");
  }

  return data.session;
}

async function getLastfmUserInfo(username: string): Promise<{
  name: string;
  url: string;
  image: string;
}> {
  const data = await fetchFromLastfm("user.getInfo", { user: username });

  return data.user;
}

export { createLastfmSession, getLastfmUserInfo };
