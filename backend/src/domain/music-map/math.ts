/**
 * Oblicza średnią arytmetyczną niepustej listy liczb.
 *
 * @param values - Liczby uwzględniane w obliczeniu.
 * @returns Średnia arytmetyczna przekazanych wartości.
 */
function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Skaluje liczbę z jednego zakresu do drugiego.
 * Dla wejścia bez rozpiętości zwraca środek zakresu wynikowego.
 *
 * @param value - Skalowana liczba.
 * @param sourceMin - Dolna granica zakresu wejściowego.
 * @param sourceMax - Górna granica zakresu wejściowego.
 * @param targetMin - Dolna granica zakresu wynikowego.
 * @param targetMax - Górna granica zakresu wynikowego.
 * @returns Liczba przeskalowana do zakresu wynikowego.
 */
function scaleNumberToRange(
  value: number,
  sourceMin: number,
  sourceMax: number,
  targetMin: number,
  targetMax: number
): number {
  if (sourceMax === sourceMin) {
    return (targetMin + targetMax) / 2;
  }

  const positionInSourceRange = (value - sourceMin) / (sourceMax - sourceMin);

  return targetMin + positionInSourceRange * (targetMax - targetMin);
}

/**
 * Zaokrągla liczbę do wskazanej liczby miejsc po przecinku.
 *
 * @param value - Zaokrąglana liczba.
 * @param digits - Liczba zachowywanych miejsc po przecinku.
 * @returns Zaokrąglona liczba.
 */
function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

/** Sprawdza, czy wartość cechy jest skończoną liczbą. */
function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
export { average, scaleNumberToRange, round, isFiniteNumber };
