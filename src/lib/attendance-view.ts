export function recentAttendanceFirst<
  T extends { id: string; date: string; start_time: string },
>(sessions: T[], today: string): T[] {
  return [...sessions].sort((a, b) => {
    const futureA = a.date > today,
      futureB = b.date > today;
    if (futureA !== futureB) return futureA ? 1 : -1;
    const direction = futureA ? 1 : -1;
    return (
      direction *
        (a.date.localeCompare(b.date) ||
          a.start_time.localeCompare(b.start_time)) || a.id.localeCompare(b.id)
    );
  });
}
