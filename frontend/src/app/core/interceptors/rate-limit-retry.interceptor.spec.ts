import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rateLimitRetryInterceptor } from './rate-limit-retry.interceptor';

describe('rateLimitRetryInterceptor', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  const endpoint = '/api/me/profile';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([rateLimitRetryInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    try {
      http.verify();
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
      TestBed.resetTestingModule();
    }
  });

  it('passes a successful response through unchanged', () => {
    const next = vi.fn();
    const response = { id: 'user-id' };

    client.get(endpoint).subscribe(next);
    http.expectOne(endpoint).flush(response);

    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith(response);
  });

  it('waits for Retry-After seconds before retrying a GET', async () => {
    vi.useFakeTimers();
    const next = vi.fn();
    client.get(endpoint).subscribe(next);
    http.expectOne(endpoint).flush(
      {},
      {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': '7' },
      }
    );

    await vi.advanceTimersByTimeAsync(6_999);
    http.expectNone(endpoint);
    await vi.advanceTimersByTimeAsync(1);
    http.expectOne(endpoint).flush({ id: 'user-id' });

    expect(next).toHaveBeenCalledWith({ id: 'user-id' });
  });

  it('passes a long cooldown to the subscriber without retrying early', async () => {
    vi.useFakeTimers();
    const error = vi.fn();
    client.get(endpoint).subscribe({ error });
    http.expectOne(endpoint).flush(
      { error: { code: 'SPOTIFY_API_ERROR' } },
      {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': '62976' },
      }
    );

    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith(expect.any(HttpErrorResponse));
    expect(error.mock.calls[0][0].headers.get('Retry-After')).toBe('62976');
    await vi.advanceTimersByTimeAsync(60_000);
    http.expectNone(endpoint);
  });

  it('respects Retry-After expressed as an HTTP date', async () => {
    vi.useFakeTimers();
    const currentTimeMs = Date.parse('2026-10-14T10:00:00.000Z');
    vi.setSystemTime(currentTimeMs);
    const retryDate = new Date(currentTimeMs + 10_000).toUTCString();
    const next = vi.fn();
    client.get(endpoint).subscribe(next);
    http.expectOne(endpoint).flush(
      {},
      {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': retryDate },
      }
    );

    await vi.advanceTimersByTimeAsync(9_999);
    http.expectNone(endpoint);
    await vi.advanceTimersByTimeAsync(1);
    http.expectOne(endpoint).flush({ id: 'user-id' });

    expect(next).toHaveBeenCalledOnce();
  });

  it('does not retry a cooldown date exceeding the maximum delay', async () => {
    vi.useFakeTimers();
    const currentTimeMs = Date.parse('2026-10-14T10:00:00.000Z');
    vi.setSystemTime(currentTimeMs);
    const error = vi.fn();
    client.get(endpoint).subscribe({ error });
    http.expectOne(endpoint).flush(
      {},
      {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': new Date(currentTimeMs + 60_000).toUTCString() },
      }
    );

    expect(error).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(60_000);
    http.expectNone(endpoint);
  });

  it('allows a retry exactly at the maximum delay', async () => {
    vi.useFakeTimers();
    client.get(endpoint).subscribe();
    http.expectOne(endpoint).flush(
      {},
      {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': '30' },
      }
    );

    await vi.advanceTimersByTimeAsync(29_999);
    http.expectNone(endpoint);
    await vi.advanceTimersByTimeAsync(1);
    http.expectOne(endpoint).flush({ id: 'user-id' });
  });

  it('respects a zero-second Retry-After', async () => {
    vi.useFakeTimers();
    client.get(endpoint).subscribe();
    http.expectOne(endpoint).flush(
      {},
      {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': '0' },
      }
    );

    await vi.advanceTimersByTimeAsync(0);
    http.expectOne(endpoint).flush({ id: 'user-id' });
  });

  it.each([null, '', 'invalid', '-1', '1.5'])(
    'uses backoff for a missing or invalid Retry-After: %s',
    async (retryAfter) => {
      vi.useFakeTimers();
      client.get(endpoint).subscribe();
      http.expectOne(endpoint).flush(
        {},
        {
          status: 429,
          statusText: 'Too Many Requests',
          headers: retryAfter === null ? undefined : { 'Retry-After': retryAfter },
        }
      );

      await vi.advanceTimersByTimeAsync(1_999);
      http.expectNone(endpoint);
      await vi.advanceTimersByTimeAsync(1);
      http.expectOne(endpoint).flush({ id: 'user-id' });
    }
  );

  it('stops after three retries', async () => {
    vi.useFakeTimers();
    const error = vi.fn();
    client.get(endpoint).subscribe({ error });

    for (let attempt = 0; attempt < 4; attempt += 1) {
      http.expectOne(endpoint).flush(
        {},
        {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'Retry-After': '1' },
        }
      );
      await vi.advanceTimersByTimeAsync(1_000);
    }

    expect(error).toHaveBeenCalledOnce();
    http.expectNone(endpoint);
  });

  it.each([400, 500])('does not retry HTTP %s', async (status) => {
    vi.useFakeTimers();
    const error = vi.fn();
    client.get(endpoint).subscribe({ error });
    http.expectOne(endpoint).flush({}, { status, statusText: 'Request failed' });

    expect(error).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(60_000);
    http.expectNone(endpoint);
  });

  it('does not retry a POST even after a short rate-limit response', async () => {
    vi.useFakeTimers();
    const error = vi.fn();
    client.post('/api/playlist-generator/save', { name: 'Playlist' }).subscribe({ error });
    const request = http.expectOne('/api/playlist-generator/save');
    expect(request.request.method).toBe('POST');
    request.flush(
      {},
      {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': '1' },
      }
    );

    expect(error).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(60_000);
    http.expectNone('/api/playlist-generator/save');
  });

  it('cancels a pending retry when the subscriber unsubscribes', async () => {
    vi.useFakeTimers();
    const error = vi.fn();
    const subscription = client.get(endpoint).subscribe({ error });
    http.expectOne(endpoint).flush(
      {},
      {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': '7' },
      }
    );

    subscription.unsubscribe();
    await vi.advanceTimersByTimeAsync(7_000);

    http.expectNone(endpoint);
    expect(error).not.toHaveBeenCalled();
  });
});
