import type { LastfmTag } from "@application/lastfm/types.js";

/**
 * Normalizuje pojedynczy tag lub kolekcję tagów pochodzącą z Last.fm.
 * Nieprawidłowe elementy i tagi bez nazwy są pomijane.
 *
 * @param tags - Surowe tagi z odpowiedzi API, pojedynczy tag albo brak danych.
 * @returns Tagi z przyciętymi nazwami i opcjonalnym adresem strony.
 */
function normalizeLastfmTags(tags: unknown): LastfmTag[] {
  const normalizedTags: LastfmTag[] = [];

  for (const tag of convertToArray(tags)) {
    const normalizedTag = normalizeLastfmTag(tag);

    if (normalizedTag) {
      normalizedTags.push(normalizedTag);
    }
  }

  return normalizedTags;
}

/** Sprowadza brak wartości, pojedynczy element i tablicę do postaci tablicy. */
function convertToArray(value: unknown): unknown[] {
  if (value === null || value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

/** Sprawdza i normalizuje jeden tag Last.fm. */
function normalizeLastfmTag(tag: unknown): LastfmTag | null {
  if (typeof tag !== "object" || tag === null) {
    return null;
  }

  const name =
    "name" in tag && typeof tag.name === "string" ? tag.name.trim() : "";

  if (!name) {
    return null;
  }

  return {
    name,
    url: "url" in tag && typeof tag.url === "string" ? tag.url : null,
  };
}

export { normalizeLastfmTags };
