import Database from 'better-sqlite3';
import path from 'path';

export interface DakaRecord {
  id?: number;
  user: string;
  uid: string;
  project: string;
  start_time: number;
  end_time?: number;
  duration?: number;
  date: string;
  target_duration: number; // In minutes
}

export class DakaRepository {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initTable();
  }

  private initTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS daka_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user TEXT,
        uid TEXT,
        project TEXT,
        start_time INTEGER,
        end_time INTEGER,
        duration INTEGER,
        date TEXT,
        target_duration INTEGER DEFAULT 60
      );
      CREATE INDEX IF NOT EXISTS idx_uid ON daka_records(uid);
      CREATE INDEX IF NOT EXISTS idx_user ON daka_records(user);
      CREATE INDEX IF NOT EXISTS idx_date ON daka_records(date);
    `);
  }

  getTodayDateStr(): string {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /**
   * Find ongoing session for user
   */
  findOngoing(uid: string): DakaRecord | undefined {
    const row = this.db.prepare('SELECT * FROM daka_records WHERE uid = ? AND end_time IS NULL').get(uid);
    return row as DakaRecord;
  }

  /**
   * Start a new session
   */
  startSession(user: string, uid: string, project: string, targetDuration: number = 60): void {
    const now = Date.now();
    const today = this.getTodayDateStr();

    // Close any existing session first
    this.endSession(uid);

    this.db.prepare(
      'INSERT INTO daka_records (user, uid, project, start_time, date, target_duration) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(user, uid, project, now, today, targetDuration);
  }

  /**
   * End session
   */
  endSession(uid: string): number {
    const ongoing = this.findOngoing(uid);
    if (!ongoing) return 0;

    const now = Date.now();
    const duration = Math.floor((now - ongoing.start_time) / 1000);

    this.db.prepare(
      'UPDATE daka_records SET end_time = ?, duration = ? WHERE id = ?'
    ).run(now, duration, ongoing.id);

    return duration;
  }

  /**
   * Get today's total duration for a user
   */
  getTodayTotal(uid: string): number {
    const today = this.getTodayDateStr();
    const result = this.db.prepare(`
      SELECT SUM(duration) as total 
      FROM daka_records 
      WHERE uid = ? AND date = ? AND end_time IS NOT NULL
    `).get(uid, today) as { total: number };

    return result ? result.total || 0 : 0;
  }

  /**
   * Get all active sessions
   */
  getAllActive(): DakaRecord[] {
    return this.db.prepare('SELECT * FROM daka_records WHERE end_time IS NULL').all() as DakaRecord[];
  }

  /**
   * Get recent records
   */
  getRecentRecords(limit: number = 50): DakaRecord[] {
    return this.db.prepare('SELECT * FROM daka_records ORDER BY id DESC LIMIT ?').all(limit) as DakaRecord[];
  }

  /**
   * Delete a record by ID
   */
  deleteRecord(id: number): void {
    this.db.prepare('DELETE FROM daka_records WHERE id = ?').run(id);
  }

  /**
   * Get User Statistics
   */
  /**
   * Smart Search User Stats (By UID or Name)
   * Collapses all history by Username
   */
  searchUserStats(query: string) {
    let targetUser = query;

    // 1. Try to see if query is a UID
    const userByUid = this.db.prepare('SELECT user FROM daka_records WHERE uid = ? LIMIT 1').get(query) as { user: string };
    if (userByUid) {
      targetUser = userByUid.user;
    }

    // 2. Aggregate by USERNAME (merges legacy '0' uid and new uid)
    const stats = this.db.prepare(`
        SELECT 
            MAX(user) as username,
            COUNT(*) as total_sessions,
            SUM(duration) as total_duration_seconds,
            MAX(project) as top_project, -- SQLite simple approximation
            COUNT(DISTINCT date) as active_days
        FROM daka_records
        WHERE user = ? AND end_time IS NOT NULL
      `).get(targetUser) as any;

    // If no stats found (total_sessions 0), return null
    if (!stats || !stats.total_sessions) return null;

    return stats;
  }

  // Keep legacy for compatibility if needed, but we will route to search
  getUserStats(uid: string) {
    return this.searchUserStats(uid);
  }

  /**
   * Get Range Statistics (e.g. for Leaderboard)
   */
  getRangeStats(start: string, end: string) {
    // Input dates as YYYY-MM-DD
    const rows = this.db.prepare(`
        SELECT user, uid, SUM(duration) as total_duration
        FROM daka_records
        WHERE date >= ? AND date <= ? AND end_time IS NOT NULL
        GROUP BY uid
        ORDER BY total_duration DESC
        LIMIT 10
      `).all(start, end);

    const totalTime = this.db.prepare(`
        SELECT SUM(duration) as grand_total 
        FROM daka_records 
        WHERE date >= ? AND date <= ? AND end_time IS NOT NULL
      `).get(start, end) as any;

    return {
      leaderboard: rows,
      grand_total: totalTime.grand_total || 0,
      start,
      end
    };
  }
}
