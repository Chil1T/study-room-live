import { AIService } from './AIService';
import { DakaRepository } from '../core/database/repository';

export class ProjectNormalizationService {
    private aiService: AIService;
    private repo: DakaRepository;
    
    // Simple Memory Cache (LRU-like)
    // Map<RawInput, NormalizedOutput>
    private cache: Map<string, string>;
    private readonly MAX_CACHE_SIZE = 200;

    constructor(aiService: AIService, repo: DakaRepository) {
        this.aiService = aiService;
        this.repo = repo;
        this.cache = new Map();
    }

    /**
     * Main Entry Point: Normalize a raw project name
     */
    async normalize(rawProject: string): Promise<string> {
        // 1. Basic Cleaning (Trim, default)
        let input = rawProject.trim();
        if (!input) return '自习'; // Default if empty

        // 2. Check Cache
        if (this.cache.has(input)) {
            const cached = this.cache.get(input);
            // console.log(`[Normalization] Cache Hit: ${input} -> ${cached}`);
            return cached!;
        }

        // 3. Get Top 50 Existing Projects (Context for AI)
        // We do this dynamically so it learns new "Common" names over time.
        // Optimization: Could cache this list too, but DB query is cheap.
        const topProjects = this.repo.getTopProjects(50);

        // 4. Call AI
        console.time(`[Normalization] AI ${input}`);
        const normalized = await this.aiService.normalizeProjectName(input, topProjects);
        console.timeEnd(`[Normalization] AI ${input}`);

        // 5. Update Cache
        this.updateCache(input, normalized);

        if (normalized !== input) {
            console.log(`[Normalization] 🪄 Transformed: "${input}" -> "${normalized}"`);
        }

        return normalized;
    }

    private updateCache(key: string, value: string) {
        if (this.cache.size >= this.MAX_CACHE_SIZE) {
            // Remove oldest (first inserted)
            const firstKey = this.cache.keys().next().value;
            if (firstKey) {
                this.cache.delete(firstKey);
            }
        }
        this.cache.set(key, value);
    }
}
