import { createTrackAnalysisService } from "@application/tracks/track-analysis.service.js";
import { reccoBeatsService } from "@integrations/reccobeats/reccobeats.service.js";

/** Przypadki użycia utworów skonfigurowane z produkcyjnymi adapterami. */
const trackAnalysisService = createTrackAnalysisService({
  audioFeaturesReader: reccoBeatsService,
});

export { trackAnalysisService };
