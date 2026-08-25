import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import {
  AudioComparisonChartPoint,
  AudioComparisonFeature,
} from '../audio-features-comparison.models';

@Component({
  selector: 'g[appAudioFeaturesChartPoint]',
  imports: [],
  templateUrl: './audio-features-chart-point.html',
  styleUrl: './audio-features-chart-point.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: {
    class: 'audio-features-comparison-point-group',
    tabindex: '0',
    role: 'img',
    '[attr.aria-label]': 'point().tooltip',
    '(mouseenter)': 'tooltipShow.emit()',
    '(mouseleave)': 'tooltipHide.emit()',
    '(focus)': 'tooltipShow.emit()',
    '(blur)': 'tooltipHide.emit()',
    '(keydown.escape)': 'tooltipHide.emit()',
  },
})
export class AudioFeaturesChartPoint {
  public readonly point = input.required<AudioComparisonChartPoint>();
  public readonly feature = input.required<AudioComparisonFeature>();
  public readonly tooltipShow = output<void>();
  public readonly tooltipHide = output<void>();
}
