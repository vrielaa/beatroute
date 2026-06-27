import { Component } from '@angular/core';

@Component({
  selector: 'app-music-map',
  imports: [],
  templateUrl: './music-map.html',
  host: {
    class:
      'flex min-h-[24rem] w-full min-w-[0] items-center justify-center rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[2rem] text-center text-[var(--color-text-primary)] shadow-[0_0.8rem_2.4rem_var(--color-shadow)]',
  },
})
export class MusicMap {}
