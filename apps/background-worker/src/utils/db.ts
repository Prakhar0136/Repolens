// apps/background-worker/src/utils/db.ts
import { PrismaClient } from '@prisma/client';
import { generateEmbedding } from './ai.js';

// Instantiate the Prisma Client to talk to PostgreSQL
const prisma = new PrismaClient();

export async function saveRepositoryData(
    repoId: string,
    parsedFiles: any[]
) {
    console.log(`Starting DB save for ${parsedFiles.length} files...`);

    for (const file of parsedFiles) {
        // 1. Save the file metadata (name, path, language)
        const dbFile = await prisma.codeFile.create({
            data: {
                repositoryId: repoId,
                path: file.path,
                name: file.name,
                language: file.language,
                totalLines: file.totalLines,
            }
        });

        // 2. The Chunking Process
        // We split the file content by newlines, and group them into 50-line chunks.
        const lines = file.content.split('\n');
        const CHUNK_SIZE = 50;

        for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
            const chunkLines = lines.slice(i, i + CHUNK_SIZE);
            const chunkContent = chunkLines.join('\n');

            // Skip empty chunks to save AI API calls
            if (chunkContent.trim().length === 0) continue;

            // Ask Gemini for the mathematical representation of this specific 50-line block
            const vector = await generateEmbedding(chunkContent);

            if (vector.length > 0) {
                // 3. Save the Chunk and Vector using Raw SQL
                // Prisma doesn't natively support the pgvector extension perfectly yet,
                // so we use raw PostgreSQL commands to inject the array into the database.
                await prisma.$executeRaw`
          INSERT INTO "CodeChunk" ("id", "fileId", "content", "lineStart", "lineEnd", "embedding")
          VALUES (
            gen_random_uuid(), 
            ${dbFile.id}::text, 
            ${chunkContent}, 
            ${i + 1}, 
            ${i + chunkLines.length}, 
            ${vector}::vector
          )
        `;
            }
        }
    }

    console.log(`Finished saving files and AI embeddings to database.`);
}