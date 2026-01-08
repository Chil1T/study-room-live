import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from '../../config';

import { StudyService } from '../../services/StudyService';
import { AIService } from '../../services/AIService';
import { configRouter } from './configRouter';

export class HttpServer {
  private app: express.Application;
  private studyService: StudyService;
  private aiService: AIService;

  constructor(studyService: StudyService, aiService: AIService) {
    this.app = express();
    this.studyService = studyService;
    this.aiService = aiService;
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());

    // Static files middleware
    // Serves files from 'public' directory at root URL '/'
    const publicPath = path.join(process.cwd(), 'public');
    this.app.use(express.static(publicPath));
    console.log(`[HttpServer] Serving static files from: ${publicPath}`);
  }

  private setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });

    // --- Admin APIs ---

    // Get current state
    this.app.get('/api/state', (req, res) => {
      const sessions = this.studyService.getActiveSessions();
      res.json({
        active_count: sessions.length,
        sessions: sessions
      });
    });

    // Skip user
    this.app.post('/api/control/skip', (req, res) => {
      const { uid } = req.body;
      if (uid) {
        this.studyService.skipSession(uid);
        res.json({ success: true });
      } else {
        res.status(400).json({ error: 'Missing uid' });
      }
    });

    // Get records
    this.app.get('/api/records', (req, res) => {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const records = this.studyService.getRecentRecords(limit);
      res.json(records);
    });

    // Delete record
    this.app.delete('/api/records/:id', (req, res) => {
      const id = parseInt(req.params.id);
      if (id) {
        this.studyService.deleteRecord(id);
        res.json({ success: true });
      } else {
        res.status(400).json({ error: 'Invalid ID' });
      }
    });

    // --- Statistics & AI APIs ---

    this.app.get('/api/stats/user/:uid', (req, res) => {
      // Legacy route, now smart enough to handle whatever (but URL encoded names might be weird in path)
      const stats = this.studyService.getUserStats(req.params.uid);
      res.json(stats);
    });

    this.app.get('/api/stats/search', (req, res) => {
      const q = req.query.q as string;
      if (!q) return res.status(400).json({ error: 'Missing query' });

      const stats = this.studyService.searchUserStats(q);
      if (stats) res.json(stats);
      else res.status(404).json({ error: 'Not found' });
    });

    this.app.get('/api/stats/range', (req, res) => {
      const { start, end } = req.query;
      if (!start || !end) {
        return res.status(400).json({ error: 'Missing start/end date (YYYY-MM-DD)' });
      }
      const stats = this.studyService.getRangeStats(start as string, end as string);
      res.json(stats);
    });

    // Config Router
    this.app.use('/api/config', configRouter);

    this.app.post('/api/ai/summary', async (req, res) => {
      const { stats, context } = req.body;

      let prompt = "";
      if (context === 'user') {
        const durationMins = Math.floor(stats.total_duration_seconds / 60);

        // Use configured prompt or fallback
        let template = config.ai.prompts.admin;
        if (!template) {
          template = "用户：{{username}}，时长：{{duration}}。请写一段赛博朋克风格总结。";
        }

        // Simple template replacement
        prompt = template
          .replace('{{username}}', stats.username)
          .replace('{{duration}}', durationMins.toString())
          .replace('{{sessions}}', stats.total_sessions.toString())
          .replace('{{project}}', stats.top_project)
          .replace('{{days}}', stats.active_days.toString());

      } else {
        prompt = `请根据以下自习室的统计数据写一段简短的运营周报。风格要严厉但充满希望：\n${JSON.stringify(stats)}`;
      }

      const text = await this.aiService.generateSummary(prompt);
      res.json({ text });
    });

    // 404 Fallback
    this.app.use((req, res) => {
      res.status(404).send('Not Found');
    });
  }

  public start() {
    const port = config.server.port;
    this.app.listen(port, () => {
      console.log(`[HttpServer] Server running at http://localhost:${port}`);
    });
  }
}
