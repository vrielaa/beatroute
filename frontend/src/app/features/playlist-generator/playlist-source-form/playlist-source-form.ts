import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { disabled, form, FormField, required, validate } from '@angular/forms/signals';

/** Zbiera ID lub link playlisty i zgłasza samo ID albo null. Nie pobiera danych z API. */
@Component({
  selector: 'app-playlist-source-form',
  imports: [FormField],
  templateUrl: './playlist-source-form.html',
  styleUrl: './playlist-source-form.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
class PlaylistSourceForm {
  public readonly isDisabled = input(false);
  public readonly playlistIdChange = output<string | null>();

  private readonly formValues = signal({ reference: '' });
  private readonly playlistId = computed(() => parseSpotifyPlaylistId(this.formValues().reference));

  protected readonly form = form(this.formValues, (formFields) => {
    required(formFields.reference, { message: 'Podaj ID lub link do playlisty.' });
    disabled(formFields.reference, { when: () => this.isDisabled() });
    validate(formFields.reference, ({ value }) => {
      const reference = value();
      return reference === '' || parseSpotifyPlaylistId(reference) !== null
        ? null
        : {
            kind: 'playlistReference',
            message: 'Podaj poprawne ID lub link do playlisty Spotify.',
          };
    });
  });

  protected readonly isReferenceErrorVisible = computed(() => {
    const field = this.form.reference();
    return !field.disabled() && field.invalid() && (field.dirty() || field.touched());
  });

  constructor() {
    effect(() => this.playlistIdChange.emit(this.playlistId()));
  }
}

/**
 * Wyciąga ID z tekstu lub standardowego linku HTTPS open.spotify.com/playlist/ID.
 * Obsługuje także prefiks językowy intl-pl i parametry udostępniania, bez otwierania URL.
 * Zachowuje wielkość liter; odrzuca obce domeny, inne zasoby, dane logowania i porty.
 *
 * @param reference - Wpisany tekst, przycinany przed odczytem.
 * @returns ID o 22 znakach alfanumerycznych albo null dla pustej lub niepoprawnej wartości.
 */
function parseSpotifyPlaylistId(reference: string): string | null {
  const text = reference.trim();
  if (/^[A-Za-z0-9]{22}$/.test(text)) return text;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'open.spotify.com' ||
    url.port ||
    url.username ||
    url.password
  )
    return null;
  const match = /^\/(?:intl-[a-z]{2}\/)?playlist\/([A-Za-z0-9]{22})\/?$/.exec(url.pathname);
  return match?.[1] ?? null;
}

export { PlaylistSourceForm };
