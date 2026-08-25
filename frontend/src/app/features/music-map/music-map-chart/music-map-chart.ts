import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { MusicMapPoint } from '@core/models/models';
import { MUSIC_MAP_CLUSTER_COLORS, MusicMapAxisTick } from '../music-map.models';

const PLOT_WIDTH = 1000;
const PLOT_HEIGHT = 420;
const PLOT_PADDING = {
  top: 36,
  right: 24,
  bottom: 58,
  left: 72,
} as const;
const PLOT_TICKS = [-1, -0.5, 0, 0.5, 1];

@Component({
  selector: 'app-music-map-chart',
  templateUrl: './music-map-chart.html',
  styleUrl: './music-map-chart.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: {
    class: 'music-map-chart-card card',
  },
})
export class MusicMapChart {
  public readonly points = input.required<MusicMapPoint[]>();
  public readonly selectedClusterId = input<number | null>(null);

  public readonly plotViewBox = `0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`;
  public readonly plotLeft = PLOT_PADDING.left;
  public readonly plotRight = PLOT_WIDTH - PLOT_PADDING.right;
  public readonly plotTop = PLOT_PADDING.top;
  public readonly plotBottom = PLOT_HEIGHT - PLOT_PADDING.bottom;
  public readonly plotCenterX = (this.plotLeft + this.plotRight) / 2;
  public readonly plotCenterY = (this.plotTop + this.plotBottom) / 2;
  public readonly xAxisTicks = PLOT_TICKS.map((value) => ({
    value,
    label: this.formatAxisTick(value),
    x: this.pointX({ x: value }),
    y: 0,
  }));
  public readonly yAxisTicks: MusicMapAxisTick[] = PLOT_TICKS.map((value) => ({
    value,
    label: this.formatAxisTick(value),
    x: 0,
    y: this.pointY({ y: value }),
  }));

  public pointX(point: Pick<MusicMapPoint, 'x'>): number {
    return this.plotLeft + ((point.x + 1) / 2) * (this.plotRight - this.plotLeft);
  }

  public pointY(point: Pick<MusicMapPoint, 'y'>): number {
    return this.plotBottom - ((point.y + 1) / 2) * (this.plotBottom - this.plotTop);
  }

  public clusterColor(clusterId: number): string {
    return MUSIC_MAP_CLUSTER_COLORS[Math.abs(clusterId) % MUSIC_MAP_CLUSTER_COLORS.length];
  }

  public isPointDimmed(point: MusicMapPoint): boolean {
    const selectedClusterId = this.selectedClusterId();

    return selectedClusterId !== null && point.cluster !== selectedClusterId;
  }

  public artistsLabel(point: Pick<MusicMapPoint, 'artists'>): string {
    return point.artists.join(', ');
  }

  private formatAxisTick(value: number): string {
    return value === 0 ? '0' : value.toFixed(1);
  }
}
