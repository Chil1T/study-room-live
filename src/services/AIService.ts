import axios from 'axios';
import { config } from '../config';

export class AIService {
    private apiKey: string;
    private baseUrl: string;
    private model: string;

    constructor() {
        this.apiKey = config.ai.apiKey;
        this.baseUrl = config.ai.baseUrl;
        this.model = config.ai.model;

        if (!this.apiKey) {
            console.warn('[AIService] No API Key provided. AI features will be disabled.');
        }
    }

    async generateSummary(prompt: string): Promise<string> {
        if (!this.apiKey) {
            return "AI 配置未完成，请在 .env 中设置 AI_API_KEY";
        }

        try {
            const response = await axios.post(
                `${this.baseUrl}/chat/completions`,
                {
                    model: this.model,
                    messages: [
                        { role: 'system', content: '你是一个赛博朋克风格的自习室AI管理员。你的名字叫“核心”，性格冷静、理智但偶尔毒舌。请根据用户的数据生成一段简短的总结或评价。' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.7,
                    max_tokens: 300
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKey}`
                    }
                }
            );

            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('[AIService] Error:', (error as any).response?.data || (error as any).message);
            return "AI 连接失败，请检查网络或 Key。";
        }
    }
}
