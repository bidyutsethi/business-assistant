// Shared pg-mem bootstrap for integration tests. Sets up an in-memory
// Postgres-compatible engine, polyfills the date functions the app relies
// on (pg-mem's native function set is small), and redirects every
// `require('pg')` in the app to it. Call this once, before requiring
// ../server, from each test entry file.

const { newDb } = require("pg-mem");

function truncMonth(d) {
  const date = new Date(d);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

// Postgres truncates 'week' to the Monday of that ISO week.
function truncWeek(d) {
  const date = new Date(d);
  const day = date.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + diffToMonday));
}

function truncDay(d) {
  const date = new Date(d);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function setupTestDb() {
  const memDb = newDb({ autoCreateForeignKeyIndices: true });

  for (const argType of ["timestamp", "timestamptz"]) {
    memDb.public.registerFunction({
      name: "date_trunc",
      args: ["text", argType],
      returns: argType,
      implementation: (unit, val) => {
        if (unit === "month") return truncMonth(val);
        if (unit === "week") return truncWeek(val);
        if (unit === "day") return truncDay(val);
        return new Date(val);
      },
    });
    memDb.public.registerFunction({
      name: "to_char",
      args: [argType, "text"],
      returns: "text",
      implementation: (val, fmt) =>
        fmt === "Mon"
          ? new Date(val).toLocaleString("en-US", { month: "short", timeZone: "UTC" })
          : new Date(val).toISOString(),
    });
  }

  const pgAdapter = memDb.adapters.createPg();
  const pgPath = require.resolve("pg");
  require.cache[pgPath] = { id: pgPath, filename: pgPath, loaded: true, exports: pgAdapter };

  return { memDb, pgAdapter };
}

module.exports = { setupTestDb };
