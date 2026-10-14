/** Update value meaning "remove this key"; serialized as the legacy `-=key: null` form before reaching the server. */
export class ForcedDeletion {}

/** Update value meaning "replace this object instead of merging"; the wrapped value is sent as-is. */
export class ForcedReplacement {
  readonly value: unknown;

  constructor(value: unknown) {
    this.value = value;
  }
}

const MAXIMUM_DEPTH = 32;

/** Rewrites operator instances inside an update object (keys may be dotted or nested). */
export function serializeUpdateOperators(changes: Record<string, unknown>, depth = 0): Record<string, unknown> {
  if (depth > MAXIMUM_DEPTH) return changes;
  const serialized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changes)) {
    if (value instanceof ForcedDeletion) {
      const separator = key.lastIndexOf(".");
      serialized[separator === -1 ? `-=${key}` : `${key.slice(0, separator)}.-=${key.slice(separator + 1)}`] = null;
    } else if (value instanceof ForcedReplacement) {
      serialized[key] = value.value;
    } else if (value?.constructor === Object) {
      serialized[key] = serializeUpdateOperators(value as Record<string, unknown>, depth + 1);
    } else {
      serialized[key] = value;
    }
  }
  return serialized;
}
