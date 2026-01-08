# Gemini 上下文文档 (GEMINI.md)

此文件作为 Gemini CLI 代理的上下文锚点。它描述了项目的架构、关键组件和当前的开发状态。

## 项目标识 (Project Identity)

- **名称**: Bilibili Study Room Live (study-room-live)
- **类型**: 互动直播插件 (Node.js + Web Overlay)
- **目标**: 允许观众发送弹幕（Danmu）进行学习“打卡”，并通过浏览器源在 OBS 上显示。

## 架构 (Architecture)

### 1. 后端 (Backend - Node.js/TypeScript)

- **入口**: `src/main.ts` - 初始化客户端和服务器。
- **核心引擎**: `src/core/bilibili/`
  - `client.ts`: 处理 Bilibili 开放平台 API (HTTP/WS)，心跳检测和签名。
  - `protocol.ts`: 解码二进制 WebSocket 数据包 (Zlib)。
- **数据库**: `src/core/database/repository.ts`
  - 使用 `better-sqlite3`。
  - 表: `daka_records` (存储用户会话、时长、目标时长)。
  - **方法**: `searchUserStats(query)` 通过 UID 或用户名创建聚合统计信息。
- **服务层**:
  - `src/services/StudyService.ts`:
    - **应用的大脑 (Brain)**。
    - 解析弹幕正则 (例如: `打卡 数学 60`)。
    - 处理 Widget 命令: `专注统计` (Stats), `AI报告` (AI Summary)。
    - 管理会话生命周期 (开始 -> 检查循环 -> 自动完成 -> 延迟结束)。
    - 向本地 WebSocket 广播事件 (`STATE_UPDATE`, `WIDGET_STATS`, `WIDGET_AI`)。
  - `src/services/AIService.ts`:
    - 处理与 AI 提供商的通信 (OpenAI 兼容接口)。
    - 使用 `.env` 中配置的提示词 (Prompts)。
- **接口**:
  - **HTTP**: `src/api/http/server.ts` (Express, Port 3000) - 提供静态文件和 API (`/api/stats`, `/api/ai`)。
  - **WebSocket**: `src/api/websocket/server.ts` (ws, Port 23335) -向 Overlay 推送实时状态。

### 2. 前端 (Frontend - OBS Overlay)

- **学习计时器**: `public/index.html` - 黑板风格 (Chalkboard)，显示进度。
- **排行榜**: `public/stats.html` - 赛博朋克风格 (Cyberpunk)，3D 变换，列出会话列表。
- **AI 僚机挂件**: `public/ai_widget.html`
  - **风格**: **透明 + 80° 平行四边形 + 超粗排版**。无背景/边框，悬浮文字。
  - **逻辑**:
    - **空闲 (Idle)**: 常驻时钟 (大号)，日期，和提示 (`> Awaiting Input_`)。
    - **活跃 (Active)**: 收到命令时显示统计卡片 (时长/会话分割) 或 AI 报告 (打字机效果)。
    - **技术**: Alpine.js, 队列系统, 固定高度 (h-80)。
  - **样式**:
    - **字体**: `Chakra Petch` (数字/英文) + `Noto Sans SC` (中文)，确保粗细一致。
    - **布局**: 紧凑的垂直间距，顶部对齐以防止移位。

### 3. 数据与配置 (Data & Configuration)

- **配置 API**: `/api/config` (GET/POST)
  - 管理 `.env` 中 `DISPLAY_DURATION_WIDGET`, `DISPLAY_DURATION_INDEX`, `AI_PROMPT_WIDGET` 的持久化。
- **同步**: 后端在新 WebSocket 连接时广播状态，确保 `index.html` 正确初始化 (睡觉猫咪 vs 活跃状态)。

## 关键数据流 (Key Data Flows)

1. **打卡**: 用户发送 `打卡` -> Bilibili WS -> `StudyService` -> `Repository` -> `LocalWS` -> `index.html`.
2. **Widget 统计**: 用户发送 `专注统计` -> `StudyService` -> `Repository` (聚合) -> `LocalWS` (`WIDGET_STATS`) -> `ai_widget.html`.
3. **Widget AI**: 用户发送 `AI报告` -> `StudyService` -> `AIService` (生成文本) -> `LocalWS` (`WIDGET_AI`) -> `ai_widget.html`.

## 环境变量 (.env)

- `BILIBILI_*`: API 凭证。
- `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`: AI 提供商配置。
- `AI_PROMPT_ADMIN`: 管理后台总结用的提示词。
- `AI_PROMPT_WIDGET`: 简洁、“毒舌”或“夸奖”风格的 Widget 报告提示词。

## 当前状态 (2026-01-08)

- [x] 核心后端 (Bilibili 连接)
- [x] 数据库迁移与聚合 (按用户名/UID 搜索)
- [x] 学习计时器 UI (`index.html`)
  - [x] **睡觉猫咪空闲状态**: 房间空闲时的粉笔风格 SVG 动画。
  - [x] 顶部对齐布局，避免文字拥挤。
- [x] 排行榜 UI (`stats.html`)
  - [x] 修复 OBS 透明度闪烁问题。
- [x] 管理后台 (`admin.html`)
  - [x] **系统配置面板**: 编辑显示时长 (秒) 和 AI 提示词。
  - [x] 修复布局/脚本语法问题。
- [x] **AI 僚机挂件 (`ai_widget.html`)**
  - [x] 加载状态动画。
  - [x] 动态显示时长控制。
- [x] **历史统计查询 (原生)**
  - [x] **数据库优化**: 为 `uid`, `user`, `date` 添加索引，确保即使有 10k+ 记录也能实现毫秒级查询。
- [x] **运维与工具**
  - [x] **启动脚本 (`start.bat`)**: 一键启动，自动安装依赖，并自动打开管理后台。
  - [x] **性能测试**: 添加 `seed_data.ts` 和 `clean_data.ts` 用于压力测试。
  - [x] **后台增强**: 为系统配置添加“恢复默认”按钮。

## 用户指南 (Agent Instructions)

- **同步与 Git**: 在涉及数据同步或版本控制 (Git, 备份) 的领域，始终将用户视为 **初学者**。提供详细的、分步骤的警告，并仔细解释潜在的冲突 (例如：本地 vs 远程)，以防止数据丢失。
