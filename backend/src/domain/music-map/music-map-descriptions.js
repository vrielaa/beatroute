export function describeClusterName(features) {
  if (features.energy >= 0.65 && features.danceability >= 0.6) {
    return "Energetyczne i taneczne";
  }

  if (features.energy <= 0.45 && features.acousticness >= 0.45) {
    return "Spokojne i akustyczne";
  }

  if (features.valence <= 0.35) {
    return "Melancholijne";
  }

  if (features.speechiness >= 0.33) {
    return "Mówione i rapowe";
  }

  if (features.instrumentalness >= 0.45) {
    return "Instrumentalne";
  }

  if (features.tempo >= 130) {
    return "Szybsze i rytmiczne";
  }

  return "Umiarkowane cechy audio";
}

export function describeAudioCharacter(features) {
  const labels = [];

  if (features.energy >= 0.7 && features.tempo >= 120) {
    labels.push("dynamiczny i pobudzający");
  } else if (features.energy <= 0.4 && features.tempo <= 100) {
    labels.push("spokojny i wyciszony");
  }

  if (features.danceability >= 0.65 && features.energy >= 0.55) {
    labels.push("rytmiczny i taneczny");
  }

  if (features.valence >= 0.6 && features.energy >= 0.55) {
    labels.push("pogodny i energetyczny");
  } else if (features.valence >= 0.6) {
    labels.push("jasny i pozytywny");
  } else if (features.valence <= 0.35 && features.energy >= 0.6) {
    labels.push("intensywny, ale melancholijny");
  } else if (features.valence <= 0.35) {
    labels.push("melancholijny i ciemniejszy w nastroju");
  }

  if (features.acousticness >= 0.5 && features.energy <= 0.55) {
    labels.push("kameralny i organiczny");
  } else if (features.acousticness >= 0.5) {
    labels.push("bardziej akustyczny");
  }

  if (features.speechiness >= 0.66) {
    labels.push("oparty głównie na mowie");
  } else if (features.speechiness >= 0.33) {
    labels.push("z wyraźną partią mówioną lub rapową");
  }

  if (features.instrumentalness >= 0.5) {
    labels.push("z wyraźnymi elementami instrumentalnymi");
  }

  if (features.liveness >= 0.6) {
    labels.push("brzmiący jak nagranie live");
  }

  if (features.loudness >= -6 && features.energy >= 0.6) {
    labels.push("mocno wyeksponowany brzmieniowo");
  } else if (features.loudness <= -12 && features.energy <= 0.5) {
    labels.push("delikatnie zmiksowany");
  }

  if (features.tempo >= 140) {
    labels.push("szybkie tempo");
  } else if (features.tempo <= 90) {
    labels.push("wolniejsze tempo");
  }

  return labels.length
    ? labels.join(", ")
    : "bez jednej dominującej cechy: energia, taneczność, nastrój, akustyczność, mowa, instrumentalność i tempo są bliżej wartości pośrednich";
}
