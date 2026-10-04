/** Dane nazwy gatunku przygotowane do sprawdzenia reguł klasyfikacji. */
type GenreRuleContext = {
  normalizedName: string;
  compactName: string;
  tokens: string[];
};

/** Reguła przypisująca tag Last.fm do kanonicznego gatunku aplikacji. */
type GenreRule = {
  name: string;
  index(context: GenreRuleContext): number;
};

/** Tworzy regułę wyszukującą wskazany fragment w nazwie bez spacji. */
function createCompactNameRule(name: string, keyword = name): GenreRule {
  return {
    name,
    index: ({ compactName }) => compactName.indexOf(keyword),
  };
}

/** Sprawdza, czy token reprezentuje gatunek pop lub jego odmianę. */
function isPopToken(token: string): boolean {
  return token === "pop" || token.endsWith("pop");
}

/** Sprawdza, czy token reprezentuje rap lub jego odmianę. */
function isRapToken(token: string): boolean {
  return token === "rap" || /^rap[a-z0-9]+$/.test(token);
}

/** Zwraca pozycję pierwszego tokenu spełniającego podany warunek. */
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

const remainingCompactGenreNames = [
  "rock",
  "alternative",
  "ambient",
  "afrobeat",
  "blues",
  "classical",
  "country",
  "dance",
  "disco",
  "dub",
  "emo",
  "experimental",
  "folk",
  "funk",
  "garage",
  "goth",
  "grunge",
  "hardcore",
  "house",
  "indie",
  "industrial",
  "jazz",
  "latin",
  "metal",
  "punk",
  "reggae",
  "ska",
  "shoegaze",
  "soul",
  "techno",
  "trance",
  "trap",
  "wave",
];

/**
 * Reguły mapujące tagi Last.fm na kanoniczne gatunki aplikacji.
 * Kolejność rozstrzyga remis, gdy kilka reguł pasuje w tym samym miejscu.
 */
const CORE_GENRE_RULES: GenreRule[] = [
  createCompactNameRule("dancehall"),
  {
    name: "drum and bass",
    index: ({ compactName }) => {
      const fullNameIndex = compactName.indexOf("drumandbass");
      return fullNameIndex >= 0 ? fullNameIndex : compactName.indexOf("dnb");
    },
  },
  createCompactNameRule("dubstep"),
  createCompactNameRule("reggaeton"),
  createCompactNameRule("hip hop", "hiphop"),
  createCompactNameRule("r&b", "rnb"),
  {
    name: "electronic",
    index: ({ compactName }) => {
      const indexes = ["electronic", "electronica", "electro"]
        .map((keyword) => compactName.indexOf(keyword))
        .filter((index) => index >= 0);

      return indexes.length ? Math.min(...indexes) : -1;
    },
  },
  {
    name: "pop",
    index: ({ tokens }) => findTokenStartIndex(tokens, isPopToken),
  },
  {
    name: "rap",
    index: ({ tokens }) => findTokenStartIndex(tokens, isRapToken),
  },
  ...remainingCompactGenreNames.map((name) => createCompactNameRule(name)),
];

export { CORE_GENRE_RULES };
export type { GenreRuleContext };
