import { it } from "node:test";
import assert from "node:assert/strict";
import { recentAttendanceFirst } from "../src/lib/attendance-view";
it("shows today and recent history first, then upcoming dates nearest first", () => {
  const input = [
    { id: "far", date: "2026-12-26", start_time: "10:00" },
    { id: "old", date: "2026-10-01", start_time: "10:00" },
    { id: "today-early", date: "2026-11-26", start_time: "10:00" },
    { id: "tomorrow", date: "2026-11-27", start_time: "10:00" },
    { id: "yesterday", date: "2026-11-25", start_time: "10:00" },
    { id: "today-late", date: "2026-11-26", start_time: "18:00" },
  ];
  assert.deepEqual(
    recentAttendanceFirst(input, "2026-11-26").map((s) => s.id),
    ["today-late", "today-early", "yesterday", "old", "tomorrow", "far"],
  );
  assert.equal(input[0].id, "far");
});
