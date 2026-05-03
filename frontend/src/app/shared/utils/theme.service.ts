import { effect, Injectable, signal } from '@angular/core';

/**
 * Type representing the possible theme identifiers.
 * - 'light': Light theme.
 * - 'dark': Dark theme.
 */
export type TThemeId = 'light' | 'dark';

/**
 * Interface representing a theme object.
 * @property id - The unique identifier for the theme.
 * @property name - The display name of the theme.
 * @property className - The CSS class name associated with the theme.
 */
export type ITheme = {
  id: TThemeId;
  name: string;
  className: string;
};

@Injectable({
  providedIn: 'root'
})
/**
 * Service for managing application themes.
 * Provides functionality to set, retrieve, and persist themes.
 */
export class ThemeService {
  /**
   * Static array of available themes.
   * Contains predefined themes with their identifiers, names, and CSS class names.
   */
  static readonly themes: ITheme[] = [
    {
      id: 'light',
      name: 'Light Theme',
      className: 'theme-light',
    },
    {
      id: 'dark',
      name: 'Dark Theme',
      className: 'theme-dark',
    }
  ];

  /**
   * Key used for storing the selected theme in localStorage.
   */
  readonly localStorageKey = 'app-theme';

  /**
   * Signal representing the currently selected theme.
   * Provides a readonly view of the theme state.
   */
  private _currentTheme = signal<ITheme | null>(null);

  /**
   * Readonly signal for accessing the current theme.
   */
  readonly currentTheme = this._currentTheme.asReadonly();

  /**
   * Getter for the default theme.
   * @returns The default theme object.
   */
  get defaultTheme(): ITheme {
    return this._getDefaultTheme();
  }

  /**
   * Sets the current theme.
   * @param theme - The theme to be applied.
   */
  setTheme(theme: ITheme): void {
    this._currentTheme.set(theme);
  }

  /**
   * Effect that synchronizes the current theme with localStorage and updates the document's class list.
   * Automatically triggered when the `currentTheme` signal changes.
   */
  private readonly _currentThemeEffect = effect(() => {
    const theme = this._currentTheme();
    if (!theme) {
      return;
    }
    localStorage.setItem(this.localStorageKey, theme.id);
    document.documentElement.classList.remove(
      ...ThemeService.themes.reduce((acc, item) => {
        if (theme.id !== item.id && !!item.className) {
          acc.push(item.className);
        }

        return acc;
      }, [] as string[])
    );

    if (!!theme?.className) {
      document.documentElement.classList.add(theme.className);
    }
  });

  /**
   * Retrieves the default theme based on the value stored in localStorage.
   * Falls back to the 'System Default' theme if no valid theme is found.
   * @returns The default theme object.
   */
  private _getDefaultTheme(): ITheme {
    const themeId = (localStorage.getItem(this.localStorageKey) as TThemeId) ?? 'dark';
    return ThemeService.themes.find(theme => theme.id === themeId) || ThemeService.themes[0];
  }
}