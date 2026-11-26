import { it } from "node:test";
import assert from "node:assert/strict";
import {
  createSnapshotLoader,
  addCreatedClass,
} from "../src/lib/client-snapshot";

function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
it("an earlier background response cannot erase a class after a successful save", async () => {
  const older = pending<{ classes: { id: string }[] }>(),
    fresh = pending<{ classes: { id: string }[] }>();
  let calls = 0,
    state = { classes: [] as { id: string }[] };
  const loader = createSnapshotLoader(
    () => (++calls === 1 ? older.promise : fresh.promise),
    (next) => {
      state = next;
    },
  );
  const background = loader.refresh();
  loader.invalidate();
  state = addCreatedClass(state, { id: "saved-class" });
  const foreground = loader.refresh();
  fresh.resolve({ classes: [{ id: "saved-class" }] });
  await foreground;
  older.resolve({ classes: [] });
  await background;
  assert.deepEqual(state.classes, [{ id: "saved-class" }]);
});
it("the newest refresh wins even when responses finish in reverse order", async () => {
  const a = pending<number>(),
    b = pending<number>();
  let calls = 0,
    visible = 0;
  const loader = createSnapshotLoader(
    () => (++calls === 1 ? a.promise : b.promise),
    (v) => {
      visible = v;
    },
  );
  const first = loader.refresh(),
    second = loader.refresh();
  b.resolve(2);
  await second;
  a.resolve(1);
  await first;
  assert.equal(visible, 2);
});
it("refresh failures remain visible to callers and do not remove a confirmed saved class", async () => {
  let state = { classes: [{ id: "saved-class" }] };
  const loader = createSnapshotLoader(
    async () => {
      throw new Error("Request failed");
    },
    (next) => {
      state = next;
    },
  );
  await assert.rejects(loader.refresh(), /Request failed/);
  assert.deepEqual(state.classes, [{ id: "saved-class" }]);
});
it("adding the server-confirmed class updates it without duplicating the list entry", () => {
  const next = addCreatedClass(
    { classes: [{ id: "old" }, { id: "new", name: "stale" }], students: [] },
    { id: "new", name: "Saved class" },
  );
  assert.deepEqual(next.classes, [
    { id: "new", name: "Saved class" },
    { id: "old" },
  ]);
  assert.deepEqual(next.students, []);
});
