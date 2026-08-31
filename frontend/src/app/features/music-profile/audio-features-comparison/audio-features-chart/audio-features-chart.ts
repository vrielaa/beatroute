import { Component, computed, input, signal, ChangeDetectionStrategy } from '@angular/core';
import {
  AudioComparisonChartPlot,
  AudioComparisonChartPoint,
  AudioComparisonFeature,
  AudioComparisonFeatureKey,
  AudioComparisonChartRow,
} from '../audio-features-comparison.models';
import { AudioFeaturesChartPoint } from '../audio-features-chart-point/audio-features-chart-point';
import { AudioFeaturesChartTooltip } from '../audio-features-chart-tooltip/audio-features-chart-tooltip';

type ActiveChartPointTooltip = {
  point: AudioComparisonChartPoint;
  feature: AudioComparisonFeature;
};

const CHART_MIN_WIDTH = 1000;
const CHART_ROW_WIDTH = 92;
const CHART_EDGE_LABEL_PADDING = 132;
const CHART_HEIGHT = 360;
const CHART_PADDING = {
  top: 16,
  right: CHART_EDGE_LABEL_PADDING,
  bottom: 104,
  left: CHART_EDGE_LABEL_PADDING,
} as const;
const CHART_TICKS = [1, 0.75, 0.5, 0.25, 0];

@Component({
  selector: 'app-audio-features-chart',
  imports: [AudioFeaturesChartPoint, AudioFeaturesChartTooltip],
  templateUrl: './audio-features-chart.html',
  styleUrl: './audio-features-chart.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: {
    class: 'audio-features-chart-host',
  },
})
class AudioFeaturesChart {
  public readonly rows = input.required<AudioComparisonChartRow[]>();
  public readonly features = input.required<AudioComparisonFeature[]>();
  public readonly activePointTooltip = signal<ActiveChartPointTooltip | null>(null);

  public readonly chartWidth = computed(() =>
    Math.max(
      CHART_MIN_WIDTH,
      CHART_PADDING.left + CHART_PADDING.right + this.rows().length * CHART_ROW_WIDTH
    )
  );
  public readonly chartViewBox = computed(() => `0 0 ${this.chartWidth()} ${CHART_HEIGHT}`);
  public readonly chartPlot = computed<AudioComparisonChartPlot>(() => ({
    left: CHART_PADDING.left,
    top: CHART_PADDING.top,
    width: this.chartWidth() - CHART_PADDING.left - CHART_PADDING.right,
    height: CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom,
  }));
  public readonly xAxisLabels = computed(() =>
    this.rows().map((row, index) => ({
      id: row.id,
      label: row.axisLabel,
      title: `${row.trackName} - ${row.artists}`,
      x: this.chartX(index, this.rows().length),
    }))
  );
  public readonly yAxisTicks = computed(() =>
    CHART_TICKS.map((value) => ({
      value,
      label: value.toFixed(value % 1 === 0 ? 0 : 2),
      y: this.chartY(value),
    }))
  );

  public seriesPoints(featureKey: AudioComparisonFeatureKey): AudioComparisonChartPoint[] {
    const rows = this.rows();

    return rows.reduce<AudioComparisonChartPoint[]>((points, row, index) => {
      const value = row.values[featureKey];

      if (value === null) {
        return points;
      }

      const featureLabel = this.featureLabel(featureKey);
      const formattedValue = this.formatFeatureValue(value);

      points.push({
        id: `${featureKey}-${row.id}`,
        x: this.chartX(index, rows.length),
        y: this.chartY(value),
        value,
        featureLabel,
        formattedValue,
        tooltip: `${featureLabel}: ${formattedValue}`,
      });

      return points;
    }, []);
  }

  public polylinePoints(featureKey: AudioComparisonFeatureKey): string {
    return this.seriesPoints(featureKey)
      .map((point) => `${point.x},${point.y}`)
      .join(' ');
  }

  public showPointTooltip(point: AudioComparisonChartPoint, feature: AudioComparisonFeature): void {
    this.activePointTooltip.set({ point, feature });
  }

  public hidePointTooltip(point: AudioComparisonChartPoint): void {
    if (this.activePointTooltip()?.point.id === point.id) {
      this.activePointTooltip.set(null);
    }
  }

  private chartX(index: number, total: number): number {
    if (total <= 1) {
      return this.chartPlot().left + this.chartPlot().width / 2;
    }

    return this.chartPlot().left + (index / (total - 1)) * this.chartPlot().width;
  }

  private chartY(value: number): number {
    return this.chartPlot().top + (1 - value) * this.chartPlot().height;
  }

  private featureLabel(featureKey: AudioComparisonFeatureKey): string {
    return this.features().find((feature) => feature.key === featureKey)?.label ?? featureKey;
  }

  private formatFeatureValue(value: number): string {
    return String(value);
  }
}

export { AudioFeaturesChart };
