export function validateEnv(requiredEnvVars) {
  for (const [key, value] of Object.entries(requiredEnvVars)) {
    if (!value) {
      throw new Error(`Brakuje zmiennej środowiskowej: ${key}`);
    }
  }
}