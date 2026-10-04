import { CORE_GENRE_RULES } from "./genre-rules.js";
import type { GenreRuleContext } from "./genre-rules.js";
import type { LastfmTag } from "./types.js";

/**
 * Normalizuje pojedynczy tag lub kolekcję tagów pochodzącą z Last.fm.
 * Nieprawidłowe elementy i tagi bez nazwy są pomijane.
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
  if (!isObject(tag)) {
    return null;
  }

  const name = typeof tag.name === "string" ? tag.name.trim() : "";

  if (!name) {
    return null;
  }

  return {
    name,
    url: typeof tag.url === "string" ? tag.url : null,
  };
}

/** Sprawdza, czy wartość jest obiektem możliwym do bezpiecznego odczytu. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Sprowadza nazwę gatunku do formatu używanego podczas porównywania reguł. */
function normalizeGenreName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " n ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Wybiera kanoniczny gatunek pasujący najwcześniej w podanej nazwie.
 * Tagi opisujące wyłącznie rok lub dekadę są odrzucane.
 */
function getCanonicalGenreName(name: string): string | null {
  const normalizedName = normalizeGenreName(name);

  if (isEmptyOrTimePeriod(normalizedName)) {
    return null;
  }

  const context = createGenreRuleContext(normalizedName);
  const matches = CORE_GENRE_RULES.map((rule, ruleOrder) => ({
    name: rule.name,
    ruleOrder,
    index: rule.index(context),
  }))
    .filter((match) => match.index >= 0)
    .sort(
      (firstMatch, secondMatch) =>
        firstMatch.index - secondMatch.index ||
        firstMatch.ruleOrder - secondMatch.ruleOrder
    );

  return matches[0]?.name ?? null;
}

/** Buduje warianty nazwy odczytywane przez reguły gatunków. */
function createGenreRuleContext(normalizedName: string): GenreRuleContext {
  const tokens = normalizedName.split(" ");

  return {
    normalizedName,
    compactName: tokens.join(""),
    tokens,
  };
}

/** Rozpoznaje pustą nazwę oraz tag opisujący wyłącznie rok lub dekadę. */
function isEmptyOrTimePeriod(normalizedName: string): boolean {
  return (
    !normalizedName ||
    /^(19|20)\d{2}$/.test(normalizedName) ||
    /^(19|20)\d0s$/.test(normalizedName) ||
    /^\d{2}'?s$/.test(normalizedName)
  );
}

/** Sprawdza, czy znormalizowany tag ma kanoniczny gatunek aplikacji. */
function isLikelyGenreTag(tag: LastfmTag): boolean {
  return getCanonicalGenreName(tag.name) !== null;
}

export {
  normalizeLastfmTags,
  normalizeGenreName,
  getCanonicalGenreName,
  isLikelyGenreTag,
};
