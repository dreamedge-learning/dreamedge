/**
 * Walks a PostgREST query to the end of its result set.
 *
 * A single request cannot be trusted to return everything. PostgREST clamps
 * any response at the project's `db.max_rows` (1000 on a default Supabase
 * project), so the old student export — one request with `.range(0, 9999)` —
 * handed the admin the first thousand students and said nothing about the
 * rest. An export that is quietly incomplete is worse than one that fails,
 * because nobody goes looking for the missing rows.
 *
 * So: ask for a window, compare what came back against the exact count, and
 * keep going until the two agree. If they cannot be made to agree, throw —
 * the route turns that into a visible failure rather than a short file.
 */

interface RangedResult<T> {
  data: T[] | null;
  count: number | null;
  error: { message: string } | null;
}

/** Matches the default `db.max_rows`; a lower project setting is detected below. */
const REQUESTED_WINDOW = 1000;

/** 250 windows of 1000 rows. Past that an export is the wrong tool anyway. */
const MAX_WINDOWS = 250;

export async function fetchAllRows<T>(
  label: string,
  query: (from: number, to: number) => PromiseLike<RangedResult<T>>
): Promise<T[]> {
  const rows: T[] = [];
  let total: number | null = null;
  let window = REQUESTED_WINDOW;

  for (let attempt = 0; attempt < MAX_WINDOWS; attempt++) {
    const { data, count, error } = await query(rows.length, rows.length + window - 1);

    if (error) {
      throw new Error(`Could not read every ${label} row: ${error.message}`);
    }

    if (total === null && count !== null) total = count;

    const received = data?.length ?? 0;
    if (received > 0) rows.push(...(data as T[]));

    if (total !== null && rows.length >= total) return rows;
    if (received === 0) break;

    // A window that comes back short of what we asked for, while the exact
    // count says there is more, is the server's row cap rather than the end
    // of the table. Keep walking in the size it actually honoured.
    if (received < window) window = received;
  }

  if (total !== null && rows.length < total) {
    throw new Error(
      `Could not read every ${label} row: got ${rows.length} of ${total}. ` +
        "Narrow the filters and export again."
    );
  }

  return rows;
}
