import { Component, input, output } from '@angular/core';
import { Icon } from '@shared/components/icon/icon';
import { NavLink } from '../app-shell.models';

@Component({
  selector: 'app-shell-nav',
  imports: [Icon],
  templateUrl: './app-shell-nav.html',
  styleUrl: './app-shell-nav.scss',
  host: {
    class: 'app-shell-navigation-host',
  },
})
export class AppShellNav {
  public readonly navLinks = input.required<NavLink[]>();
  public readonly navigate = output<string>();
}
