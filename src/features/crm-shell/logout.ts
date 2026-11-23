/**
 * «Выйти» signs out only once every working CRM frame confirms its pending
 * edits; a failed or timed-out save keeps the session so nothing is lost.
 */
export async function allFramesSaved<T>(frames: readonly T[], save: (frame: T) => Promise<boolean>): Promise<boolean> {
  for (const frame of frames) if (!(await save(frame))) return false;
  return true;
}

/** The session ends only when the server answers the sign-out with success. */
export async function signedOut(post: () => Promise<{ ok: boolean }>): Promise<boolean> {
  try {
    return (await post()).ok;
  } catch {
    return false;
  }
}
