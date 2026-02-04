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
    if (!ongoing) return -1;

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
    return this.getUserDetailedStats(query);
  }

  getUserDetailedStats(query: string) {
    let targetUser = query;

    // 1. Try to see if query is a UID
    const userByUid = this.db.prepare('SELECT user FROM daka_records WHERE uid = ? LIMIT 1').get(query) as { user: string };
    if (userByUid) {
      targetUser = userByUid.user;
    }

    // 2. Base Aggregate
    const stats = this.db.prepare(`
        SELECT 
            MAX(user) as username,
            COUNT(*) as total_sessions,
            SUM(duration) as total_duration_seconds,
            COUNT(DISTINCT date) as active_days
        FROM daka_records
        WHERE user = ? AND end_time IS NOT NULL
      `).get(targetUser) as any;

    // If no stats found (total_sessions 0), return null
    if (!stats || !stats.total_sessions) return null;

    // 3. Today's Duration
    const today = this.getTodayDateStr();
    const todayResult = this.db.prepare(`
        SELECT SUM(duration) as total
        FROM daka_records
        WHERE user = ? AND date = ? AND end_time IS NOT NULL
    `).get(targetUser, today) as { total: number };
    const todayDuration = todayResult ? (todayResult.total || 0) : 0;

    // 4. Streak Calculation
    const dates = this.db.prepare(`
        SELECT DISTINCT date
        FROM daka_records
        WHERE user = ? AND end_time IS NOT NULL
        ORDER BY date DESC
    `).all(targetUser) as { date: string }[];

    let streak = 0;
    if (dates.length > 0) {
      // Logic: Check if latest is today or yesterday. Then iterate back.
      const d = new Date();
      const p = (n: number) => n.toString().padStart(2, '0');
      const fmt = (date: Date) => `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;

      const todayStr = fmt(d);
      d.setDate(d.getDate() - 1);
      const yesterdayStr = fmt(d);

      const lastDate = dates[0].date;

      if (lastDate === todayStr || lastDate === yesterdayStr) {
        streak = 1;
        let prevDate = new Date(lastDate);
        
        for (let i = 1; i < dates.length; i++) {
          prevDate.setDate(prevDate.getDate() - 1); // Go back 1 day
          const expected = fmt(prevDate);
          if (dates[i].date === expected) {
            streak++;
          } else {
            break; // Gap found
          }
        }
      }
    }

    // 5. Top Projects
    const projects = this.db.prepare(`
      SELECT project, SUM(duration) as total
      FROM daka_records
      WHERE user = ? AND end_time IS NOT NULL
      GROUP BY project
      ORDER BY total DESC
      LIMIT 3
    `).all(targetUser) as { project: string, total: number }[];

    const grandTotal = stats.total_duration_seconds || 1;
    const topProjects = projects.map(p => ({
      name: p.project,
      percent: Math.round((p.total / grandTotal) * 100)
    }));

    return {
      ...stats,
      today_duration_seconds: todayDuration,
      streak,
      top_projects: topProjects
    };
  }

  // Keep legacy for compatibility if needed
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

  /**
   * Get Top Frequent Projects (for AI Unification context)
   */
  getTopProjects(limit: number = 50): string[] {
      const rows = this.db.prepare(`
        SELECT project, COUNT(*) as count 
        FROM daka_records 
        GROUP BY project 
        ORDER BY count DESC 
        LIMIT ?
      `).all(limit) as { project: string }[];
      
      return rows.map(r => r.project);
  }
}
