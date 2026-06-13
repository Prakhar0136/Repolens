// apps/api-server/src/index.ts
import express from 'express';
import cors from 'cors';
import { Queue } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.use(cors());
app.use(express.json());

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

// Initialize the BullMQ Queue (The Producer)
// This must point to the exact same string name ('repo-ingestion') as our background-worker
const repoQueue = new Queue('repo-ingestion', {
    connection: {
        host: REDIS_HOST,
        port: REDIS_PORT,
    }
});

/**
 * Endpoint 1: Ingest a New GitHub Repository
 * Why it's needed: Accepts a URL, creates a DB entry tracking it, 
 * and notifies the worker via Redis.
 */
app.post('/api/repo/ingest', async (req, res) => {
    const { githubUrl, name } = req.body;

    if (!githubUrl) {
        return res.status(400).json({ error: 'GitHub repository URL is required.' });
    }

    try {
        // 1. Create a placeholder entry inside PostgreSQL to track state
        const repo = await prisma.repository.create({
            data: {
                name: name || 'Unnamed Repository',
                githubUrl: githubUrl,
                userId: 'system-user-placeholder', // Temporary fallback until auth phase
                status: 'PENDING'
            }
        });

        // 2. Push the job onto our BullMQ conveyor belt
        await repoQueue.add('analyze-repo', {
            repoId: repo.id,
            githubUrl: githubUrl
        });

        return res.status(202).json({
            message: 'Repository added to background processing pipeline.',
            repositoryId: repo.id,
            status: 'PENDING'
        });
    } catch (error) {
        console.error('Ingestion endpoint error:', error);
        return res.status(500).json({ error: 'Internal server error occurred.' });
    }
});

/**
 * Endpoint 2: Semantic Code Search via AI Vectors
 * Why it's needed: Converts natural language questions into numbers 
 * and runs a cosine similarity calculation inside Postgres.
 */
app.post('/api/repo/:repoId/search', async (req, res) => {
    const { repoId } = req.params;
    const { query } = req.body;

    if (!query) {
        return res.status(400).json({ error: 'Search query string is required.' });
    }

    try {
        // 1. Convert the user's plain English query into an AI vector array
        const aiResponse = await ai.models.embedContent({
            model: 'text-embedding-004',
            contents: query,
        });

        const queryVector = aiResponse.embeddings?.[0]?.values;

        if (!queryVector || queryVector.length === 0) {
            return res.status(500).json({ error: 'Failed to compute vector representation of query.' });
        }

        // 2. Native Cosine Distance Query inside pgvector
        // The `<=>` operator is specific to pgvector. It calculates the cosine distance between arrays.
        // We order by distance ascending to find the absolute closest matches.
        const searchResults: any[] = await prisma.$queryRaw`
      SELECT 
        c."id", 
        c."content", 
        c."lineStart", 
        c."lineEnd",
        f."path" as "filePath",
        f."language",
        (c."embedding" <=> ${queryVector}::vector) as "distance"
      FROM "CodeChunk" c
      JOIN "CodeFile" f ON c."fileId" = f."id"
      WHERE f."repositoryId" = ${repoId}
      ORDER BY c."embedding" <=> ${queryVector}::vector ASC
      LIMIT 5;
    `;

        // 3. Return the 5 most contextually relevant parts of the code
        return res.status(200).json({ results: searchResults });
    } catch (error) {
        console.error('Semantic search query error:', error);
        return res.status(500).json({ error: 'Internal database search failure.' });
    }
});

/**
 * Endpoint 3: Fetch Visual Graph Data
 * Why it's needed: The React frontend needs a list of all files (nodes) 
 * and their connections (edges) to draw the visual map.
 */
app.get('/api/repo/:repoId/graph', async (req, res) => {
    const { repoId } = req.params;

    try {
        // 1. Fetch all the 'buildings' (Files)
        const files = await prisma.codeFile.findMany({
            where: { repositoryId: repoId },
            select: {
                id: true,
                path: true,
                name: true,
                language: true,
            }
        });

        // 2. Fetch all the 'roads' (Dependencies)
        const edges = await prisma.dependencyEdge.findMany({
            where: {
                repositoryId: repoId
            },
            select: {
                id: true,
                sourceFileId: true,
                targetFileId: true,
            }
        });

        // 3. Send the package back to the frontend
        return res.status(200).json({
            nodes: files,
            edges: edges
        });

    } catch (error) {
        console.error('Error fetching graph data:', error);
        return res.status(500).json({ error: 'Failed to load visual map data.' });
    }
});

const PORT = process.env.PORT || 3001;

// Ensure a baseline fallback user exists so repo relationships don't break
await prisma.user.upsert({
    where: { id: 'system-user-placeholder' },
    update: {},
    create: {
        id: 'system-user-placeholder',
        email: 'system@repolens.internal',
    },
});

/**
 * Endpoint 4: Check Repository Ingestion Status
 * Why it's needed: The frontend needs to check if the repository is still processing,
 * has failed, or is ready to render its visual graph canvas.
 */
app.get('/api/repo/:repoId/status', async (req, res) => {
    const { repoId } = req.params;

    try {
        const repo = await prisma.repository.findUnique({
            where: { id: repoId },
            select: {
                id: true,
                status: true,
                name: true,
            }
        });

        if (!repo) {
            return res.status(404).json({ error: 'Repository tracking ticket not found.' });
        }

        return res.status(200).json({ status: repo.status, name: repo.name });
    } catch (error) {
        console.error('Status fetching error:', error);
        return res.status(500).json({ error: 'Failed to look up processing status.' });
    }
});

app.listen(PORT, () => {
    console.log(`🌐 RepoLens API Server listening cleanly on port ${PORT}`);
});