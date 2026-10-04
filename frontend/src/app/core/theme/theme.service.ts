import { effect, Injectable, signal } from '@angular/core';

type ThemeId = 'light' | 'dark';

type Theme = {
  id: ThemeId;
  name: string;
  className: string;
};

@Injectable({ providedIn: 'root' })
class ThemeService {
  static readonly themes: readonly Theme[] = [
    { id: 'light', name: 'Light Theme', className: 'theme-light' },
    { id: 'dark', name: 'Dark Theme', className: 'theme-dark' },
  ];

  private readonly localStorageKey = 'app-theme';
  private readonly currentThemeState = signal<Theme | null>(null);

  public readonly currentTheme = this.currentThemeState.asReadonly();

  /** Zwraca zapisaną preferencję użytkownika albo domyślny ciemny motyw. */
  public get defaultTheme(): Theme {
    const storedThemeId = localStorage.getItem(this.localStorageKey);

    return (
      ThemeService.themes.find((theme) => theme.id === storedThemeId) ?? ThemeService.themes[1]
    );
  }

  /** Ustawia motyw używany przez aplikację. */
  public setTheme(theme: Theme): void {
    this.currentThemeState.set(theme);
  }

  /** Zapisuje wybór i utrzymuje na dokumencie wyłącznie aktywną klasę motywu. */
  private readonly synchronizeTheme = effect(() => {
    const theme = this.currentThemeState();

    if (!theme) {
      return;
    }

    localStorage.setItem(this.localStorageKey, theme.id);
    document.documentElement.classList.remove(
      ...ThemeService.themes.map((availableTheme) => availableTheme.className)
    );
    document.documentElement.classList.add(theme.className);
  });
}

export { ThemeService };
export type { ThemeId, Theme };
