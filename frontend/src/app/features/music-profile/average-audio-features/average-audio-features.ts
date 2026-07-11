import { Component, computed, input } from '@angular/core';
import { AudioStats } from '@core/models/models';
import {
  AUDIO_FEATURE_INFO,
  RangedAudioFeatureInfoKey,
  audioFeatureTooltip,
  rangedAudioFeatureInfo,
} from '@shared/audio-features/audio-feature-info';
import { Icon } from '@shared/components/icon/icon';
import { Tooltip } from '@shared/components/tooltip/tooltip';
import { TooltipContent } from '@shared/tooltip/tooltip-content';

type AudioFeatureItem = {
  key: RangedAudioFeatureInfoKey;
  label: string;
  description: string;
  tooltip: TooltipContent;
  value: number | null;
  min: number;
  max: number;
  decimals: number;
  unit?: string;
};

@Component({
  selector: 'app-average-audio-features',
  imports: [Icon, Tooltip],
  templateUrl: './average-audio-features.html',
  styleUrl: './average-audio-features.scss',
  host: {
    class: 'average-audio-features',
  },
})
export class AverageAudioFeatures {
  public readonly audioStats = input<AudioStats | null>(null);
  public readonly isLoading = input(false);

  public readonly features = computed<AudioFeatureItem[]>(() => {
    const stats = this.audioStats();

    return [
      this.audioFeatureItem('energy', stats?.averageEnergy ?? null),
      this.audioFeatureItem('danceability', stats?.averageDanceability ?? null),
      this.audioFeatureItem('valence', stats?.averageValence ?? null),
      this.audioFeatureItem('acousticness', stats?.averageAcousticness ?? null),
      this.audioFeatureItem('instrumentalness', stats?.averageInstrumentalness ?? null),
      this.audioFeatureItem('liveness', stats?.averageLiveness ?? null),
      this.audioFeatureItem('speechiness', stats?.averageSpeechiness ?? null),
      this.audioFeatureItem('loudness', stats?.averageLoudness ?? null),
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

  private formatRangeValue(value: number, feature: AudioFeatureItem): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(feature.decimals);
  }

  private unitSuffix(feature: AudioFeatureItem): string {
    return feature.unit ? ` ${feature.unit}` : '';
  }

  private audioFeatureItem(key: RangedAudioFeatureInfoKey, value: number | null): AudioFeatureItem {
    const feature = AUDIO_FEATURE_INFO[key];
    const range = rangedAudioFeatureInfo(key);

    return {
      key,
      label: feature.label,
      description: feature.description,
      tooltip: audioFeatureTooltip(key),
      value,
      min: range.min,
      max: range.max,
      decimals: range.decimals,
      unit: feature.unit,
    };
  }
}
