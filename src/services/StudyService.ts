import { BilibiliClient } from '../core/bilibili/client';
import { BilibiliMessage } from '../core/bilibili/types';
import { LocalWebSocketServer } from '../api/websocket/server';
import { DakaRepository } from '../core/database/repository';
import path from 'path';

interface StudySessionState {
  uid: string;
  username: string;
  face?: string;
  project: string;
  startTime: number;
  targetDuration: number; // minutes
  status: 'studying' | 'finished';
}

import { AIService } from './AIService';
import { config } from '../config';

export class StudyService {
  private biliClient: BilibiliClient;
  private localWs: LocalWebSocketServer;
  private repo: DakaRepository;
  private aiService: AIService; // Inject AI Service

  // Keep track of active sessions in memory to manage 'finished' state and timers
  private sessionStates: Map<string, StudySessionState> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(biliClient: BilibiliClient, localWs: LocalWebSocketServer, aiService: AIService) {
    this.biliClient = biliClient;
    this.localWs = localWs;
    this.aiService = aiService;

    // Initialize DB
    const dbPath = path.join(process.cwd(), 'daka.db');
    this.repo = new DakaRepository(dbPath);

    // Hydrate memory state from DB
    this.syncFromDb();

    this.setupListeners();

    // Broadcast state to new connections
    this.localWs.on('connection', () => {
      this.broadcastState();
    });

    this.startCheckLoop();

    // Initial broadcast
    this.broadcastState();
  }

  private syncFromDb() {
    const activeRecords = this.repo.getAllActive();
    console.log(`[Study] Loaded ${activeRecords.length} active sessions from DB`);
    for (const rec of activeRecords) {
      this.sessionStates.set(rec.uid, {
        uid: rec.uid,
        username: rec.user,
        project: rec.project,
        startTime: rec.start_time,
        targetDuration: rec.target_duration || 60,
        status: 'studying'
      });
    }
  }

  private startCheckLoop() {
    this.checkInterval = setInterval(() => {
      this.checkSessions();
    }, 1000);
  }

  private checkSessions() {
    const now = Date.now();
    let stateChanged = false;

    for (const [uid, session] of this.sessionStates.entries()) {
      if (session.status === 'finished') continue;

      const durationSeconds = Math.floor((now - session.startTime) / 1000);
      const targetSeconds = session.targetDuration * 60;

      if (durationSeconds >= targetSeconds) {
        // Target reached!
        console.log(`[Study] User ${session.username} reached target!`);

        // 1. Mark as finished
        session.status = 'finished';

        // 2. Broadcast specific event
        this.localWs.broadcast('SESSION_COMPLETE', {
          uid,
          username: session.username,
          project: session.project,
          duration: durationSeconds
        });

        // 3. Schedule removal (delayed endSession)
        setTimeout(() => {
          this.endSession(uid, session.username);
        }, 20000); // 20 seconds delay

        stateChanged = true;
      }
    }

    if (stateChanged) {
      this.broadcastState();
    }
  }

  private setupListeners() {
    this.biliClient.on('message', (msg: BilibiliMessage) => {
      if (msg.cmd === 'LIVE_OPEN_PLATFORM_DM') {
        this.handleDanmu(msg.data);
      }
    });
  }

  private handleDanmu(data: any) {
    const content = data.msg || '';

    // Fallback logic for UID
    let uid = data.uid ? data.uid.toString() : '';
    if ((!uid || uid === '0') && data.open_id) {
      uid = data.open_id;
    }

    // Debug: Log info if uid is still weird
    if (!uid || uid === '0') {
      console.warn(`[Danmu] Weird UID detected: ${JSON.stringify(data)}`);
    }

    const username = data.uname;
    const face = data.uface;

    console.log(`[Danmu] ${username}: ${content}`);

    // Command Parsing
    // 1. Clock In: "打卡 学习 60" or "打卡 学习 2小时"
    const startMatch = content.match(/^(?:打卡|开始)\s+(\S+)(?:\s+(\d+(?:\.\d+)?)\s*(分钟|min|h|小时)?)?/i);

    if (startMatch) {
      const project = startMatch[1] || '自习';
      let durationVal = startMatch[2] ? parseFloat(startMatch[2]) : 60; // Default 60 mins
      const unit = startMatch[3];

      // Convert to minutes
      if (unit === 'h' || unit === '小时') {
        durationVal = durationVal * 60;
      }

      this.startSession(uid, username, face, project, Math.floor(durationVal));
      return;
    }

    // 2. Clock Out: "下机"
    if (content === '下机' || content === '结束' || content === '结束打卡') {
      this.endSession(uid, username);
      return;
    }

    // 3. Widget: Stats Query ("专注统计")
    if (content === '专注统计' || content === '查询数据') {
      const stats = this.repo.searchUserStats(username); // Search by Name first
      if (stats) {
        this.localWs.broadcast('WIDGET_STATS', {
          username: stats.username,
          duration: Math.floor(stats.total_duration_seconds / 60),
          sessions: stats.total_sessions,
          active_days: stats.active_days
        });
        console.log(`[Widget] Stats sent for ${username}`);
      }
      return;
    }

    // 4. Widget: AI Report ("AI报告")
    if (content === 'AI报告' || content === 'AI专注报告') {
      const stats = this.repo.searchUserStats(username);
      if (stats) {
        // Async generate, don't block
        // Notify frontend first
        this.localWs.broadcast('WIDGET_AI_LOADING', { username: stats.username });

        this.generateWidgetAI(stats).then(text => {
          this.localWs.broadcast('WIDGET_AI', {
            username: stats.username,
            text: text
          });
        });
      }
      return;
    }
  }

  private async generateWidgetAI(stats: any): Promise<string> {
    const durationMins = Math.floor(stats.total_duration_seconds / 60);
    let template = config.ai.prompts.widget;
    if (!template) return "AI 未配置";

    const prompt = template
      .replace('{{username}}', stats.username)
      .replace('{{duration}}', durationMins.toString());

    try {
      const text = await this.aiService.generateSummary(prompt);
      return text;
    } catch (e) {
      console.error('Widget AI Error', e);
      return "AI 大脑过载中...";
    }
  }

  private startSession(uid: string, username: string, face: string, project: string, targetDuration: number) {
    // Check if already started
    const ongoing = this.repo.findOngoing(uid);
    if (ongoing) {
      console.log(`[Study] User ${username} already started.`);
    } else {
      this.repo.startSession(username, uid, project, targetDuration);

      // Update memory state
      this.sessionStates.set(uid, {
        uid,
        username,
        face,
        project,
        startTime: Date.now(),
        targetDuration,
        status: 'studying'
      });

      console.log(`[Study] User ${username} started: ${project} (${targetDuration} mins)`);
    }

    this.broadcastState();
  }

  private endSession(uid: string, username: string) {
    const duration = this.repo.endSession(uid);
    if (duration > 0) {
      console.log(`[Study] User ${username} finished. Duration: ${duration}s`);
      // Remove from memory
      this.sessionStates.delete(uid);
      this.broadcastState();
    }
  }

  /**
   * Push current room state to frontend
   */
  private broadcastState() {
    // Build list from memory state (which is synced with DB + holds status)
    const list = Array.from(this.sessionStates.values()).map(session => {
      // Calculate dynamic duration
      const currentDuration = Math.floor((Date.now() - session.startTime) / 1000);
      // Get today's previous total
      const previousTotal = this.repo.getTodayTotal(session.uid);

      return {
        username: session.username,
        uid: session.uid,
        face: session.face,
        project: session.project,
        startTime: session.startTime,
        duration: currentDuration, // In Seconds
        targetDuration: session.targetDuration * 60, // In Seconds
        todayTotal: previousTotal + currentDuration,
        status: session.status // 'studying' or 'finished'
      };
    });

    this.localWs.broadcast('STATE_UPDATE', {
      count: list.length,
      list: list
    });
    console.log(`[Study] Broadcasted state: ${list.length} users`);
  }

  // --- Public API for Admin ---

  public getActiveSessions() {
    return Array.from(this.sessionStates.values());
  }

  public getRecentRecords(limit: number = 50) {
    return this.repo.getRecentRecords(limit);
  }

  public deleteRecord(id: number) {
    this.repo.deleteRecord(id);
  }

  public skipSession(uid: string) {
    const session = this.sessionStates.get(uid);
    if (session) {
      console.log(`[Admin] Skipping user ${session.username} (${uid})`);
      this.endSession(uid, session.username);
    }
  }

  public getUserStats(uid: string) {
    return this.repo.searchUserStats(uid);
  }

  public searchUserStats(query: string) {
    return this.repo.searchUserStats(query);
  }

  public getRangeStats(start: string, end: string) {
    return this.repo.getRangeStats(start, end);
  }
}