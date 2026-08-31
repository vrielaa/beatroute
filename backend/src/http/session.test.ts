import { describe, expect, it, vi } from "vitest";

import { destroySession, regenerateSession, saveSession } from "./session.js";
import type { Session } from "express-session";

describe("session helpers", () => {
  it.each([
    ["save", saveSession],
    ["destroy", destroySession],
    ["regenerate", regenerateSession],
  ] as const)(
    "resolves when session.%s succeeds",
    async (method, operation) => {
      const session = createSession(method);

      await expect(operation(session)).resolves.toBeUndefined();
    }
  );

  it.each([
    ["save", saveSession],
    ["destroy", destroySession],
    ["regenerate", regenerateSession],
  ] as const)("rejects when session.%s fails", async (method, operation) => {
    const expectedError = new Error(`${method} failed`);
    const session = createSession(method, expectedError);

    await expect(operation(session)).rejects.toBe(expectedError);
  });
});

function createSession(
  method: "save" | "destroy" | "regenerate",
  error?: Error
): Session {
  return {
    [method]: vi.fn((callback: (failure?: Error) => void) => callback(error)),
  } as unknown as Session;
}
