import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { ThemeService } from '@core/theme/theme.service';

@Component({
  selector: 'app-dark-mode',
  imports: [],
  templateUrl: './dark-mode.html',
  styleUrl: './dark-mode.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: {
    class: 'theme-toggle-host',
  },
})
class DarkMode {
  readonly themeService = inject(ThemeService);
  readonly themes = ThemeService.themes;

  public isDarkMode(): boolean {
    return this.themeService.currentTheme()?.id === 'dark';
  }

  public toggleDarkMode(): void {
    const nextTheme = this.isDarkMode() ? ThemeService.themes[0] : ThemeService.themes[1];

    this.themeService.setTheme(nextTheme);
  }
}

export { DarkMode };
