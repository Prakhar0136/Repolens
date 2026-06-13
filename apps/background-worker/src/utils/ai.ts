// apps/background-worker/src/utils/ai.ts
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

// Initialize the Gemini client using the new standard SDK
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not defined');
}

const ai = new GoogleGenAI({ apiKey });

/**
 * Takes a string of code and asks Gemini to convert it into a vector array.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
    try {
        // We use "text-embedding-004", Google's optimized model for semantic search
        const response = await ai.models.embedContent({
            model: 'text-embedding-004',
            contents: text,
        });

        // The API returns the mathematical representation of the text
        return response.embeddings?.[0]?.values || [];
    } catch (error) {
        console.error("Failed to generate embedding from Gemini:", error);
        return [];
    }
}