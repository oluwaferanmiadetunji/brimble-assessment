import BetterSqlite3 = require('better-sqlite3')
import schema = require('./schema')

const dbPath = process.env.DB_PATH ?? 'database.db'
const db: BetterSqlite3.Database = new BetterSqlite3(dbPath, {})

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
schema.initSchema(db)

export = db
