// apps/background-worker/src/index.ts
import { Worker, Job } from 'bullmq';
import { simpleGit } from 'simple-git';
import path from 'path';
import fs from 'fs';
import { rm } from 'fs/promises';
import { parseRepositoryStructure } from './utils/parser.js';
import { saveRepositoryData } from './utils/db.js'; // <-- NEW IMPORT
import dotenv from 'dotenv';

dotenv.config();

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

console.log('🚀 RepoLens Background Worker initialized and listening for jobs...');

const repoWorker = new Worker(
    'repo-ingestion',
    async (job: Job) => {
        const { repoId, githubUrl } = job.data;
        console.log(`[Job ${job.id}] Started processing repository: ${githubUrl}`);

        const tmpClonePath = path.join(process.cwd(), 'storage', 'tmp', repoId);

        try {
            const git = simpleGit();
            await git.clone(githubUrl, tmpClonePath, ['--depth', '1']);
            console.log(`[Job ${job.id}] Successfully cloned to ${tmpClonePath}`);

            const structuralMap = parseRepositoryStructure(tmpClonePath);
            console.log(`[Job ${job.id}] AST Parsing Complete. Found ${structuralMap.length} source files.`);

            // <-- NEW: Save parsed structures and generate AI vectors
            await saveRepositoryData(repoId, structuralMap);

            await rm(tmpClonePath, { recursive: true, force: true });

            return { success: true, processedFiles: structuralMap.length };

        } catch (error: any) {
            console.error(`[Job ${job.id}] Error processing repository:`, error);
            if (fs.existsSync(tmpClonePath)) {
                await rm(tmpClonePath, { recursive: true, force: true });
            }
            throw error;
        }
    },
    {
        connection: {
            host: REDIS_HOST,
            port: REDIS_PORT,
            maxRetriesPerRequest: null,
        }
    }
);