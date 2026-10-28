// Applies supabase/migrations/*.sql that the target database has not seen yet, recording each in
// supabase_migrations.schema_migrations (the same table `supabase db push` uses), never the dev seed.
// Talks to the Supabase Management API with SUPABASE_ACCESS_TOKEN, so no database password is needed.
//   node scripts/deploy-migrations.mjs <project-ref>
// For a local check, DATABASE_URL=postgres://... runs the same steps over a direct connection.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dirname, "..", "supabase", "migrations");
const ref = process.argv[2];

async function makeQuery() {
  if (process.env.DATABASE_URL) {
    const { default: pg } = await import("pg");
    const client = new pg.Client(process.env.DATABASE_URL);
    await client.connect();
    return { run: async (sql) => (await client.query(sql)).rows ?? [], close: () => client.end() };
  }
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!ref || !token) throw new Error("usage: SUPABASE_ACCESS_TOKEN=... node scripts/deploy-migrations.mjs <project-ref>");
  return {
    run: async (sql) => {
      const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: sql }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`database/query ${res.status}: ${text}`);
      return text ? JSON.parse(text) : [];
    },
    close: async () => {},
  };
}

const q = await makeQuery();
try {
  await q.run(`create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);`);
  const applied = new Set((await q.run("select version from supabase_migrations.schema_migrations")).map((r) => r.version));
  const files = readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  let count = 0;
  for (const file of files) {
    const [version, ...rest] = file.replace(/\.sql$/, "").split("_");
    if (applied.has(version)) continue;
    const sql = readFileSync(join(dir, file), "utf8");
    const name = rest.join("_");
    // one transaction per file: a failing migration leaves nothing half-applied and is not recorded
    await q.run(`begin;\n${sql}\n;insert into supabase_migrations.schema_migrations (version, name) values ('${version}', '${name.replace(/'/g, "''")}');\ncommit;`);
    console.log(`applied ${file}`);
    count++;
  }
  console.log(count ? `${count} migration(s) applied` : "database is up to date");
} finally {
  await q.close();
}
