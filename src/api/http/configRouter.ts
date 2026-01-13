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
            prompts: config.ai.prompts
        },
        multiSession: config.multiSession
    });
});

// Update configs
configRouter.post('/', async (req, res) => {
    const { displayDuration, aiPrompts, multiSession } = req.body;

    // 1. Update Runtime Config
    if (displayDuration) {
        if (displayDuration.widget) config.displayDuration.widget = parseInt(displayDuration.widget);
        if (displayDuration.index) config.displayDuration.index = parseInt(displayDuration.index);
    }

    if (aiPrompts) {
        if (aiPrompts.widget) config.ai.prompts.widget = aiPrompts.widget;
        // Add user custom prompt if needed in future
    }

    if (multiSession) {
        if (multiSession.breakDuration) {
            config.multiSession.breakDuration = parseInt(multiSession.breakDuration);
        }
    }

    // 2. Try to persist to .env (Simple regex replacement)
    const envPath = path.resolve(process.cwd(), '.env');
    try {
        let envContent = fs.readFileSync(envPath, 'utf-8');

        // Helper to replace or append
        const updateKey = (key: string, value: string) => {
            const regex = new RegExp(`^${key}=.*`, 'm');
            if (regex.test(envContent)) {
                envContent = envContent.replace(regex, `${key}=${value}`);
            } else {
                envContent += `\n${key}=${value}`;
            }
        };

        if (displayDuration) {
            if (displayDuration.widget) updateKey('DISPLAY_DURATION_WIDGET', displayDuration.widget);
            if (displayDuration.index) updateKey('DISPLAY_DURATION_INDEX', displayDuration.index);
        }

        if (multiSession && multiSession.breakDuration) {
            updateKey('BREAK_DURATION', multiSession.breakDuration);
        }

        if (aiPrompts) {
            // Handle multiline/quote escaping for prompts is tricky, skipping for safety or doing basic
            // For simplicity in this demo, we only persist numbers. Prompts are runtime only or advanced TODO.
            // If user really wants to persist prompts, we need better .env parsing/serializing.
            if (aiPrompts.widget) {
                // Very simple escaping for one line
                let safePrompt = JSON.stringify(aiPrompts.widget); // Adds quotes
                // .env values usually need to be "..." if they contain newlines
                // Regex replacement for complex multiline values is risky in simple string manipulation without a parser lib.
                // We will try to update it using the same JSON.stringify format which usually works for dotenv
                // But existing .env has manual format.
                // Let's Skip persisting Prompts to file to avoid corruption, only persist Durations for now.
            }
        }

        fs.writeFileSync(envPath, envContent);
        console.log('[Config] Updated .env file');

        res.json({ success: true, message: 'Configuration updated' });
    } catch (e) {
        console.error('[Config] Failed to write .env', e);
        res.json({ success: true, message: 'Configuration updated (Runtime only)' });
    }
});
