// apps/background-worker/src/index.ts
import { Worker, Job } from 'bullmq';
import { simpleGit } from 'simple-git';
import path from 'path';
import fs from 'fs';
import { rm } from 'fs/promises';
import { PrismaClient } from '@prisma/client'; // <-- NEW IMPORT FOR DB UPDATES
import { parseRepositoryStructure } from './utils/parser.js';
import { saveRepositoryData } from './utils/db.js';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient(); // Instantiate database client

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
            // 1. Update status to PROCESSING and set progress to 10%
            await prisma.repository.update({
                where: { id: repoId },
                data: { status: 'PROCESSING' }
            });
            await job.updateProgress(10);
            console.log(`[Job ${job.id}] Status marked as PROCESSING.`);

            // 2. Clone the repository
            const git = simpleGit();
            await git.clone(githubUrl, tmpClonePath, ['--depth', '1']);
            await job.updateProgress(30); // 30% complete after clone
            console.log(`[Job ${job.id}] Successfully cloned to ${tmpClonePath}`);

            // 3. Parse AST (Abstract Syntax Tree) structures
            const structuralMap = parseRepositoryStructure(tmpClonePath);
            await job.updateProgress(50); // 50% complete after structural mapping
            console.log(`[Job ${job.id}] AST Parsing Complete. Found ${structuralMap.length} source files.`);

            // 4. Generate AI Vectors and Save to PostgreSQL
            await saveRepositoryData(repoId, structuralMap);
            await job.updateProgress(90); // 90% complete after heavy vector processing

            // 5. Clean up temporary hard drive space
            await rm(tmpClonePath, { recursive: true, force: true });

            // 6. Mark as COMPLETED in the database
            await prisma.repository.update({
                where: { id: repoId },
                data: { status: 'COMPLETED' }
            });
            await job.updateProgress(100);
            console.log(`[Job ${job.id}] Final Status marked as COMPLETED.`);

            return { success: true, processedFiles: structuralMap.length };

        } catch (error: any) {
            console.error(`[Job ${job.id}] Error processing repository:`, error);

            // CRITICAL: If anything fails, catch the error and record 'FAILED' state so user knows!
            await prisma.repository.update({
                where: { id: repoId },
                data: { status: 'FAILED' }
            });

            // Cleanup local disk if files exist
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