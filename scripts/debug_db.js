const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'daka.db');
const db = new Database(dbPath);

const rows = db.prepare("SELECT DISTINCT uid, user FROM daka_records ORDER BY id DESC LIMIT 20").all();

console.log('Recent 10 records:');
console.table(rows);
