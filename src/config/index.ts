import dotenv from 'dotenv';
dotenv.config();

export const config = {
  bilibili: {
    appId: process.env.BILI_APP_ID || '1750671843202',
    appKey: process.env.BILI_APP_KEY || 'Z5dW4QBogRf1mZRqI9TBunTs',
    appSecret: process.env.BILI_APP_SECRET || 'BnGppoeMxuKfhs9XMkbE2WKDij3mYm',
    accessToken: process.env.BILI_ACCESS_TOKEN || 'EAFHYO8ZEWOW5', // Code/Identity code
    roomId: process.env.BILI_ROOM_ID ? parseInt(process.env.BILI_ROOM_ID) : 26714219,
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
      widget: process.env.AI_PROMPT_WIDGET || ''
    }
  },
  displayDuration: {
    widget: process.env.DISPLAY_DURATION_WIDGET ? parseInt(process.env.DISPLAY_DURATION_WIDGET) : 30000,
    index: process.env.DISPLAY_DURATION_INDEX ? parseInt(process.env.DISPLAY_DURATION_INDEX) : 15000,
  }
};
