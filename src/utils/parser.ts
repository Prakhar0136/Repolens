// src/utils/parser.ts
import { Project, SourceFile } from 'ts-morph';
import path from 'path';

interface ParsedFile {
    path: string;
    name: string;
    language: string;
    totalLines: number;
    content: string;
    dependencies: string[]; // Relative paths of files this file imports
}

export function parseRepositoryStructure(repoLocalPath: string): ParsedFile[] {
    // Initialize a virtual ts-morph project pointing to the cloned repository folder
    const project = new Project();
    project.addSourceFilesAtPaths([
        path.join(repoLocalPath, 'src/**/*.{ts,tsx,js,jsx}'),
        path.join(repoLocalPath, 'packages/**/*.{ts,tsx,js,jsx}'),
    ]);

    const sourceFiles = project.getSourceFiles();
    const parsedFiles: ParsedFile[] = [];

    for (const file of sourceFiles) {
        const filePath = file.getFilePath();
        // Normalize path relative to the repo root folder
        const relativePath = path.relative(repoLocalPath, filePath);
        const imports: string[] = [];

        // Analyze imports
        file.getImportDeclarations().forEach((importDecl) => {
            const moduleSpecifier = importDecl.getModuleSpecifierValue();

            // We only care about local relative imports (e.g., "./Button" or "../utils")
            if (moduleSpecifier.startsWith('.')) {
                // Resolve the absolute path of the imported module
                const resolvedPath = path.resolve(path.dirname(filePath), moduleSpecifier);
                let relImportedPath = path.relative(repoLocalPath, resolvedPath);

                // Ensure standard file extension handling defaults if missing
                if (!relImportedPath.match(/\.(ts|tsx|js|jsx)$/)) {
                    relImportedPath += '.ts'; // Fallback approximation for graph building
                }
                imports.push(relImportedPath);
            }
        });

        parsedFiles.push({
            path: relativePath,
            name: path.basename(filePath),
            language: path.extname(filePath).replace('.', '') || 'javascript',
            totalLines: file.getFullText().split('\n').length,
            content: file.getFullText(),
            dependencies: imports
        });
    }

    return parsedFiles;
}