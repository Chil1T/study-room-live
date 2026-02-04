import { ProjectNormalizationService } from '../src/services/ProjectNormalizationService';
import { AIService } from '../src/services/AIService';
import { DakaRepository } from '../src/core/database/repository';
import dotenv from 'dotenv';
import path from 'path';

// Load Environment
dotenv.config({ path: path.join(__dirname, '../.env') });

async function runTest() {
    console.log('🧪 Starting Normalization Test...');
    
    // 1. Setup Dependencies
    const aiService = new AIService();
    
    // Mock Repository (We don't want to rely on real DB for this logic test)
    const mockRepo = {
        getTopProjects: (limit: number) => {
            return ['高等数学', '英语阅读', '健身环大冒险', '线性代数', '考研政治'];
        }
    } as unknown as DakaRepository;

    const normalizer = new ProjectNormalizationService(aiService, mockRepo);

    // 2. Define Test Cases
    const testCases = [
        { input: '高等数学', expectedType: 'Original' },
        { input: '高数', expectedType: 'Unified -> 高等数学' },
        { input: 'Linear Algebra', expectedType: 'Unified -> 线性代数' },
        { input: '自习', expectedType: 'Original' },
        { input: '杀人游戏', expectedType: 'Sanitized -> 互动作战/电子竞技' },
        { input: 'Math', expectedType: 'Unified -> 数学/高等数学' },
        { input: '  Study  ', expectedType: 'Cleaned -> Study' }
    ];

    // 3. Run Tests
    for (const test of testCases) {
        console.log(`\n-----------------------------------`);
        console.log(`Input: "${test.input}"`);
        const startTime = Date.now();
        const result = await normalizer.normalize(test.input);
        const duration = Date.now() - startTime;
        
        console.log(`Output: "${result}"`);
        console.log(`Time: ${duration}ms`);
        console.log(`Expectation: ${test.expectedType}`);
    }
}

runTest().catch(console.error);
