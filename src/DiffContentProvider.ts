import * as vscode from 'vscode';
import * as fs from 'fs'; // Keep this for fallback
import { exec } from 'child_process';
import { promisify } from 'util';
const execPromise = promisify(exec);

export class DiffContentProvider implements vscode.TextDocumentContentProvider {
    public static readonly scheme = 'diff-comments';

    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this._onDidChange.event;

    public async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder open.');
            return `Error: No workspace folder open.`;
        }
        // uri.path is the absolute file path from the custom URI (e.g., /path/to/file.tsx)
        // We need to convert this absolute path to a path relative to the workspace folder
        // for git show command.
        let relativeFilePath = vscode.workspace.asRelativePath(uri.fsPath);

        const query = new URLSearchParams(uri.query);
        const versionHash = query.get('versionHash');

        const repoRoot = workspaceFolder.uri.fsPath;

        if (versionHash) {
            try {
                // git show command still needs the relative path within the repo
                const command = `git show ${versionHash}:${relativeFilePath}`;
                const { stdout, stderr } = await execPromise(command, { cwd: repoRoot });
                if (stderr) {
                    vscode.window.showErrorMessage(`Git error: ${stderr}`);
                    return `Error: Git error: ${stderr}`;
                }
                return stdout;
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to fetch git content: ${error.message}`);
                return `Error: Failed to fetch git content: ${error.message}`;
            }
        } else {
            // Fallback for when no versionHash is provided (e.g., current file)
            try {
                // Use uri.fsPath directly as it's the absolute path for the current file
                return fs.readFileSync(uri.fsPath, 'utf-8');
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to read current file ${uri.fsPath}: ${error}`);
                return `Error: Could not read current file ${uri.fsPath}`;
            }
        }
    }
}
