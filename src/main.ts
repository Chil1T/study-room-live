import { BilibiliClient } from './core/bilibili/client';
import { LocalWebSocketServer } from './api/websocket/server';
import { HttpServer } from './api/http/server';
import { StudyService } from './services/StudyService';
import { backupDatabase } from './utils/backup';

import { AIService } from './services/AIService';

async function main() {
  console.log('=== Bilibili Study Room Live System ===');

  // 0. Auto Backup (Safety First)
  await backupDatabase();

  // 1. Initialize Infrastructure
  const biliClient = new BilibiliClient();
  const localWs = new LocalWebSocketServer();
  const aiService = new AIService();

  // Services
  const studyService = new StudyService(biliClient, localWs, aiService);
  const httpServer = new HttpServer(studyService, aiService);

  // 3. Start Servers
  httpServer.start();

  // 4. Connect to Bilibili
  const success = await biliClient.startApp();
  if (success) {
    console.log('✅ System Started Successfully!');
  } else {
    console.error('❌ Failed to start system. Please check credentials.');
    process.exit(1);
  }

  // Graceful Shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await biliClient.endApp();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
