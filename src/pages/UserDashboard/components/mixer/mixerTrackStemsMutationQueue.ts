/**
 * Serializes read-modify-write stem mutations per track so concurrent handlers
 * (replace on two stems, rename + delete, etc.) cannot clobber each other in ref state.
 */
export function createTrackStemsMutationQueue() {
  const chainByKey: Record<string, Promise<void>> = {};

  return function runSerializedMutation<T>(
    trackKey: string,
    mutation: () => Promise<T>
  ): Promise<T> {
    const previous = chainByKey[trackKey] ?? Promise.resolve();
    const chained = previous.then(mutation, mutation);
    chainByKey[trackKey] = chained.then(
      () => undefined,
      () => undefined
    );
    return chained;
  };
}
