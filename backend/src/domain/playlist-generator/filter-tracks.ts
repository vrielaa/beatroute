import type {
  PlaylistRequirements,
  PlaylistTrack,
  PlaylistTrackRejectionReason,
  PlaylistTrackSelection,
  RejectedPlaylistTrack,
} from "@domain/playlist-generator/types.js";

/**
 * Zbiera wszystkie przyczyny niespełnienia aktywnych wymagań przez jeden utwór.
 * Wyłączone warunki pomija, a brak pomiaru rozróżnia od niespełnienia ograniczenia.
 * Pusta lista oznacza, że utwór spełnia wymagania.
 */
function getTrackRejectionReasons(
  track: PlaylistTrack,
  requirements: PlaylistRequirements
): PlaylistTrackRejectionReason[] {
  const reasons: PlaylistTrackRejectionReason[] = [];

  if (requirements.tempoRange !== null) {
    const tempo = track.audioFeatures.tempo;
    if (tempo === null) {
      reasons.push({ feature: "tempo", code: "missing-measurement" });
    } else if (
      tempo < requirements.tempoRange.min ||
      tempo > requirements.tempoRange.max
    ) {
      reasons.push({ feature: "tempo", code: "outside-range" });
    }
  }

  if (requirements.targetBpm !== null) {
    const tempo = track.audioFeatures.tempo;

    if (tempo === null) {
      reasons.push({ feature: "tempo", code: "missing-measurement" });
    } else if (Math.round(tempo) !== requirements.targetBpm) {
      reasons.push({ feature: "tempo", code: "tempo-mismatch" });
    }
  }

  if (requirements.maxSpeechiness !== null) {
    const speechiness = track.audioFeatures.speechiness;
    if (speechiness === null) {
      reasons.push({ feature: "speechiness", code: "missing-measurement" });
    } else if (speechiness > requirements.maxSpeechiness) {
      reasons.push({ feature: "speechiness", code: "above-maximum" });
    }
  }

  if (requirements.maxLiveness !== null) {
    const liveness = track.audioFeatures.liveness;
    if (liveness === null) {
      reasons.push({ feature: "liveness", code: "missing-measurement" });
    } else if (liveness > requirements.maxLiveness) {
      reasons.push({ feature: "liveness", code: "above-maximum" });
    }
  }

  return reasons;
}

/**
 * Dzieli wcześniej zwalidowane utwory na dopuszczone i odrzucone.
 * Każdy utwór musi spełnić wszystkie aktywne wymagania. Granice zakresu są włączone,
 * null w wymaganiach wyłącza warunek, a zero pozostaje aktywnym maksimum.
 * Konkretne BPM porównuje po Math.round: ułamki poniżej 0,5 w dół, od 0,5 w górę.
 * Oryginalnych pomiarów nie zaokrągla ani nie zmienia. Zakres działa na surowym pomiarze.
 * Nie zmienia danych wejściowych, zachowuje kolejność w obu grupach i nie
 * wykonuje rankingu ani wywołań API. Zwracane utwory są referencjami wejściowymi.
 *
 * @param tracks - Utwory z metadanymi i pomiarami, po walidacji zbioru.
 * @param requirements - Sprawdzone obowiązkowe warunki dopuszczenia utworu.
 * @returns Podział utworów wraz ze wszystkimi powodami odrzucenia.
 */
function filterPlaylistTracks(
  tracks: PlaylistTrack[],
  requirements: PlaylistRequirements
): PlaylistTrackSelection {
  const acceptedTracks: PlaylistTrack[] = [];
  const rejectedTracks: RejectedPlaylistTrack[] = [];

  tracks.forEach((track) => {
    const rejectionReasons = getTrackRejectionReasons(track, requirements);
    if (rejectionReasons.length === 0) {
      acceptedTracks.push(track);
    } else {
      rejectedTracks.push({ track, reasons: rejectionReasons });
    }
  });

  return { acceptedTracks, rejectedTracks };
}

export { filterPlaylistTracks };
