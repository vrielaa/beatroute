import { Component, computed, input, signal } from '@angular/core';
import {
  AudioComparisonChartPoint,
  AudioComparisonFeature,
} from '../audio-features-comparison.models';

const POINT_TOOLTIP_MIN_WIDTH = 172;
const POINT_TOOLTIP_MAX_WIDTH = 320;
const POINT_TOOLTIP_HEIGHT = 44;
const POINT_TOOLTIP_GAP = 14;
const POINT_TOOLTIP_EDGE_MARGIN = 12;
const POINT_TOOLTIP_HORIZONTAL_PADDING = 52;
const POINT_TOOLTIP_TEXT_PADDING = 44;
const AVERAGE_TOOLTIP_CHARACTER_WIDTH = 7.8;
const CHART_HEIGHT = 360;

type PointTooltip = {
  x: number;
  y: number;
  width: number;
  title: string;
  color: string;
  textLength: number | null;
};

@Component({
  selector: 'g[appAudioFeaturesChartPoint]',
  imports: [],
  templateUrl: './audio-features-chart-point.html',
  host: {
    class: 'audio-features-comparison-point-group',
    tabindex: '0',
    role: 'img',
    '[attr.aria-label]': 'point().tooltip',
    '(mouseenter)': 'showPointTooltip()',
    '(mouseleave)': 'hidePointTooltip()',
    '(focus)': 'showPointTooltip()',
    '(blur)': 'hidePointTooltip()',
    '(keydown.escape)': 'hidePointTooltip()',
  },
})
export class AudioFeaturesChartPoint {
  public readonly point = input.required<AudioComparisonChartPoint>();
  public readonly feature = input.required<AudioComparisonFeature>();
  public readonly chartWidth = input.required<number>();
  public readonly tooltip = signal<PointTooltip | null>(null);
  public readonly tooltipTitle = computed(
    () => `${this.point().featureLabel}: ${this.point().formattedValue}`
  );

  public showPointTooltip(): void {
    const point = this.point();
    const title = this.tooltipTitle();
    const width = this.tooltipWidth(title);
    const preferredX = point.x - width / 2;
    const x = Math.min(
      Math.max(preferredX, POINT_TOOLTIP_EDGE_MARGIN),
      this.chartWidth() - width - POINT_TOOLTIP_EDGE_MARGIN
    );
    const preferredY = point.y - POINT_TOOLTIP_HEIGHT - POINT_TOOLTIP_GAP;
    const y =
      preferredY < POINT_TOOLTIP_EDGE_MARGIN
        ? point.y + POINT_TOOLTIP_GAP
        : Math.min(preferredY, CHART_HEIGHT - POINT_TOOLTIP_HEIGHT - POINT_TOOLTIP_EDGE_MARGIN);

    this.tooltip.set({
      x,
      y,
      width,
      title,
      color: this.feature().color,
      textLength: this.textLength(title, width),
    });
  }

  public hidePointTooltip(): void {
    this.tooltip.set(null);
  }

  private tooltipWidth(title: string): number {
    const estimatedWidth =
      title.length * AVERAGE_TOOLTIP_CHARACTER_WIDTH + POINT_TOOLTIP_HORIZONTAL_PADDING;

    return Math.min(Math.max(estimatedWidth, POINT_TOOLTIP_MIN_WIDTH), POINT_TOOLTIP_MAX_WIDTH);
  }

  private textLength(title: string, tooltipWidth: number): number | null {
    const textWidth = title.length * AVERAGE_TOOLTIP_CHARACTER_WIDTH;
    const maxTextWidth = tooltipWidth - POINT_TOOLTIP_TEXT_PADDING;

    return textWidth > maxTextWidth ? maxTextWidth : null;
  }
}
