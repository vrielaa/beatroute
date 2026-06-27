import { Component, input } from '@angular/core';
import { Icon } from '@shared/components/icon/icon';

@Component({
  selector: 'app-average-bpm',
  imports: [Icon],
  templateUrl: './average-bpm.html',
  host: {
    class:
      'row-start-1 row-end-2 col-start-2 col-end-3 grid min-h-[20rem] w-full min-w-[0] grid-cols-1 grid-rows-[auto_minmax(10rem,1fr)] gap-[1rem] max-[960px]:min-h-[16rem] max-[960px]:grid-rows-[auto_minmax(7rem,1fr)] max-[600px]:min-h-[14rem]',
  },
})
export class AverageBpm {
  public readonly averageBpm = input<number | null>(null);
  public readonly isLoading = input(false);
}
