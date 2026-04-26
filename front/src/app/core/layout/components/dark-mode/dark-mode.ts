import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-dark-mode',
  imports: [],
  templateUrl: './dark-mode.html',
  styleUrl: './dark-mode.scss',
})
export class DarkMode {
  readonly isDarkMode = signal(false);

  constructor() {
    if (localStorage.getItem('darkMode') === null) {
      localStorage.setItem('darkMode', 'false');
    }

    const initialValue = localStorage.getItem('darkMode') === 'true';

    this.isDarkMode.set(initialValue);
    document.documentElement.classList.toggle('dark-mode', initialValue);
  }

  public toggleDarkMode(): void {
    this.isDarkMode.update((isDark) => {
      const newValue = !isDark;

      localStorage.setItem('darkMode', newValue.toString());
      document.documentElement.classList.toggle('dark-mode', newValue);

      return newValue;
    });
  }
}
