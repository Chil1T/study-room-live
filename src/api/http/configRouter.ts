import express, { Router } from 'express';
import { config } from '../../config';
import fs from 'fs';
import path from 'path';

export const configRouter = Router();

// Get configurable keys
configRouter.get('/', (req, res) => {
    res.json({
        displayDuration: config.displayDuration,
        ai: {
            apiKey: config.ai.apiKey,
            baseUrl: config.ai.baseUrl,
            model: config.ai.model,
            prompts: config.ai.prompts
        },
        multiSession: config.multiSession
    });
});

// Update configs
configRouter.post('/', async (req, res) => {
    const { displayDuration, ai, multiSession } = req.body;

    // 1. Update Runtime Config
    if (displayDuration) {
        if (displayDuration.widget) config.displayDuration.widget = parseInt(displayDuration.widget);
        if (displayDuration.index) config.displayDuration.index = parseInt(displayDuration.index);
    }

    if (ai) {
        if (ai.apiKey !== undefined) config.ai.apiKey = ai.apiKey;
        if (ai.baseUrl !== undefined) config.ai.baseUrl = ai.baseUrl;
        if (ai.model !== undefined) config.ai.model = ai.model;
        
        if (ai.prompts) {
            if (ai.prompts.widget !== undefined) config.ai.prompts.widget = ai.prompts.widget;
            if (ai.prompts.normalize !== undefined) config.ai.prompts.normalize = ai.prompts.normalize;
            if (ai.prompts.admin !== undefined) config.ai.prompts.admin = ai.prompts.admin;
        }
    }

    if (multiSession) {
        if (multiSession.breakDuration) {
            config.multiSession.breakDuration = parseInt(multiSession.breakDuration);
        }
    }

    // 2. Try to persist to .env
    const envPath = path.resolve(process.cwd(), '.env');
    try {
        let envContent = fs.readFileSync(envPath, 'utf-8');

        // Helper to replace or append
        const updateKey = (key: string, value: string | number) => {
            // If value is a string and has newlines or spaces, ensure it's JSON stringified to be safe
            // But we want it to look nice in .env if possible. 
            // Most reliable for multiline prompts is JSON.stringify which adds surrounding quotes and escapes validly.
            let formattedValue = String(value);
            if (typeof value === 'string') {
                 formattedValue = JSON.stringify(value);
            }

            const regex = new RegExp(`^${key}=.*`, 'm');
            if (regex.test(envContent)) {
                envContent = envContent.replace(regex, `${key}=${formattedValue}`);
            } else {
                envContent += `\n${key}=${formattedValue}`;
            }
        };

        if (displayDuration) {
            if (displayDuration.widget) updateKey('DISPLAY_DURATION_WIDGET', displayDuration.widget);
            if (displayDuration.index) updateKey('DISPLAY_DURATION_INDEX', displayDuration.index);
        }

        if (multiSession && multiSession.breakDuration) {
            updateKey('BREAK_DURATION', multiSession.breakDuration);
        }

        if (ai) {
             if (ai.apiKey !== undefined) updateKey('AI_API_KEY', ai.apiKey);
             if (ai.baseUrl !== undefined) updateKey('AI_BASE_URL', ai.baseUrl);
             if (ai.model !== undefined) updateKey('AI_MODEL', ai.model);

             if (ai.prompts) {
                if (ai.prompts.widget !== undefined) updateKey('AI_PROMPT_WIDGET', ai.prompts.widget);
                if (ai.prompts.normalize !== undefined) updateKey('AI_PROMPT_NORMALIZE', ai.prompts.normalize);
                if (ai.prompts.admin !== undefined) updateKey('AI_PROMPT_ADMIN', ai.prompts.admin);
             }
        }

        fs.writeFileSync(envPath, envContent);
        console.log('[Config] Updated .env file');

        res.json({ success: true, message: 'Configuration updated and saved to .env' });
    } catch (e) {
        console.error('[Config] Failed to write .env', e);
        res.json({ success: true, message: 'Configuration updated (Runtime only - .env write failed)' });
    }
});
