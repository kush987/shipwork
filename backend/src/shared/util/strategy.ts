/** The first strategy that handles a case; a missing one is a wiring bug, so it throws. */
export function pickStrategy<T>(strategies: readonly T[], handles: (strategy: T) => boolean, what: string): T {
  const found = strategies.find(handles);
  if (!found) throw new Error(`No strategy registered for ${what}`);
  return found;
}
