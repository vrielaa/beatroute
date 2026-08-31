import { Component, computed, input, ChangeDetectionStrategy } from '@angular/core';
import { AudioStats } from '@core/models/models';
import { AUDIO_PROFILE_CHART, buildAudioProfileChart } from './audio-features-profile.utils';

@Component({
  selector: 'app-audio-features-profile',
  templateUrl: './audio-features-profile.html',
  styleUrl: './audio-features-profile.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: {
    class: 'audio-features-profile',
  },
})
class AudioFeaturesProfile {
  public readonly audioStats = input<AudioStats | null>(null);
  public readonly isLoading = input(false);

  private readonly chart = computed(() => buildAudioProfileChart(this.audioStats()));

  public readonly chartViewBox = AUDIO_PROFILE_CHART.viewBox;
  public readonly centerX = AUDIO_PROFILE_CHART.centerX;
  public readonly centerY = AUDIO_PROFILE_CHART.centerY;
  public readonly hasAnyFeature = computed(() => this.chart().hasAnyFeature);
  public readonly axes = computed(() => this.chart().axes);
  public readonly gridPolygons = computed(() => this.chart().gridPolygons);
  public readonly ticks = computed(() => this.chart().ticks);
  public readonly profilePolygonPoints = computed(() => this.chart().profilePolygonPoints);
  public readonly profilePointMarkers = computed(() => this.chart().profilePointMarkers);
}

export { AudioFeaturesProfile };
