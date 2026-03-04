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
                        { 
                          role: 'system', 
                          content: `你是一个赛博朋克自习室的AI伴侣。
目标：为用户提供简短、有温度的情绪价值和鼓励。
风格：
1. 30字以内，适合直播间小挂件显示。
2. 温暖、有时略带调皮，但核心是陪伴。
3. 关注“连续打卡”和“今日努力”。
4. 如果有偏科（Top Projects），可以以此开玩笑但不要说教。

输入是一个JSON，包含：
- today_mins: 今日分钟数
- streak: 连续打卡天数
- top_projects: 常驻项目

示例输出：
- "连续5天了，你是铁做的吗？保持住！🔥"
- "今天已经2小时了，数学虽然难，但你更强。"
- "欢迎回来！断签也没事，今天重新开始！"`
                        },
                        { role: 'user', content: prompt } // Prompt is now JSON string
                    ],
                    temperature: 0.7,
                    max_tokens: 100
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

    /**
     * Normalize Project Name (Sanitize & Unify)
     * Returns a JSON string or plain text depending on prompt instruction.
     */
    async normalizeProjectName(rawParams: string, existingProjects: string[] = []): Promise<string> {
        if (!this.apiKey) return rawParams; // Fallback immediately if no key

        try {
            let promptTemplate = config.ai.prompts.normalize;
            if (!promptTemplate) {
                 // Fallback default
                 promptTemplate = `你是一个直播间打卡项目的【审核与规范化管理员】。
任务：接收用户输入的项目名，输出规范后的项目名。
规则：
1. 【无害化】：如果输入包含政治敏感、露骨的色情、极端的暴力或严重脏话，请将其改写为中性的替代词（如"娱乐活动"、"生活对线"）[不必太过严格,只要不影响观众观感即可]。
2. 【统一化】：
   - 必须是**非常明确**的同义词或简称才能合并（如"线代"->"线性代数", "High Math"->"高等数学"）。
   - ❌ 严禁强行关联：如果用户输入的是泛指词（如"学习", "Study", "看书"），**不要**将其映射到具体的某个科目（如"英语阅读"），而是保持原样或统一为"自习"。
   - ❌ 严禁具体化映射：绝不要把"数学"映射成"高等数学"。
3. 【参考库】：已知现有项目库：{{existingProjects}}。仅当输入明显是库中某项目的别名时才返回库内名称。如果没有完美匹配，**请优先返回包含用户原词的名称，或直接返回原词**。
4. 【原样】：如果输入正常且无歧义，返回原词。

输出要求：只输出最终的项目名称（字符串），不要包含任何解释、标点或JSON格式。`;
            }

            const systemPrompt = promptTemplate.replace('{{existingProjects}}', JSON.stringify(existingProjects));

            const response = await axios.post(
                `${this.baseUrl}/chat/completions`,
                {
                    model: this.model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: rawParams }
                    ],
                    temperature: 0.5, // Lower temperature for stability
                    max_tokens: 40
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKey}`
                    },
                    timeout: 8000 // 8s Strict Timeout (Client Side)
                }
            );

            const result = response.data.choices[0].message.content.trim();
            // Remove any trailing period if AI adds it
            return result.replace(/。$/, '');

        } catch (error) {
            console.error('[AIService] Normalization Error:', (error as any).message);
            // Fallback to original on error/timeout
            return rawParams;
        }
    }

    /**
     * Validate connection and optionally fetch models
     */
    async validateConnection(baseUrlOverride?: string, apiKeyOverride?: string): Promise<{ valid: boolean, models: string[], error?: string }> {
        const baseUrl = baseUrlOverride || this.baseUrl;
        const apiKey = apiKeyOverride || this.apiKey;

        if (!baseUrl || !apiKey) {
            return { valid: false, models: [], error: "Missing Base URL or API Key" };
        }

        // 1. Try fetching models (Standard OpenAI)
        try {
            // Handle trailing slash
            // If baseUrl ends with /v1, we want /v1/models
            const url = baseUrl.endsWith('/') ? `${baseUrl}models` : `${baseUrl}/models`;

            const response = await axios.get(url, {
                headers: { 'Authorization': `Bearer ${apiKey}` },
                timeout: 5000
            });

            if (response.data && Array.isArray(response.data.data)) {
                return { valid: true, models: response.data.data.map((m: any) => m.id) };
            } else if (Array.isArray(response.data)) {
                return { valid: true, models: response.data.map((m: any) => m.id) };
            }
        } catch (error: any) {
            // If 401, it's definitely an auth error. Stop.
            if (error.response && error.response.status === 401) {
                 return { valid: false, models: [], error: "401 Unauthorized: Invalid API Key" };
            }
            // For other errors (404, 400, etc), try Fallback (Chat Completion)
            // Some providers don't support /models endpoint.
        }

        // 2. Fallback: Try a minimal Chat Completion
        try {
            const chatUrl = baseUrl.endsWith('/') ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`;
            await axios.post(chatUrl, {
                model: 'gpt-3.5-turbo', // Try a generic model name usually aliased
                messages: [{ role: 'user', content: 'hi' }],
                max_tokens: 1
            }, {
                headers: { 'Authorization': `Bearer ${apiKey}` },
                timeout: 5000
            });
            
            // If we got here (even with a 400 "Model not found"), the *Connection* and *Auth* are likely good.
            // But if it succeeded 200, it's definitely good.
            // If 400 "Model not found", it validates the KEY at least. 
            // We'll assume success means "Auth Valid".
            return { valid: true, models: [] }; 

        } catch (error: any) {
             const status = error.response ? error.response.status : 0;
             // If 400 because specific model not found, that implies Auth Success!
             if (status === 400 || status === 404) {
                 // Check if error message mentions "model"
                 const msg = error.response?.data?.error?.message || "";
                 if (msg.includes("model")) {
                     return { valid: true, models: [], error: "Connection OK, but default model test failed. Please enter model manually." };
                 }
             }
             return { valid: false, models: [], error: error.message || "Connection Failed" };
        }
    }
}
