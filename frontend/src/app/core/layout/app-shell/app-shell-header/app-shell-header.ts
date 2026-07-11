import { Component, input, output } from '@angular/core';
import { Icon } from '@shared/components/icon/icon';
import { DarkMode } from '../../components/dark-mode/dark-mode';
import { Logo } from '../../components/logo/logo';
import { Logout } from '../../components/logout/logout';
import { UserProfile } from '../../components/user-profile/user-profile';

@Component({
  selector: 'app-shell-header',
  imports: [DarkMode, Icon, Logo, Logout, UserProfile],
  templateUrl: './app-shell-header.html',
  styleUrl: './app-shell-header.scss',
  host: {
    class: 'app-shell-header-host',
  },
})
export class AppShellHeader {
  public readonly showAnalysisFilters = input(false);
  public readonly isAnalysisFiltersOpen = input(false);
  public readonly analysisFiltersToggle = output<void>();
}
