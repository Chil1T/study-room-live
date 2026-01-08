const Database = require('better-sqlite3');
const path = require('path');

const newDbPath = path.join(process.cwd(), 'daka.db');
const oldDbPath = path.join('c:/Program1/240817BiPDJ/pdj/_old_project_backup/dograin/daka.db');

console.log('--- Database Comparison ---');
console.log('New DB:', newDbPath);
console.log('Old DB:', oldDbPath);

function getStats(dbPath, label) {
    try {
        const db = new Database(dbPath, { readonly: true });
        // Check table name - old might be different? Assuming daka_records
        // Legacy table name often `daka` or `records`?
        // Let's list tables first for old db
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        if (label === 'OLD') console.log('Old DB Tables:', tables.map(t => t.name));

        const tableName = tables.find(t => t.name === 'daka_records') ? 'daka_records' : 'records'; // Guessing

        const total = db.prepare(`SELECT COUNT(*) as c FROM ${tableName}`).get().c;

        // Stats for target user
        // Old DB likely didn't have correct UIDs, maybe stored by name?
        const userStats = db.prepare(`
            SELECT 
                COUNT(*) as count, 
                MIN(date) as first_date, 
                MAX(date) as last_date,
                SUM(duration) as duration
            FROM ${tableName} 
            WHERE user = '量贩型冻茗乐' OR uid = '0'
        `).get();

        console.log(`\n[${label}] (${tableName})`);
        console.log('Total Records:', total);
        console.log('User "量贩型冻茗乐" Stats:', userStats);

    } catch (e) {
        console.error(`Error reading ${label}:`, e.message);
    }
}

getStats(oldDbPath, 'OLD');
getStats(newDbPath, 'NEW');
