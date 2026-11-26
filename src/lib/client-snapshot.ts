export type SnapshotLoader<T> = {
  refresh: () => Promise<T | undefined>;
  invalidate: () => void;
};

// A response started before a mutation or a newer refresh must not replace newer state.
export function createSnapshotLoader<T>(
  load: () => Promise<T>,
  accept: (value: T) => void,
): SnapshotLoader<T> {
  let version = 0;
  return {
    invalidate() {
      version++;
    },
    async refresh() {
      const request = ++version;
      const value = await load();
      if (request !== version) return;
      accept(value);
      return value;
    },
  };
}

export function addCreatedClass<T extends { classes: Record<string, any>[] }>(
  data: T,
  created: Record<string, any>,
): T {
  return {
    ...data,
    classes: [created, ...data.classes.filter((c) => c.id !== created.id)],
  };
}
