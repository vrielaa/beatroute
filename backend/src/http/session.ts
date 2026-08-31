import type { Session } from "express-session";

function saveSession(session: Session): Promise<void> {
  return new Promise((resolve, reject) => {
    session.save((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function destroySession(session: Session): Promise<void> {
  return new Promise((resolve, reject) => {
    session.destroy((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export { saveSession, destroySession };
