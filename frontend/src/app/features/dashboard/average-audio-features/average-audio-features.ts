import { Component, computed, input } from '@angular/core';
import { AudioStats } from '@src/app/core/models/models';
import { Icon } from '@shared/components/icon/icon';
import { DASHBOARD_FULL_WIDTH_SECTION_HOST_CLASS } from '../dashboard-host-classes';

type AudioFeatureItem = {
  label: string;
  description: string;
  value: number | null;
  min: number;
  max: number;
  decimals: number;
  unit?: string;
  details: string;
  lowMeaning: string;
  highMeaning: string;
};

@Component({
  selector: 'app-average-audio-features',
  imports: [Icon],
  templateUrl: './average-audio-features.html',
  host: {
    class: DASHBOARD_FULL_WIDTH_SECTION_HOST_CLASS,
  },
})
export class AverageAudioFeatures {
  public readonly audioStats = input<AudioStats | null>(null);
  public readonly isLoading = input(false);

  public readonly features = computed<AudioFeatureItem[]>(() => {
    const stats = this.audioStats();

    return [
      {
        label: 'Energia',
        description: 'Intensywność i dynamika utworów',
        value: stats?.averageEnergy ?? null,
        min: 0,
        max: 1,
        decimals: 2,
        details:
          'Opisuje, jak mocno utwór brzmi pod względem tempa, głośności, dynamiki i ogólnej intensywności.',
        lowMeaning: '0 oznacza spokojne, delikatne lub oszczędne brzmienie',
        highMeaning: '1 oznacza szybkie, głośne, dynamiczne i mocno pobudzające brzmienie',
      },
      {
        label: 'Taneczność',
        description: 'Jak bardzo utwory nadają się do tańca',
        value: stats?.averageDanceability ?? null,
        min: 0,
        max: 1,
        decimals: 2,
        details:
          'Ocena rytmiczności utworu. Bierze pod uwagę między innymi stabilność tempa, regularność rytmu i beat.',
        lowMeaning: '0 oznacza nieregularny lub trudny do tańczenia rytm',
        highMeaning: '1 oznacza regularny, wyraźny rytm sprzyjający tańczeniu',
      },
      {
        label: 'Nastrój',
        description: 'Pozytywność brzmienia',
        value: stats?.averageValence ?? null,
        min: 0,
        max: 1,
        decimals: 2,
        details:
          'Określa emocjonalny kolor utworu. To nie jest tekst piosenki, tylko brzmieniowe wrażenie: jasne, lekkie, smutne, napięte albo mroczne.',
        lowMeaning: '0 oznacza smutniejsze, ciemniejsze lub bardziej napięte brzmienie',
        highMeaning: '1 oznacza radosne, jasne lub optymistyczne brzmienie',
      },
      {
        label: 'Akustyczność',
        description: 'Udział akustycznego brzmienia',
        value: stats?.averageAcousticness ?? null,
        min: 0,
        max: 1,
        decimals: 2,
        details:
          'Szacuje, czy utwór brzmi jak nagrany na instrumentach akustycznych, np. gitarze akustycznej, pianinie lub żywej perkusji.',
        lowMeaning: '0 oznacza brzmienie bardziej elektroniczne, przetworzone lub studyjnie produkowane',
        highMeaning: '1 oznacza brzmienie wyraźnie akustyczne i naturalne',
      },
      {
        label: 'Instrumentalność',
        description: 'Prawdopodobieństwo braku wokalu',
        value: stats?.averageInstrumentalness ?? null,
        min: 0,
        max: 1,
        decimals: 2,
        details:
          'Szacuje, czy w utworze dominuje muzyka bez śpiewu. Pojedyncze krótkie sample głosu nie muszą oznaczać niskiej instrumentalności.',
        lowMeaning: '0 oznacza utwór raczej wokalny, ze śpiewem lub rapem',
        highMeaning: '1 oznacza utwór najpewniej instrumentalny',
      },
      {
        label: 'Live',
        description: 'Obecność publiczności lub nagrania live',
        value: stats?.averageLiveness ?? null,
        min: 0,
        max: 1,
        decimals: 2,
        details:
          'Wykrywa sygnały nagrania na żywo, np. pogłos sali, reakcje publiczności albo atmosferę koncertową.',
        lowMeaning: '0 oznacza typowe nagranie studyjne bez oznak publiczności',
        highMeaning: '1 oznacza duże prawdopodobieństwo nagrania live lub obecności publiczności',
      },
      {
        label: 'Mowa',
        description: 'Udział partii mówionych',
        value: stats?.averageSpeechiness ?? null,
        min: 0,
        max: 1,
        decimals: 2,
        details:
          'Partia mówiona to fragment oparty bardziej na mowie niż na śpiewanej melodii, np. rap, spoken word, dialog, monolog, podcastowy głos albo recytacja.',
        lowMeaning: '0 oznacza mało mowy i więcej śpiewu lub samej muzyki',
        highMeaning:
          '1 oznacza dużą dominację mowy; bardzo wysokie wartości częściej pasują do podcastów, przemówień lub spoken word niż do typowych piosenek',
      },
      {
        label: 'Głośność',
        description: 'Średnia głośność utworów',
        value: stats?.averageLoudness ?? null,
        min: -60,
        max: 0,
        decimals: 1,
        unit: 'dB',
        details:
          'Średni poziom głośności utworu w decybelach względem cyfrowego maksimum. Wartości są zwykle ujemne, bo 0 dB oznacza sufit sygnału audio.',
        lowMeaning: '-60 dB oznacza bardzo cichy poziom',
        highMeaning: '0 dB oznacza maksymalny cyfrowy poziom; im bliżej 0, tym głośniej',
      },
    ];
  });

  public readonly hasAnyFeature = computed(() =>
    this.features().some((feature) => feature.value !== null)
  );

  public displayValue(feature: AudioFeatureItem): string {
    if (feature.value === null) {
      return 'Brak danych';
    }

    return `${feature.value.toFixed(feature.decimals)}${this.unitSuffix(feature)}`;
  }

  public barWidth(feature: AudioFeatureItem): string {
    if (feature.value === null || feature.max === feature.min) {
      return '0%';
    }

    const progress = ((feature.value - feature.min) / (feature.max - feature.min)) * 100;
    const clampedProgress = Math.min(Math.max(progress, 0), 100);

    return `${clampedProgress}%`;
  }

  public rangeStart(feature: AudioFeatureItem): string {
    return `${this.formatRangeValue(feature.min, feature)}${this.unitSuffix(feature)}`;
  }

  public rangeEnd(feature: AudioFeatureItem): string {
    return `${this.formatRangeValue(feature.max, feature)}${this.unitSuffix(feature)}`;
  }

  public tooltipText(feature: AudioFeatureItem): string {
    return `${feature.details} Zakres ${this.rangeStart(feature)} - ${this.rangeEnd(feature)}: ${feature.lowMeaning}, ${feature.highMeaning}.`;
  }

  private formatRangeValue(value: number, feature: AudioFeatureItem): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(feature.decimals);
  }

  private unitSuffix(feature: AudioFeatureItem): string {
    return feature.unit ? ` ${feature.unit}` : '';
  }
}
