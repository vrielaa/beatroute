import type { LastfmTag } from "./types.js";

/**
 * Normalizuje pojedynczy tag lub kolekcję tagów pochodzącą z Last.fm.
 * Nieprawidłowe elementy i tagi bez nazwy są pomijane.
 *
 * @param tags - Niezweryfikowana wartość z odpowiedzi Last.fm.
 * @returns Tagi z niepustą nazwą i adresem URL albo `null`.
 */
export function normalizeLastfmTags(tags: unknown): LastfmTag[] {
  const tagsToNormalize = convertToArray(tags);
  const normalizedTags: LastfmTag[] = [];

  for (const tag of tagsToNormalize) {
    const normalizedTag = normalizeLastfmTag(tag);

    if (normalizedTag) {
      normalizedTags.push(normalizedTag);
    }
  }

  return normalizedTags;
}

/**
 * Sprowadza brak wartości, pojedynczy element i tablicę do postaci tablicy.
 *
 * @param tags - Wartość przeznaczona do normalizacji.
 * @returns Pusta tablica, oryginalna tablica albo tablica z jednym elementem.
 */
function convertToArray(tags: unknown): unknown[] {
  if (tags === null || tags === undefined) {
    return [];
  }

  return Array.isArray(tags) ? tags : [tags];
}

/**
 * Sprawdza i normalizuje jeden tag Last.fm.
 *
 * @param tag - Niezweryfikowany kandydat na tag.
 * @returns Znormalizowany tag albo `null`, jeśli nie ma poprawnej nazwy.
 */
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

/**
 * Sprawdza, czy nieznana wartość jest niepustym obiektem.
 *
 * @param value - Sprawdzana wartość.
 * @returns `true`, gdy można bezpiecznie odczytywać właściwości obiektu.
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Sprowadza nazwę gatunku do formatu używanego podczas porównywania reguł.
 *
 * @param name - Oryginalna nazwa gatunku lub tagu.
 * @returns Nazwa małymi literami, bez znaków specjalnych i nadmiarowych spacji.
 */
export function normalizeGenreName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " n ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Sprawdza, czy token reprezentuje gatunek pop lub jego odmianę. */
function isPopToken(token: string): boolean {
  return token === "pop" || token.endsWith("pop");
}

/** Sprawdza, czy token reprezentuje rap lub jego odmianę. */
function isRapToken(token: string): boolean {
  return token === "rap" || /^rap[a-z0-9]+$/.test(token);
}

/**
 * Wyznacza pozycję pierwszego tokenu spełniającego podany warunek.
 * Pozycja odpowiada nazwie sklejonej bez spacji.
 *
 * @param tokens - Kolejne słowa znormalizowanej nazwy.
 * @param predicate - Warunek rozpoznający poszukiwany token.
 * @returns Pozycja tokenu w sklejonej nazwie albo `-1` przy braku dopasowania.
 */
function findTokenStartIndex(
  tokens: string[],
  predicate: (token: string) => boolean
): number {
  let startIndex = 0;

  for (const token of tokens) {
    if (predicate(token)) {
      return startIndex;
    }

    startIndex += token.length;
  }

  return -1;
}

/**
 * Reguły mapujące tagi Last.fm na kanoniczne gatunki aplikacji.
 * Kolejność rozstrzyga remis, gdy kilka reguł pasuje w tym samym miejscu.
 */
const CORE_GENRE_RULES = [
  {
    name: "dancehall",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("dancehall"),
  },
  {
    name: "drum and bass",
    index: ({ compactName }: { compactName: string }) => {
      const drumAndBassIndex = compactName.indexOf("drumandbass");
      return drumAndBassIndex >= 0
        ? drumAndBassIndex
        : compactName.indexOf("dnb");
    },
  },
  {
    name: "dubstep",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("dubstep"),
  },
  {
    name: "reggaeton",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("reggaeton"),
  },
  {
    name: "hip hop",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("hiphop"),
  },
  {
    name: "r&b",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("rnb"),
  },
  {
    name: "electronic",
    index: ({ compactName }: { compactName: string }) => {
      const electronicIndexes = ["electronic", "electronica", "electro"]
        .map((keyword) => compactName.indexOf(keyword))
        .filter((index) => index >= 0);

      return electronicIndexes.length ? Math.min(...electronicIndexes) : -1;
    },
  },
  {
    name: "pop",
    index: ({ tokens }: { tokens: string[] }) =>
      findTokenStartIndex(tokens, isPopToken),
  },
  {
    name: "rap",
    index: ({ tokens }: { tokens: string[] }) =>
      findTokenStartIndex(tokens, isRapToken),
  },
  {
    name: "rock",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("rock"),
  },
  {
    name: "alternative",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("alternative"),
  },
  {
    name: "ambient",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("ambient"),
  },
  {
    name: "afrobeat",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("afrobeat"),
  },
  {
    name: "blues",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("blues"),
  },
  {
    name: "classical",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("classical"),
  },
  {
    name: "country",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("country"),
  },
  {
    name: "dance",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("dance"),
  },
  {
    name: "disco",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("disco"),
  },
  {
    name: "dub",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("dub"),
  },
  {
    name: "emo",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("emo"),
  },
  {
    name: "experimental",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("experimental"),
  },
  {
    name: "folk",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("folk"),
  },
  {
    name: "funk",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("funk"),
  },
  {
    name: "garage",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("garage"),
  },
  {
    name: "goth",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("goth"),
  },
  {
    name: "grunge",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("grunge"),
  },
  {
    name: "hardcore",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("hardcore"),
  },
  {
    name: "house",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("house"),
  },
  {
    name: "indie",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("indie"),
  },
  {
    name: "industrial",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("industrial"),
  },
  {
    name: "jazz",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("jazz"),
  },
  {
    name: "latin",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("latin"),
  },
  {
    name: "metal",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("metal"),
  },
  {
    name: "punk",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("punk"),
  },
  {
    name: "reggae",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("reggae"),
  },
  {
    name: "ska",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("ska"),
  },
  {
    name: "shoegaze",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("shoegaze"),
  },
  {
    name: "soul",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("soul"),
  },
  {
    name: "techno",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("techno"),
  },
  {
    name: "trance",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("trance"),
  },
  {
    name: "trap",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("trap"),
  },
  {
    name: "wave",
    index: ({ compactName }: { compactName: string }) =>
      compactName.indexOf("wave"),
  },
];

/**
 * Wybiera kanoniczny gatunek pasujący najwcześniej w podanej nazwie.
 * Tagi opisujące wyłącznie rok lub dekadę są odrzucane.
 *
 * @param name - Nazwa tagu Last.fm.
 * @returns Kanoniczna nazwa gatunku albo `null`, jeśli żadna reguła nie pasuje.
 */
export function getCanonicalGenreName(name: string): string | null {
  const normalizedName = normalizeGenreName(name);

  if (
    !normalizedName ||
    /^(19|20)\d{2}$/.test(normalizedName) ||
    /^(19|20)\d0s$/.test(normalizedName) ||
    /^\d{2}'?s$/.test(normalizedName)
  ) {
    return null;
  }

  const tokens = normalizedName.split(" ");
  const compactName = tokens.join("");

  const matches = CORE_GENRE_RULES.map((rule, ruleOrder) => {
    const matchGenreRuleObject: {
      normalizedName: string;
      compactName: string;
      tokens: string[];
    } = {
      normalizedName,
      compactName,
      tokens,
    };

    return {
      name: rule.name,
      ruleOrder,
      index: rule.index(matchGenreRuleObject),
    };
  });

  const filteredMatches = matches.filter((match) => match.index >= 0);
  const sortedMatches = filteredMatches.sort(
    (firstMatch, secondMatch) =>
      firstMatch.index - secondMatch.index ||
      firstMatch.ruleOrder - secondMatch.ruleOrder
  );

  return sortedMatches[0]?.name ?? null;
}

/**
 * Sprawdza, czy znormalizowany tag można przypisać do gatunku kanonicznego.
 *
 * @param tag - Znormalizowany tag Last.fm.
 * @returns `true`, gdy klasyfikator rozpoznaje gatunek.
 */
export function isLikelyGenreTag(tag: LastfmTag): boolean {
  return getCanonicalGenreName(tag.name) !== null;
}
