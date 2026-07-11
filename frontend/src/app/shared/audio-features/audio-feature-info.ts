import { TooltipContent } from '@shared/tooltip/tooltip-content';

export type AudioFeatureInfoKey =
  | 'tempo'
  | 'energy'
  | 'danceability'
  | 'valence'
  | 'acousticness'
  | 'instrumentalness'
  | 'liveness'
  | 'speechiness'
  | 'loudness'
  | 'key'
  | 'mode'
  | 'timeSignature';

export type RangedAudioFeatureInfoKey = Exclude<AudioFeatureInfoKey, 'key' | 'mode' | 'timeSignature'>;

type AudioFeatureInfo = {
  label: string;
  description: string;
  details: string;
  min?: number;
  max?: number;
  decimals?: number;
  unit?: string;
  lowMeaning?: string;
  highMeaning?: string;
};

export const AUDIO_FEATURE_INFO: Record<AudioFeatureInfoKey, AudioFeatureInfo> = {
  tempo: {
    label: 'BPM',
    description: 'Tempo utworu',
    min: 40,
    max: 220,
    decimals: 0,
    unit: 'BPM',
    details: 'Tempo określa szybkość pulsu utworu, czyli liczbę uderzeń na minutę.',
    lowMeaning: 'niższe BPM oznacza wolniejsze, spokojniejsze tempo',
    highMeaning: 'wyższe BPM oznacza szybsze, bardziej pobudzające tempo',
  },
  energy: {
    label: 'Energia',
    description: 'Intensywność i dynamika utworów',
    min: 0,
    max: 1,
    decimals: 2,
    details:
      'Opisuje, jak mocno utwór brzmi pod względem tempa, głośności, dynamiki i ogólnej intensywności.',
    lowMeaning: '0 oznacza spokojne, delikatne lub oszczędne brzmienie',
    highMeaning: '1 oznacza szybkie, głośne, dynamiczne i mocno pobudzające brzmienie',
  },
  danceability: {
    label: 'Taneczność',
    description: 'Jak bardzo utwory nadają się do tańca',
    min: 0,
    max: 1,
    decimals: 2,
    details:
      'Ocena rytmiczności utworu. Bierze pod uwagę między innymi stabilność tempa, regularność rytmu i beat.',
    lowMeaning: '0 oznacza nieregularny lub trudny do tańczenia rytm',
    highMeaning: '1 oznacza regularny, wyraźny rytm sprzyjający tańczeniu',
  },
  valence: {
    label: 'Nastrój',
    description: 'Pozytywność brzmienia',
    min: 0,
    max: 1,
    decimals: 2,
    details:
      'Określa emocjonalny kolor utworu. To nie jest tekst piosenki, tylko brzmieniowe wrażenie: jasne, lekkie, smutne, napięte albo mroczne.',
    lowMeaning: '0 oznacza smutniejsze, ciemniejsze lub bardziej napięte brzmienie',
    highMeaning: '1 oznacza radosne, jasne lub optymistyczne brzmienie',
  },
  acousticness: {
    label: 'Akustyczność',
    description: 'Udział akustycznego brzmienia',
    min: 0,
    max: 1,
    decimals: 2,
    details:
      'Szacuje, czy utwór brzmi jak nagrany na instrumentach akustycznych, np. gitarze akustycznej, pianinie lub żywej perkusji.',
    lowMeaning: '0 oznacza brzmienie bardziej elektroniczne, przetworzone lub studyjnie produkowane',
    highMeaning: '1 oznacza brzmienie wyraźnie akustyczne i naturalne',
  },
  instrumentalness: {
    label: 'Instrumentalność',
    description: 'Prawdopodobieństwo braku wokalu',
    min: 0,
    max: 1,
    decimals: 2,
    details:
      'Szacuje, czy w utworze dominuje muzyka bez śpiewu. Pojedyncze krótkie sample głosu nie muszą oznaczać niskiej instrumentalności.',
    lowMeaning: '0 oznacza utwór raczej wokalny, ze śpiewem lub rapem',
    highMeaning: '1 oznacza utwór najpewniej instrumentalny',
  },
  liveness: {
    label: 'Live',
    description: 'Obecność publiczności lub nagrania live',
    min: 0,
    max: 1,
    decimals: 2,
    details:
      'Wykrywa sygnały nagrania na żywo, np. pogłos sali, reakcje publiczności albo atmosferę koncertową.',
    lowMeaning: '0 oznacza typowe nagranie studyjne bez oznak publiczności',
    highMeaning: '1 oznacza duże prawdopodobieństwo nagrania live lub obecności publiczności',
  },
  speechiness: {
    label: 'Mowa',
    description: 'Udział partii mówionych',
    min: 0,
    max: 1,
    decimals: 2,
    details:
      'Partia mówiona to fragment oparty bardziej na mowie niż na śpiewanej melodii, np. rap, spoken word, dialog, monolog, podcastowy głos albo recytacja.',
    lowMeaning: '0 oznacza mało mowy i więcej śpiewu lub samej muzyki',
    highMeaning:
      '1 oznacza dużą dominację mowy; bardzo wysokie wartości częściej pasują do podcastów, przemówień lub spoken word niż do typowych piosenek',
  },
  loudness: {
    label: 'Głośność',
    description: 'Średnia głośność utworów',
    min: -60,
    max: 0,
    decimals: 1,
    unit: 'dB',
    details:
      'Średni poziom głośności utworu w decybelach względem cyfrowego maksimum. Wartości są zwykle ujemne, bo 0 dB oznacza sufit sygnału audio.',
    lowMeaning: '-60 dB oznacza bardzo cichy poziom',
    highMeaning: '0 dB oznacza maksymalny cyfrowy poziom; im bliżej 0, tym głośniej',
  },
  key: {
    label: 'Tonacja',
    description: 'Główna tonacja utworu',
    details:
      'Tonacja opisuje wysokości dźwięków, wokół których zbudowany jest utwór, np. C, F# albo A. Pomaga określić muzyczne centrum utworu.',
  },
  mode: {
    label: 'Tryb',
    description: 'Charakter durowy lub molowy',
    details:
      'Tryb określa, czy utwór jest bliższy skali durowej, zwykle jaśniejszej, czy molowej, zwykle ciemniejszej lub bardziej melancholijnej.',
  },
  timeSignature: {
    label: 'Metrum',
    description: 'Organizacja rytmu w takcie',
    details:
      'Metrum opisuje, jak rytm jest dzielony na takty. Na przykład 4/4 oznacza cztery ćwierćnutowe uderzenia w jednym takcie.',
  },
};

export function audioFeatureTooltip(key: AudioFeatureInfoKey): TooltipContent {
  const feature = AUDIO_FEATURE_INFO[key];

  if (hasAudioFeatureRange(feature)) {
    return {
      title: feature.label,
      body: feature.details,
      range: {
        label: 'Zakres',
        min: formatRangeValue(feature.min, feature),
        max: formatRangeValue(feature.max, feature),
        lowMeaning: feature.lowMeaning,
        highMeaning: feature.highMeaning,
      },
    };
  }

  return {
    title: feature.label,
    body: feature.details,
  };
}

export function rangedAudioFeatureInfo(key: RangedAudioFeatureInfoKey): Required<
  Pick<AudioFeatureInfo, 'min' | 'max' | 'decimals' | 'lowMeaning' | 'highMeaning'>
> &
  AudioFeatureInfo {
  const feature = AUDIO_FEATURE_INFO[key];

  if (!hasAudioFeatureRange(feature)) {
    throw new Error(`Audio feature "${key}" does not define a numeric range.`);
  }

  return feature;
}

function hasAudioFeatureRange(feature: AudioFeatureInfo): feature is Required<
  Pick<AudioFeatureInfo, 'min' | 'max' | 'decimals' | 'lowMeaning' | 'highMeaning'>
> &
  AudioFeatureInfo {
  return (
    typeof feature.min === 'number' &&
    typeof feature.max === 'number' &&
    typeof feature.decimals === 'number' &&
    typeof feature.lowMeaning === 'string' &&
    typeof feature.highMeaning === 'string'
  );
}

function formatRangeValue(
  value: number,
  feature: Pick<AudioFeatureInfo, 'decimals' | 'unit'>
): string {
  const formattedValue = Number.isInteger(value) ? String(value) : value.toFixed(feature.decimals ?? 0);

  return feature.unit ? `${formattedValue} ${feature.unit}` : formattedValue;
}
