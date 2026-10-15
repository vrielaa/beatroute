import { inject, Injectable } from '@angular/core';
import { defer, EMPTY, expand, map, of, type Observable } from 'rxjs';
import type { TimeRange } from '@core/api/spotify/spotify.models';
import { TopTracksApiService } from '@core/api/tracks/top-tracks-api.service';
import type {
  TopTracksBatch,
  TopTracksCollection,
  TopTracksPurpose,
} from '@core/api/tracks/top-tracks.models';

@Injectable({ providedIn: 'root' })
class TopTracksCollector {
  private readonly api = inject(TopTracksApiService);

  /**
   * Dobiera tylko brakującą liczbę utworów z tego samego okresu. Każda
   * subskrypcja posiada własny zbiór; kolejne partie są wykonywane sekwencyjnie.
   * Kończy po osiągnięciu celu albo końcu źródła. Nie ponawia błędów, a odpięcie
   * subskrypcji anuluje żądanie HTTP i zapobiega wysłaniu następnych partii.
   */
  public collect(
    timeRange: TimeRange,
    target: number,
    purpose: TopTracksPurpose
  ): Observable<TopTracksCollection> {
    return defer(() => {
      if (!Number.isInteger(target) || target < 1 || target > 40) {
        throw new Error('Liczba utworów musi być całkowita od 1 do 40');
      }
      const initial: TopTracksCollection = {
        tracks: [],
        audioFeatures: [],
        nextOffset: 0,
        progress: {
          requestedTracks: target,
          foundTracks: 0,
          skippedItems: 0,
          processedItems: 0,
          totalItems: null,
          complete: false,
        },
      };
      return of(initial).pipe(
        expand((collection) => {
          if (collection.progress.complete || collection.nextOffset === null) return EMPTY;
          const remaining = target - collection.tracks.length;
          const sourceRemaining =
            collection.progress.totalItems === null
              ? remaining
              : collection.progress.totalItems - collection.nextOffset;
          const limit = Math.min(remaining, sourceRemaining);
          return this.api
            .getBatch(timeRange, limit, collection.nextOffset, purpose)
            .pipe(map((batch) => mergeTopTracksBatch(collection, batch, limit)));
        }, 1)
      );
    });
  }
}

/** Łączy partię, usuwa powtórzenia i broni pętlę przed brakiem postępu źródła. */
function mergeTopTracksBatch(
  previous: TopTracksCollection,
  batch: TopTracksBatch,
  limit: number
): TopTracksCollection {
  const offset = previous.nextOffset ?? 0;
  if (
    !Number.isSafeInteger(batch.processedItems) ||
    batch.processedItems < 0 ||
    batch.processedItems > limit ||
    !Number.isSafeInteger(batch.totalItems) ||
    batch.totalItems < 0 ||
    batch.skippedItems !== batch.processedItems - batch.tracks.length ||
    batch.tracks.length > batch.processedItems ||
    (batch.nextOffset !== null &&
      (batch.processedItems === 0 ||
        batch.nextOffset !== offset + batch.processedItems ||
        batch.nextOffset >= batch.totalItems))
  ) {
    throw new Error('Niepoprawny postęp partii utworów');
  }
  const tracks = [...previous.tracks];
  const audioFeatures = [...previous.audioFeatures];
  const seenIds = new Set(tracks.map((track) => track.id));
  const featuresById = new Map(
    batch.audioFeatures.map((features) => [features.spotifyId, features])
  );
  for (const track of batch.tracks) {
    const features = featuresById.get(track.id);
    if (!features || 'error' in features) throw new Error('Brak pomiarów przygotowanego utworu');
    if (!seenIds.has(track.id)) {
      seenIds.add(track.id);
      tracks.push(track);
      audioFeatures.push(features);
    }
  }
  const totalItems = Math.min(previous.progress.totalItems ?? batch.totalItems, batch.totalItems);
  const nextOffset =
    batch.nextOffset !== null && batch.nextOffset < totalItems ? batch.nextOffset : null;
  const processedItems = previous.progress.processedItems + batch.processedItems;
  const complete = tracks.length >= previous.progress.requestedTracks || nextOffset === null;
  return {
    tracks,
    audioFeatures,
    nextOffset: complete ? null : nextOffset,
    progress: {
      ...previous.progress,
      foundTracks: tracks.length,
      skippedItems: processedItems - tracks.length,
      processedItems,
      totalItems,
      complete,
    },
  };
}

export { TopTracksCollector };
