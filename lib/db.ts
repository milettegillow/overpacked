import { neon, types } from "@neondatabase/serverless";

// Return Postgres `date` columns (OID 1082) as plain "YYYY-MM-DD" strings. The
// default parser makes a local-time Date, which shifts the day during BST.
// Set on the shared registry: neon()'s own `types` option is ignored by
// tagged-template queries in this driver version.
types.setTypeParser(1082, (value: string) => value);

export const sql = neon(process.env.DATABASE_URL!);
