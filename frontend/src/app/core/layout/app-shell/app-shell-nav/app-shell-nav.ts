import { Component, input, output } from '@angular/core';
import { Icon } from '@shared/components/icon/icon';
import { NavLink } from '../app-shell.models';

@Component({
  selector: 'app-shell-nav',
  imports: [Icon],
  templateUrl: './app-shell-nav.html',
  host: {
    class: 'contents',
  },
})
export class AppShellNav {
  public readonly navLinks = input.required<NavLink[]>();
  public readonly navigate = output<string>();
}
