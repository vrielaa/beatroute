export function normalizeLastfmTags(tags) {
  return (Array.isArray(tags) ? tags : tags ? [tags] : [])
    .map((tag) => ({
      name: typeof tag?.name === "string" ? tag.name.trim() : "",
      url: typeof tag?.url === "string" ? tag.url : null,
    }))
    .filter((tag) => tag.name);
}

export function normalizeGenreName(name) {
  return name
    .toLowerCase()
    .replace(/&/g, " n ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPopToken(token) {
  return token === "pop" || token.endsWith("pop");
}

function isRapToken(token) {
  return token === "rap" || /^rap[a-z0-9]+$/.test(token);
}

function findTokenStartIndex(tokens, predicate) {
  let startIndex = 0;

  for (const token of tokens) {
    if (predicate(token)) {
      return startIndex;
    }

    startIndex += token.length;
  }

  return -1;
}

const CORE_GENRE_RULES = [
  {
    name: "dancehall",
    index: ({ compactName }) => compactName.indexOf("dancehall"),
  },
  {
    name: "drum and bass",
    index: ({ compactName }) => {
      const drumAndBassIndex = compactName.indexOf("drumandbass");
      return drumAndBassIndex >= 0
        ? drumAndBassIndex
        : compactName.indexOf("dnb");
    },
  },
  {
    name: "dubstep",
    index: ({ compactName }) => compactName.indexOf("dubstep"),
  },
  {
    name: "reggaeton",
    index: ({ compactName }) => compactName.indexOf("reggaeton"),
  },
  {
    name: "hip hop",
    index: ({ compactName }) => compactName.indexOf("hiphop"),
  },
  {
    name: "r&b",
    index: ({ compactName }) => compactName.indexOf("rnb"),
  },
  {
    name: "electronic",
    index: ({ compactName }) => {
      const electronicIndexes = ["electronic", "electronica", "electro"]
        .map((keyword) => compactName.indexOf(keyword))
        .filter((index) => index >= 0);

      return electronicIndexes.length ? Math.min(...electronicIndexes) : -1;
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
  {
    name: "rock",
    index: ({ compactName }) => compactName.indexOf("rock"),
  },
  {
    name: "alternative",
    index: ({ compactName }) => compactName.indexOf("alternative"),
  },
  {
    name: "ambient",
    index: ({ compactName }) => compactName.indexOf("ambient"),
  },
  {
    name: "afrobeat",
    index: ({ compactName }) => compactName.indexOf("afrobeat"),
  },
  {
    name: "blues",
    index: ({ compactName }) => compactName.indexOf("blues"),
  },
  {
    name: "classical",
    index: ({ compactName }) => compactName.indexOf("classical"),
  },
  {
    name: "country",
    index: ({ compactName }) => compactName.indexOf("country"),
  },
  {
    name: "dance",
    index: ({ compactName }) => compactName.indexOf("dance"),
  },
  {
    name: "disco",
    index: ({ compactName }) => compactName.indexOf("disco"),
  },
  {
    name: "dub",
    index: ({ compactName }) => compactName.indexOf("dub"),
  },
  {
    name: "emo",
    index: ({ compactName }) => compactName.indexOf("emo"),
  },
  {
    name: "experimental",
    index: ({ compactName }) => compactName.indexOf("experimental"),
  },
  {
    name: "folk",
    index: ({ compactName }) => compactName.indexOf("folk"),
  },
  {
    name: "funk",
    index: ({ compactName }) => compactName.indexOf("funk"),
  },
  {
    name: "garage",
    index: ({ compactName }) => compactName.indexOf("garage"),
  },
  {
    name: "goth",
    index: ({ compactName }) => compactName.indexOf("goth"),
  },
  {
    name: "grunge",
    index: ({ compactName }) => compactName.indexOf("grunge"),
  },
  {
    name: "hardcore",
    index: ({ compactName }) => compactName.indexOf("hardcore"),
  },
  {
    name: "house",
    index: ({ compactName }) => compactName.indexOf("house"),
  },
  {
    name: "indie",
    index: ({ compactName }) => compactName.indexOf("indie"),
  },
  {
    name: "industrial",
    index: ({ compactName }) => compactName.indexOf("industrial"),
  },
  {
    name: "jazz",
    index: ({ compactName }) => compactName.indexOf("jazz"),
  },
  {
    name: "latin",
    index: ({ compactName }) => compactName.indexOf("latin"),
  },
  {
    name: "metal",
    index: ({ compactName }) => compactName.indexOf("metal"),
  },
  {
    name: "punk",
    index: ({ compactName }) => compactName.indexOf("punk"),
  },
  {
    name: "reggae",
    index: ({ compactName }) => compactName.indexOf("reggae"),
  },
  {
    name: "ska",
    index: ({ compactName }) => compactName.indexOf("ska"),
  },
  {
    name: "shoegaze",
    index: ({ compactName }) => compactName.indexOf("shoegaze"),
  },
  {
    name: "soul",
    index: ({ compactName }) => compactName.indexOf("soul"),
  },
  {
    name: "techno",
    index: ({ compactName }) => compactName.indexOf("techno"),
  },
  {
    name: "trance",
    index: ({ compactName }) => compactName.indexOf("trance"),
  },
  {
    name: "trap",
    index: ({ compactName }) => compactName.indexOf("trap"),
  },
  {
    name: "wave",
    index: ({ compactName }) => compactName.indexOf("wave"),
  },
];

export function getCanonicalGenreName(name) {
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
  const matches = CORE_GENRE_RULES.map((rule, priority) => ({
    name: rule.name,
    priority,
    index: rule.index({ normalizedName, compactName, tokens }),
  }))
    .filter((match) => match.index >= 0)
    .sort(
      (firstMatch, secondMatch) =>
        firstMatch.index - secondMatch.index ||
        firstMatch.priority - secondMatch.priority
    );

  return matches[0]?.name ?? null;
}

export function isLikelyGenreTag(tag) {
  return getCanonicalGenreName(tag.name) !== null;
}
