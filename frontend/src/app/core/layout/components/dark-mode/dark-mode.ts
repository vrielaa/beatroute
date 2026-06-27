import { Component, inject } from '@angular/core';
import { ThemeService } from '@src/app/shared/utils/theme.service';

@Component({
  selector: 'app-dark-mode',
  imports: [],
  templateUrl: './dark-mode.html',
  host: {
    class: 'grid items-center justify-items-center text-[var(--color-text-primary)]',
  },
})
export class DarkMode {
  readonly themeService = inject(ThemeService);
  readonly themes = ThemeService.themes;

  public isDarkMode(): boolean {
    return this.themeService.currentTheme()?.id === 'dark';
  }

  public toggleDarkMode(): void {
    const currentTheme = this.themeService.currentTheme();
    const newTheme =
      currentTheme === ThemeService.themes[0] ? ThemeService.themes[1] : ThemeService.themes[0];
    this.themeService.setTheme(newTheme);
  }
}
