import { AIService } from '../src/services/AIService';
import dotenv from 'dotenv';
import path from 'path';

// Load Environment
dotenv.config({ path: path.join(__dirname, '../.env') });

async function debugHallucination() {
    console.log('🐞 Starting Hallucination Debug...');
    
    const aiService = new AIService();
    
    // Simulate a typical "Existing Projects" list that might cause confusion
    const existingProjects = ['高等数学', '英语阅读', '健身环大冒险', '线性代数', '考研政治'];

    const trickyInputs = [
        '数学',       // Should map to 高等数学 (Good) or 数学 (Acceptable)
        'Study',      // Should NOT map to 英语阅读. Should be 'Study' or '自习'
        'English',    // Should map to 英语阅读 (Maybe acceptable)
        '自习',       // Should stay 自习
        '学习',       // Should stay 学习 or 自习, NOT 英语阅读
        '玩游戏'      // Should sanitized
    ];

    for (const input of trickyInputs) {
        console.log(`\nInput: "${input}"`);
        console.log(`Context: ${JSON.stringify(existingProjects)}`);
        
        const startTime = Date.now();
        const result = await aiService.normalizeProjectName(input, existingProjects);
        const duration = Date.now() - startTime;
        
        console.log(`Output: "${result}" (${duration}ms)`);
        
        if (input === 'Study' && result === '英语阅读') {
            console.error('❌ FAIL: "Study" incorrectly mapped to "英语阅读" (Hallucination)');
        } else if (input === '数学' && result === '英语阅读') {
             console.error('❌ CRITICAL FAIL: "数学" mapped to "英语阅读"');
        } else {
            console.log('✅ OK (Subjectively)');
        }
    }
}

debugHallucination().catch(console.error);
