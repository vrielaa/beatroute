import { createTrackAnalysisService } from "@application/tracks/track-analysis.service.js";
import { reccoBeatsService } from "@integrations/reccobeats/reccobeats.service.js";
import { calculateAudioStats } from "@integrations/reccobeats/reccobeats.stats.js";

/** Analiza utworów skonfigurowana z produkcyjnymi adapterami aplikacji. */
const trackAnalysisService = createTrackAnalysisService({
  audioFeaturesReader: reccoBeatsService,
  calculateStats: calculateAudioStats,
});

export { trackAnalysisService };
