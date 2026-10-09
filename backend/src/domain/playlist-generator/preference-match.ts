import type { PlaylistPreferenceLevel } from "@domain/playlist-generator/types.js";

/**
 * Oblicza stopień dopasowania pomiaru do preferowanego poziomu cechy.
 * Wykorzystuje funkcję trójkątną dla medium oraz funkcje z plateau
 * dla low i high. Progi wynoszą 0.25, 0.5 i 0.75.
 *
 * @param measurement - Zwalidowany pomiar cechy audio z zakresu 0–1.
 * @param level - Preferowany poziom cechy.
 * @returns Dopasowanie z zakresu 0–1; większa wartość oznacza lepsze dopasowanie.
 */
function calculatePreferenceMatch(
  measurement: number,
  level: PlaylistPreferenceLevel
): number {
  switch (level) {
    case "low":
      if (measurement <= 0.25) return 1;
      if (measurement >= 0.5) return 0;
      return (0.5 - measurement) / 0.25;
    case "medium":
      if (measurement <= 0.25 || measurement >= 0.75) return 0;
      if (measurement === 0.5) return 1;
      if (measurement < 0.5) return (measurement - 0.25) / 0.25;
      return (0.75 - measurement) / 0.25;
    case "high":
      if (measurement >= 0.75) return 1;
      if (measurement <= 0.5) return 0;
      return (measurement - 0.5) / 0.25;
  }
}

export { calculatePreferenceMatch };
