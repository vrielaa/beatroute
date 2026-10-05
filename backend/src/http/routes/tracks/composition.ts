import { createTrackAnalysisService } from "@application/tracks/track-analysis.service.js";
import { calculateAudioStats } from "@domain/tracks/audio-statistics.js";
import { reccoBeatsService } from "@integrations/reccobeats/reccobeats.service.js";

/** Przypadki użycia utworów skonfigurowane z produkcyjnymi adapterami. */
const trackAnalysisService = createTrackAnalysisService({
  audioFeaturesReader: reccoBeatsService,
  calculateStats: calculateAudioStats,
});

export { trackAnalysisService };
