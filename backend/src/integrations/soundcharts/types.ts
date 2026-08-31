type SoundchartsAudioFeatures = {
  acousticness?: number | null;
  danceability?: number | null;
  energy?: number | null;
  instrumentalness?: number | null;
  liveness?: number | null;
  loudness?: number | null;
  speechiness?: number | null;
  tempo?: number | null;
  valence?: number | null;
  key?: number | null;
  mode?: number | null;
  timeSignature?: number | null;
};

type SoundchartsApiSongResponse = {
  type: string;
  object: {
    uuid: string;
    name: string;
    isrc: {
      value: string;
      countryCode: string;
      countryName: string;
    };
    iswcs: string[];
    creditName: string;
    artists: {
      uuid: string;
      slug: string;
      name: string;
      appUrl: string;
      imageUrl: string;
    }[];
    mainArtists: {
      uuid: string;
      slug: string;
      name: string;
      appUrl: string;
      imageUrl: string;
    }[];
    releaseDate: string; // ISO 8601 date
    copyright: string;
    appUrl: string;
    imageUrl: string;
    duration: number;
    explicit: boolean;
    genres: {
      root: string;
      sub: string[];
    }[];
    composers: string[];
    producers: string[];
    labels: {
      name: string;
      type: string;
    }[];
    audio: {
      acousticness: number;
      danceability: number;
      energy: number;
      instrumentalness: number;
      key: number;
      liveness: number;
      loudness: number;
      mode: number;
      speechiness: number;
      tempo: number;
      timeSignature: number;
      valence: number;
    };
    languageCode: string;
    distributor: string;
    credits: {
      uuid: string;
      name: string;
      roles: string[];
    }[];
  };
};

type SoundchartsApiErrorResponse = {
  errors: {
    key: string;
    code: number;
    message: string;
  }[];
};

type SoundchartsApiResponse =
  SoundchartsApiSongResponse | SoundchartsApiErrorResponse;

export {
  type SoundchartsAudioFeatures,
  type SoundchartsApiSongResponse,
  type SoundchartsApiErrorResponse,
  type SoundchartsApiResponse,
};
