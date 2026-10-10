import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaylistGenerator } from './playlist-generator';
import type { PlaylistDataset } from './playlist-generator.models';

describe('PlaylistGenerator file import', () => {
  let fixture: ComponentFixture<PlaylistGenerator>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlaylistGenerator],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(PlaylistGenerator);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('shows a JSON file input with format guidance before importing', () => {
    const input = getInput();

    expect(input.accept).toBe('.json,application/json');
    expect(input.multiple).toBe(false);
    expect(input.disabled).toBe(false);
    expect(getText()).toContain('1–500 utworami');
    expect(getStatus()).toBeNull();
    expect(getError()).toBeNull();
    expect(fixture.nativeElement.querySelector('app-playlist-criteria-form')).toBeNull();
  });

  it('shows the imported file name and track count without making HTTP requests', async () => {
    const { file, read } = createFile('playlist.json', JSON.stringify(createDataset()));
    const resetInput = vi.spyOn(getInput(), 'value', 'set');

    selectFile(file);
    await updateView();

    expect(read).toHaveBeenCalledOnce();
    expect(getStatus()?.textContent).toContain('playlist.json');
    expect(getText()).toContain('Liczba utworów: 2');
    expect(getError()).toBeNull();
    expect(getInput().disabled).toBe(false);
    expect(resetInput).toHaveBeenCalledWith('');
    expect(fixture.nativeElement.querySelector('app-playlist-criteria-form')).not.toBeNull();
    http.expectNone(() => true);
  });

  it('preserves the loaded dataset when file selection is cancelled', async () => {
    const { file } = createFile('playlist.json', JSON.stringify(createDataset()));
    selectFile(file);
    await updateView();
    const previousStatus = getStatus()?.textContent;

    selectFile(null);
    await updateView();

    expect(getStatus()?.textContent).toBe(previousStatus);
    expect(getInput().disabled).toBe(false);
  });

  it('preserves the existing error when file selection is cancelled', async () => {
    const { file } = createFile('broken.json', '{');
    selectFile(file);
    await updateView();

    selectFile(null);
    await updateView();

    expect(getError()?.textContent).toBe('Plik nie zawiera poprawnego JSON-a');
  });

  it('shows a syntax error and removes the previously imported dataset and name', async () => {
    const original = createFile('original.json', JSON.stringify(createDataset()));
    selectFile(original.file);
    await updateView();
    expect(getStatus()).not.toBeNull();
    const resetInput = vi.spyOn(getInput(), 'value', 'set');

    const broken = createFile('broken.json', '{ invalid json');
    selectFile(broken.file);
    await updateView();

    expect(getError()?.textContent).toBe('Plik nie zawiera poprawnego JSON-a');
    expect(getStatus()).toBeNull();
    expect(getText()).not.toContain('original.json');
    expect(fixture.nativeElement.querySelector('app-playlist-criteria-form')).toBeNull();
    expect(getText()).not.toContain('broken.json');
    expect(getInput().disabled).toBe(false);
    expect(resetInput).toHaveBeenCalledWith('');
  });

  it('shows the parser error for a JSON file with an invalid dataset structure', async () => {
    const { file } = createFile('invalid.json', JSON.stringify({ version: 2, tracks: [] }));
    const resetInput = vi.spyOn(getInput(), 'value', 'set');

    selectFile(file);
    await updateView();

    expect(getError()?.textContent).toBe(
      'Nieobsługiwana wersja zbioru: pole version musi mieć wartość 1'
    );
    expect(getStatus()).toBeNull();
    expect(getInput().disabled).toBe(false);
    expect(resetInput).toHaveBeenCalledWith('');
  });

  it('shows a readable message when file reading fails', async () => {
    const { file, read } = createFile('unreadable.json', '');
    read.mockRejectedValue(new Error('Technical read failure'));
    const resetInput = vi.spyOn(getInput(), 'value', 'set');

    selectFile(file);
    await updateView();

    expect(getError()?.textContent).toBe('Nie udało się odczytać pliku');
    expect(getText()).not.toContain('Technical read failure');
    expect(getStatus()).toBeNull();
    expect(getInput().disabled).toBe(false);
    expect(resetInput).toHaveBeenCalledWith('');
  });

  it('clears the previous error after importing a corrected file', async () => {
    const invalid = createFile('playlist.json', '{');
    selectFile(invalid.file);
    await updateView();
    expect(getError()).not.toBeNull();

    const corrected = createFile('playlist.json', JSON.stringify(createDataset()));
    selectFile(corrected.file);
    await updateView();

    expect(getError()).toBeNull();
    expect(getStatus()?.textContent).toContain('playlist.json');
  });

  it('disables the input and shows loading only while the file is being read', async () => {
    const original = createFile('original.json', JSON.stringify(createDataset()));
    selectFile(original.file);
    await updateView();
    const pendingText = createPendingRead();
    const { file, read } = createFile('replacement.json', '');
    read.mockReturnValue(pendingText.promise);

    selectFile(file);
    await updateView();

    expect(getInput().disabled).toBe(true);
    expect(getStatus()?.textContent).toBe('Wczytywanie pliku…');
    expect(getText()).not.toContain('original.json');
    expect(getError()).toBeNull();

    pendingText.resolve(JSON.stringify(createDataset()));
    await updateView();

    expect(getInput().disabled).toBe(false);
    expect(getStatus()?.textContent).toContain('replacement.json');
    expect(getText()).not.toContain('Wczytywanie pliku…');
  });

  it('ignores a second import while the first read is pending', async () => {
    const pendingText = createPendingRead();
    const first = createFile('first.json', '');
    first.read.mockReturnValue(pendingText.promise);
    selectFile(first.file);
    await updateView();

    const second = createFile('second.json', JSON.stringify(createDataset()));
    selectFile(second.file);
    await updateView();

    expect(second.read).not.toHaveBeenCalled();
    expect(getStatus()?.textContent).toBe('Wczytywanie pliku…');

    pendingText.resolve(JSON.stringify(createDataset()));
    await updateView();

    expect(getStatus()?.textContent).toContain('first.json');
    expect(getText()).not.toContain('second.json');
    expect(getInput().disabled).toBe(false);
  });

  it('allows the same file to be selected again after completion', async () => {
    const { file, read } = createFile('playlist.json', JSON.stringify(createDataset()));
    const resetInput = vi.spyOn(getInput(), 'value', 'set');

    selectFile(file);
    await updateView();
    selectFile(file);
    await updateView();

    expect(read).toHaveBeenCalledTimes(2);
    expect(resetInput).toHaveBeenCalledTimes(2);
    expect(resetInput).toHaveBeenLastCalledWith('');
    expect(getStatus()?.textContent).toContain('playlist.json');
  });

  function getInput(): HTMLInputElement {
    return fixture.nativeElement.querySelector('#playlist-dataset-file');
  }

  function selectFile(file: File | null): void {
    const input = getInput();
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: file ? [file] : [],
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function updateView(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function getText(): string {
    return fixture.nativeElement.textContent.replace(/\s+/g, ' ').trim();
  }

  function getStatus(): HTMLElement | null {
    return fixture.nativeElement.querySelector('[role="status"]');
  }

  function getError(): HTMLElement | null {
    return fixture.nativeElement.querySelector('[role="alert"]');
  }
});

function createFile(name: string, text: string) {
  const file = new File([text], name, { type: 'application/json' });
  const read = vi.fn<() => Promise<string>>().mockResolvedValue(text);
  Object.defineProperty(file, 'text', { value: read });

  return { file, read };
}

function createPendingRead() {
  let resolve!: (text: string) => void;
  const promise = new Promise<string>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function createDataset(): PlaylistDataset {
  const track = {
    id: 'track-1',
    name: 'Track 1',
    artists: ['Artist A'],
    audioFeatures: {
      tempo: 128,
      energy: 0.8,
      danceability: 0.7,
      valence: 0.6,
      acousticness: null,
      instrumentalness: 0,
      speechiness: 0.1,
      liveness: null,
    },
  };

  return {
    version: 1,
    tracks: [track, { ...track, id: 'track-2', name: 'Track 2' }],
  };
}
