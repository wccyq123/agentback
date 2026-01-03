import { SqlDatabase } from "@langchain/classic/sql_db";
import path from "path";
import { DataSource } from "typeorm";

console.log(path.resolve(process.cwd(), 'apps/agent/chinook.db'));

let db: SqlDatabase | undefined;
async function getDb() {
  if (!db) {
    const databasePath = path.resolve(process.cwd(), 'apps/agent/chinook.db');
    const datasource = new DataSource({ type: "sqlite", database: databasePath });
    db = await SqlDatabase.fromDataSourceParams({ appDataSource: datasource });
    db.run("SELECT * FROM sqlite_master LIMIT 5");
  }
  return db;
}

async function getSchema() {
  const db = await getDb();
  return await db.getTableInfo();
}

console.log(await getSchema());
