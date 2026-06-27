import { fetchFromLastfm } from "./lastfm.client.js";

export async function createLastfmSession(token) {
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

export async function getLastfmUserInfo(username) {
  const data = await fetchFromLastfm("user.getInfo", { user: username });

  return data.user;
}
