import { CORE_GENRE_RULES } from "./genre-rules.js";
import type { GenreRuleContext } from "./genre-rules.js";

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

/** Sprawdza, czy tekst zawiera gatunek rozpoznawany przez reguły aplikacji. */
function isLikelyGenreName(name: string): boolean {
  return getCanonicalGenreName(name) !== null;
}

export { normalizeGenreName, getCanonicalGenreName, isLikelyGenreName };
