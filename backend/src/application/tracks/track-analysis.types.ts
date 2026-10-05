import type { TrackAudioStats } from "@domain/tracks/types.js";

/** Statystyki rozszerzone o kompletność danych źródłowych. */
type TrackAudioStatsSummary = TrackAudioStats & {
  totalTracksCount: number;
  foundTracksCount: number;
};

export type { TrackAudioStatsSummary };
