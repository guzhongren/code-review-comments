import * as vscode from 'vscode';
import * as path from 'path';

export interface GitInfo {
    commitHash: string;
    parentHash: string;
    relativeFileName: string;
}

export async function getGitInfoForUri(uri: vscode.Uri): Promise<GitInfo | undefined> {
    let commitHash: string;
    let parentHash: string;
    let relativeFileName: string;

    let queryParams: any;
    try {
        queryParams = JSON.parse(uri.query);
    } catch (e: any) {
        vscode.window.showErrorMessage(`Failed to parse Git URI query: ${e.message}`);
        return undefined;
    }
    commitHash = queryParams.ref || '';

    if (!commitHash) {
        vscode.window.showErrorMessage('Could not determine commit hash from Git URI. Please ensure the file is part of a valid Git commit.');
        return undefined;
    }

    const gitExtension = vscode.extensions.getExtension('vscode.git');
    if (!gitExtension) {
        vscode.window.showErrorMessage('Git extension not found. Please ensure Git extension is enabled.');
        return undefined;
    }
    const git = gitExtension.exports;
    const api = git.getAPI(1);
    if (!api) {
        vscode.window.showErrorMessage('Git API not ready.');
        return undefined;
    }
    const repository = api.getRepository(uri);

    if (!repository) {
        vscode.window.showErrorMessage('Could not find Git repository for the current file.');
        return undefined;
    }

    relativeFileName = path.relative(repository.rootUri.fsPath, uri.fsPath);

    parentHash = queryParams.base || '';

    if (!parentHash) {
        try {
            const commit = await repository.getCommit(commitHash);
            if (commit && commit.parents && commit.parents.length > 0) {
                parentHash = commit.parents[0];
            } else {
                vscode.window.showErrorMessage('Could not determine parent commit hash.');
                return undefined;
            }
        } catch (e: any) {
            vscode.window.showErrorMessage(`Error getting parent commit: ${e.message}`);
            return undefined;
        }
    }

    return { commitHash, parentHash, relativeFileName };
}
