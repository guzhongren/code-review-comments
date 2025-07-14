import * as vscode from 'vscode';
import { exec } from 'child_process';

// Helper function to run shell commands
function execShell(command: string, options: { cwd: string }): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        exec(command, options, (error, stdout, stderr) => {
            if (error) {
                // git show can return an error for empty files, but stdout is still valid.
                // It also returns an error for binary files. For now, we'll just resolve.
                if (stdout) {
                    resolve({ stdout, stderr });
                } else {
                    reject({ error, stdout, stderr });
                }
            } else {
                resolve({ stdout, stderr });
            }
        });
    });
}

export class DiffContentProvider implements vscode.TextDocumentContentProvider {
    public static readonly scheme = 'diff-comment-content';

    public async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        try {
            const { commitHash, relativePath, repoRoot } = JSON.parse(uri.query);

            if (!commitHash || !relativePath || !repoRoot) {
                throw new Error('Missing required parameters in URI query.');
            }

            const gitShowCommand = `git show ${commitHash}:${relativePath}`;
            const { stdout: fileContent, stderr } = await execShell(gitShowCommand, { cwd: repoRoot });

            if (stderr && stderr.length > 0) {
                if (stderr.includes('exists on disk, but not in')) {
                    return `// File not found in commit ${commitHash.substring(0, 7)}\n// Path: ${relativePath}`;
                }
                return `// Error fetching file content:\n// ${stderr}`;
            }

            return fileContent;
        } catch (e) {
            const err = e as Error & { stderr?: string };
            const errorMessage = err.stderr || err.message || 'An unknown error occurred.';
            console.error("Failed to provide text document content:", err);
            return `// Failed to get content for diff: ${errorMessage}`;
        }
    }
}
