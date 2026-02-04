import fs from 'fs';
import path from 'path';

/**
 * Backup Database Utility
 * Copies daka.db to backups/ folder with timestamp.
 * Keeps only the last 50 backups to save space.
 */
export async function backupDatabase() {
  const dbPath = path.join(process.cwd(), 'daka.db');
  const backupDir = path.join(process.cwd(), 'backups');

  // 1. Ensure DB exists
  if (!fs.existsSync(dbPath)) {
    console.warn('[Backup] daka.db not found, skipping backup.');
    return;
  }

  // 2. Ensure backup dir exists
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // 3. Generate Filename
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const backupPath = path.join(backupDir, `daka_${timestamp}.db`);

  // 4. Perform Copy
  try {
    fs.copyFileSync(dbPath, backupPath);
    console.log(`[Backup] Database backed up to: ${backupPath}`);
  } catch (err) {
    console.error('[Backup] Failed to copy database file:', err);
    return;
  }

  // 5. Rotate Backups (Keep max 50)
  try {
    const files = fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.db') && f.startsWith('daka_'))
      .map(f => ({
        name: f,
        time: fs.statSync(path.join(backupDir, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time); // Newest first

    const MAX_BACKUPS = 50;
    if (files.length > MAX_BACKUPS) {
      const toDelete = files.slice(MAX_BACKUPS);
      toDelete.forEach(f => {
        fs.unlinkSync(path.join(backupDir, f.name));
        console.log(`[Backup] Rotated (deleted) old backup: ${f.name}`);
      });
    }
  } catch (err) {
    console.error('[Backup] Failed to rotate backups:', err);
  }
}
