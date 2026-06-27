import { Component } from '@angular/core';

@Component({
  selector: 'app-logo',
  imports: [],
  templateUrl: './logo.html',
  host: {
    class:
      'grid h-full w-[min(35rem,100%)] min-w-[0] grid-cols-[6rem_minmax(0,auto)] items-center text-inherit [font-family:var(--default-mono-font-family)] max-[600px]:w-auto max-[600px]:grid-cols-[4.6rem_minmax(0,auto)] max-[360px]:grid-cols-[4rem]',
  },
})
export class Logo {
  readonly logoUrl = 'logo.png';
}
