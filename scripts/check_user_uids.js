const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'daka.db');
const db = new Database(dbPath);

console.log('Checking UIDs for user: 量贩型冻茗乐');

const rows = db.prepare("SELECT uid, COUNT(*) as c FROM daka_records WHERE user = '量贩型冻茗乐' GROUP BY uid").all();
console.table(rows);
