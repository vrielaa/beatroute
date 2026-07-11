import { Component, computed, input } from '@angular/core';
import {
  AudioComparisonChartPlot,
  AudioComparisonChartPoint,
  AudioComparisonFeature,
  AudioComparisonFeatureKey,
  AudioComparisonChartRow,
} from '../audio-features-comparison.models';

const CHART_WIDTH = 1000;
const CHART_HEIGHT = 360;
const CHART_PADDING = {
  top: 16,
  right: 24,
  bottom: 104,
  left: 52,
} as const;
const CHART_TICKS = [1, 0.75, 0.5, 0.25, 0];

@Component({
  selector: 'app-audio-features-chart',
  imports: [],
  templateUrl: './audio-features-chart.html',
  host: {
    class: 'block min-w-[0]',
  },
})
export class AudioFeaturesChart {
  public readonly rows = input.required<AudioComparisonChartRow[]>();
  public readonly features = input.required<AudioComparisonFeature[]>();

  public readonly chartViewBox = `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`;
  public readonly chartPlot: AudioComparisonChartPlot = {
    left: CHART_PADDING.left,
    top: CHART_PADDING.top,
    width: CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right,
    height: CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom,
  };
  public readonly xAxisLabels = computed(() =>
    this.rows().map((row, index) => ({
      id: row.id,
      label: row.axisLabel,
      title: `${row.trackName} - ${row.artists}`,
      x: this.chartX(index, this.rows().length),
    }))
  );
  public readonly yAxisTicks = CHART_TICKS.map((value) => ({
    value,
    label: value.toFixed(value % 1 === 0 ? 0 : 2),
    y: this.chartY(value),
  }));

  public seriesPoints(featureKey: AudioComparisonFeatureKey): AudioComparisonChartPoint[] {
    const rows = this.rows();

    return rows.reduce<AudioComparisonChartPoint[]>((points, row, index) => {
      const value = row.values[featureKey];

      if (value === null) {
        return points;
      }

      points.push({
        id: `${featureKey}-${row.id}`,
        x: this.chartX(index, rows.length),
        y: this.chartY(value),
        value,
        tooltip: `${row.trackName} - ${row.artists}, ${this.featureLabel(featureKey)} ${value.toFixed(2)}`,
      });

      return points;
    }, []);
  }

  public polylinePoints(featureKey: AudioComparisonFeatureKey): string {
    return this.seriesPoints(featureKey)
      .map((point) => `${point.x},${point.y}`)
      .join(' ');
  }

  private chartX(index: number, total: number): number {
    if (total <= 1) {
      return this.chartPlot.left + this.chartPlot.width / 2;
    }

    return this.chartPlot.left + (index / (total - 1)) * this.chartPlot.width;
  }

  private chartY(value: number): number {
    return this.chartPlot.top + (1 - value) * this.chartPlot.height;
  }

  private featureLabel(featureKey: AudioComparisonFeatureKey): string {
    return this.features().find((feature) => feature.key === featureKey)?.label ?? featureKey;
  }
}
