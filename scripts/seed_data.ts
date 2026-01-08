import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'daka.db');
const db = new Database(dbPath);

const BATCH_SIZE = 1000;
const TOTAL_RECORDS = 10000;

function getRandomInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateRandomString(length: number) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(getRandomInt(0, chars.length - 1));
    }
    return result;
}

function seed() {
    console.log(`Starting seed of ${TOTAL_RECORDS} records...`);
    const projects = ['Math', 'Coding', 'Reading', 'English', 'History'];
    const users = Array.from({ length: 50 }, (_, i) => ({
        uid: (10000 + i).toString(),
        username: `User_${i}`
    }));

    const insertStmt = db.prepare(`
    INSERT INTO daka_records (user, uid, project, start_time, end_time, duration, date, target_duration)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

    const tx = db.transaction((records) => {
        for (const r of records) insertStmt.run(r.user, r.uid, r.project, r.start_time, r.end_time, r.duration, r.date, r.target_duration);
    });

    const records = [];
    const now = Date.now();

    for (let i = 0; i < TOTAL_RECORDS; i++) {
        const user = users[getRandomInt(0, users.length - 1)];
        const duration = getRandomInt(10, 120) * 60; // seconds
        const startTime = now - getRandomInt(0, 30 * 24 * 60 * 60 * 1000); // within last 30 days

        // YYYY-MM-DD
        const d = new Date(startTime);
        const dateStr = d.getFullYear() + '-' + (d.getMonth() + 1).toString().padStart(2, '0') + '-' + d.getDate().toString().padStart(2, '0');

        records.push({
            user: user.username,
            uid: user.uid,
            project: projects[getRandomInt(0, projects.length - 1)],
            start_time: startTime,
            end_time: startTime + duration * 1000,
            duration: duration,
            date: dateStr,
            target_duration: 60
        });

        if (records.length >= BATCH_SIZE) {
            tx(records);
            records.length = 0;
            console.log(`Inserted ${i + 1} records...`);
        }
    }

    if (records.length > 0) {
        tx(records);
    }

    console.log('Seed complete!');
}

seed();
