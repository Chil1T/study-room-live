import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'daka.db');
const db = new Database(dbPath);

// SAFETY GUARD
if (process.env.NODE_ENV !== 'test') {
  console.error('❌ DANGER: Clean data script can only be run in test environment!');
  console.error('   Please run: set NODE_ENV=test && ts-node scripts/clean_data.ts');
  process.exit(1);
}

console.log('Cleaning up test data...');

// Pattern used in seed_data.ts: 
// UIDs: 10000 - 10049
// Usernames: User_0 - User_49

const deleteStmt = db.prepare(`
  DELETE FROM daka_records 
  WHERE uid >= '10000' AND uid <= '10049' AND user LIKE 'User_%'
`);

const info = deleteStmt.run();

console.log(`Deleted ${info.changes} records.`);
console.log('Cleanup complete!');
