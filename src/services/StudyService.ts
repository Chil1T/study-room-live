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
  status: 'studying' | 'resting' | 'finished';
  // Multi-session fields
  currentRound: number;    // 当前轮次 (1-indexed)
  totalRounds: number;     // 总轮次
  restStartTime?: number;  // 休息开始时间
}

import { AIService } from './AIService';
import { config } from '../config';
import { ProjectNormalizationService } from './ProjectNormalizationService';

export class StudyService {
  private biliClient: BilibiliClient;
  private localWs: LocalWebSocketServer;
  private repo: DakaRepository;
  private aiService: AIService;
  private projectNormalizer: ProjectNormalizationService; // New Service

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
    
    // Initialize Normalizer
    this.projectNormalizer = new ProjectNormalizationService(aiService, this.repo);

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
        status: 'studying',
        currentRound: 1,
        totalRounds: 1
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
      // Skip finished sessions
      if (session.status === 'finished') continue;

      // Handle RESTING state
      if (session.status === 'resting') {
        const restElapsed = now - (session.restStartTime || now);
        if (restElapsed >= config.multiSession.breakDuration) {
          // Rest complete, start next round
          session.currentRound++;
          session.status = 'studying';
          session.startTime = Date.now();
          session.restStartTime = undefined;

          console.log(`[Study] ${session.username} starting round ${session.currentRound}/${session.totalRounds}`);

          // Broadcast round start event
          this.localWs.broadcast('ROUND_START', {
            uid,
            username: session.username,
            currentRound: session.currentRound,
            totalRounds: session.totalRounds
          });

          stateChanged = true;
        }
        continue; // Don't check study progress while resting
      }

      // Handle STUDYING state
      const durationSeconds = Math.floor((now - session.startTime) / 1000);

      // If targetDuration is -1, it's an infinite session. 
      // It never finishes automatically via time check.
      if (session.targetDuration === -1) {
        continue;
      }

      const targetSeconds = session.targetDuration * 60;

      if (durationSeconds >= targetSeconds) {
        // Round complete!
        console.log(`[Study] ${session.username} completed round ${session.currentRound}/${session.totalRounds}`);

        if (session.currentRound < session.totalRounds) {
          // More rounds to go - enter rest
          session.status = 'resting';
          session.restStartTime = Date.now();

          this.localWs.broadcast('ROUND_COMPLETE', {
            uid,
            username: session.username,
            currentRound: session.currentRound,
            totalRounds: session.totalRounds,
            nextRestDuration: config.multiSession.breakDuration
          });
        } else {
          // All rounds complete!
          session.status = 'finished';

          this.localWs.broadcast('SESSION_COMPLETE', {
            uid,
            username: session.username,
            project: session.project,
            duration: durationSeconds,
            totalRounds: session.totalRounds
          });

          setTimeout(() => {
            this.endSession(uid, session.username);
          }, 20000);
        }

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
    // 1. Clock In: "打卡 学习 60" or "打卡 学习 2小时" or "打卡 学习 45 3次"
    const startMatch = content.match(/^(?:打卡|开始)\s+(\S+)(?:\s+(\d+(?:\.\d+)?)(?:\s*(分钟|min|h|小时))?)?(?:\s+(\d+)\s*次)?/i);

    if (startMatch) {
      const project = startMatch[1] || '自习';
      // If duration is provided, parse it. If NOT provided, set to -1 (Infinite).
      let durationVal = startMatch[2] ? parseFloat(startMatch[2]) : -1;
      const unit = startMatch[3];
      const rounds = startMatch[4] ? parseInt(startMatch[4]) : 1; // Default 1 round

      // Convert to minutes (only if duration is positive)
      if (durationVal > 0 && (unit === 'h' || unit === '小时')) {
        durationVal = durationVal * 60;
      }

      console.log(`[Session Start] User: ${username}, Project: ${project}, Duration: ${durationVal}m, Rounds: ${rounds}`);

      this.startSession(uid, username, face, project, durationVal > 0 ? Math.floor(durationVal) : -1, Math.max(1, rounds));
      return;
    }

    // 2. Clock Out: "下机"
    if (content === '下机' || content === '结束' || content === '结束打卡' || content === '下课') {
      this.endSession(uid, username);
      return;
    }

    // 3. Widget: Stats Query ("专注统计")
    if (content === '专注统计' || content === '查询数据') {
        const detailed = this.repo.getUserDetailedStats(username);
        if (detailed) {
          this.localWs.broadcast('WIDGET_STATS', {
            username: detailed.username,
            duration: Math.floor(detailed.total_duration_seconds / 60),
            sessions: detailed.total_sessions,
            active_days: detailed.active_days,
            today_mins: Math.floor(detailed.today_duration_seconds / 60),
            streak: detailed.streak,
            top_projects: detailed.top_projects
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
    const todayMins = Math.floor(stats.today_duration_seconds / 60);

    // Build context payload
    const context = {
      username: stats.username,
      total_hours: (durationMins / 60).toFixed(1),
      today_mins: todayMins,
      streak: stats.streak || 0,
      active_days: stats.active_days,
      top_projects: stats.top_projects || []
    };

    try {
      const text = await this.aiService.generateSummary(JSON.stringify(context));
      return text;
    } catch (e) {
      console.error('Widget AI Error', e);
      return "AI 大脑过载中...";
    }
  }

  private async startSession(uid: string, username: string, face: string, rawProject: string, targetDuration: number, totalRounds: number = 1) {
    // Check if already started
    const ongoing = this.repo.findOngoing(uid);
    if (ongoing) {
      console.log(`[Study] User ${username} already started.`);
    } else {
      // --- NORMALIZE PROJECT NAME ---
      const project = await this.projectNormalizer.normalize(rawProject);

      this.repo.startSession(username, uid, project, targetDuration);

      // Update memory state
      this.sessionStates.set(uid, {
        uid,
        username,
        face,
        project,
        startTime: Date.now(),
        targetDuration,
        status: 'studying',
        currentRound: 1,
        totalRounds
      });

      const roundInfo = totalRounds > 1 ? ` x ${totalRounds}轮` : '';
      console.log(`[Study] User ${username} started: ${project} (${targetDuration} mins${roundInfo})`);
    }

    this.broadcastState();
  }

  private endSession(uid: string, username: string) {
    // 1. Get session info BEFORE removing from memory
    const session = this.sessionStates.get(uid);
    
    // 2. Update DB
    const duration = this.repo.endSession(uid);

    if (duration >= 0 && session) {
      // 3. Broadcast Event IF it was manually ended (i.e. not already 'finished')
      // Automatic completion sets status='finished' before calling this, so this won't double-fire.
      if (session.status !== 'finished') {
        this.localWs.broadcast('SESSION_COMPLETE', {
            uid,
            username: session.username,
            project: session.project,
            duration: duration,
            totalRounds: session.totalRounds
        });
        console.log(`[Study] Manually ended session for ${username} (Duration: ${duration}s)`);
      }

      // 4. Remove from memory & update list
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
        status: session.status, // 'studying', 'resting', or 'finished'
        currentRound: session.currentRound,
        totalRounds: session.totalRounds,
        restStartTime: session.restStartTime
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
    return Array.from(this.sessionStates.values()).map(session => {
      const currentDuration = Math.floor((Date.now() - session.startTime) / 1000);
      return {
        uid: session.uid,
        username: session.username,
        face: session.face,
        project: session.project,
        startTime: session.startTime,
        duration: currentDuration, // Computed in seconds
        targetDuration: session.targetDuration * 60, // Convert minutes to seconds
        status: session.status,
        currentRound: session.currentRound,
        totalRounds: session.totalRounds,
        restStartTime: session.restStartTime
      };
    });
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

  public skipAllSessions(): number {
    const uids = Array.from(this.sessionStates.keys());
    for (const uid of uids) {
      const session = this.sessionStates.get(uid);
      if (session) {
        console.log(`[Admin] Force ending all: ${session.username}`);
        this.endSession(uid, session.username);
      }
    }
    return uids.length;
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