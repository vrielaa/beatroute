import {
  Component,
  ElementRef,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TimeRange, TopArtist } from '@src/app/core/models/models';
import { Icon } from '@shared/components/icon/icon';

@Component({
  selector: 'app-most-listened-artists',
  imports: [Icon],
  templateUrl: './most-listened-artists.html',
  styleUrl: './most-listened-artists.scss',
})
export class MostListenedArtists {
  private readonly skeletonGrid = viewChild<ElementRef<HTMLOListElement>>('skeletonGrid');
  private readonly skeletonCount = signal(1);

  public readonly timeRange = input<TimeRange>('short_term');
  public readonly artists = input<TopArtist[]>([]);
  public readonly isLoading = input(true);
  public readonly hasError = input(false);
  public readonly retryRequested = output<void>();
  public readonly skeletonItems = computed(() =>
    Array.from({ length: this.skeletonCount() }, (_, index) => index)
  );

  public readonly periodLabel = computed(() => {
    const labels: Record<TimeRange, string> = {
      short_term: 'ostatniego miesiąca',
      medium_term: 'ostatnich 6 miesięcy',
      long_term: 'ostatniego roku',
    };
    console.log(this.artists());

    return labels[this.timeRange()];
  });

  constructor() {
    effect((onCleanup) => {
      const grid = this.skeletonGrid();

      if (!this.isLoading() || !grid) return;

      const element = grid.nativeElement;
      const observer = new ResizeObserver(() => this.updateSkeletonCount(element));

      observer.observe(element);
      this.updateSkeletonCount(element);

      onCleanup(() => observer.disconnect());
    });
  }

  public retry(): void {
    this.retryRequested.emit();
  }

  public artistInitial(artist: TopArtist): string {
    return artist.name.charAt(0).toUpperCase();
  }

  private updateSkeletonCount(grid: HTMLOListElement): void {
    const columns = getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean).length;
    const nextCount = Math.max(columns, 1);

    if (nextCount !== this.skeletonCount()) {
      this.skeletonCount.set(nextCount);
    }
  }
}
