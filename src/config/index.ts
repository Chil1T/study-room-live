import dotenv from 'dotenv';
dotenv.config();

export const config = {
  bilibili: {
    appId: process.env.BILI_APP_ID || '',
    appKey: process.env.BILI_APP_KEY || '',
    appSecret: process.env.BILI_APP_SECRET || '',
    accessToken: process.env.BILI_ACCESS_TOKEN || '',
    roomId: process.env.BILI_ROOM_ID ? parseInt(process.env.BILI_ROOM_ID) : 0,
  },
  server: {
    port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
    wsPort: process.env.WS_PORT ? parseInt(process.env.WS_PORT) : 23335,
  },
  ai: {
    apiKey: process.env.AI_API_KEY || '',
    baseUrl: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.AI_MODEL || 'gpt-3.5-turbo',
    prompts: {
      admin: process.env.AI_PROMPT_ADMIN || '',
      widget: process.env.AI_PROMPT_WIDGET || '',
      normalize: process.env.AI_PROMPT_NORMALIZE || ''
    }
  },
  displayDuration: {
    widget: process.env.DISPLAY_DURATION_WIDGET ? parseInt(process.env.DISPLAY_DURATION_WIDGET) : 30000,
    index: process.env.DISPLAY_DURATION_INDEX ? parseInt(process.env.DISPLAY_DURATION_INDEX) : 15000,
  },
  multiSession: {
    breakDuration: process.env.BREAK_DURATION ? parseInt(process.env.BREAK_DURATION) : 300000, // 5 minutes default
  }
};
