import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'daka.db');
const db = new Database(dbPath);

const targetUser = '量贩型冻茗乐';
console.log(`Querying stats for user: ${targetUser}...`);

const start = process.hrtime();

// Logic copied from Repository.searchUserStats
let effectiveUser = targetUser;

// 1. Try to see if query is a UID
const userByUid = db.prepare('SELECT user FROM daka_records WHERE uid = ? LIMIT 1').get(targetUser) as { user: string };
if (userByUid) {
    effectiveUser = userByUid.user;
}

// 2. Aggregate by USERNAME
const stats = db.prepare(`
    SELECT 
        MAX(user) as username,
        COUNT(*) as total_sessions,
        SUM(duration) as total_duration_seconds,
        MAX(project) as top_project,
        COUNT(DISTINCT date) as active_days
    FROM daka_records
    WHERE user = ? AND end_time IS NOT NULL
  `).get(effectiveUser) as any;

const end = process.hrtime(start);
const timeInMs = (end[0] * 1000 + end[1] / 1e6).toFixed(3);

if (stats && stats.total_sessions > 0) {
    console.log('------------------------------------------------');
    console.log('User:', stats.username);
    console.log('Total Sessions:', stats.total_sessions);
    console.log('Total Duration:', (stats.total_duration_seconds / 60).toFixed(1) + ' mins');
    console.log('Top Project:', stats.top_project);
    console.log('Active Days:', stats.active_days);
    console.log('------------------------------------------------');
} else {
    console.log('User not found (or no finished sessions).');
}

console.log(`Query Execution Time: ${timeInMs}ms`);
