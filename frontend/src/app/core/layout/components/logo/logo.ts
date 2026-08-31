import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-logo',
  imports: [],
  templateUrl: './logo.html',
  styleUrl: './logo.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: {
    class: 'brand-logo',
  },
})
class Logo {
  readonly logoUrl = 'logo.png';
}

export { Logo };
