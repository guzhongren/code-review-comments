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
    commitHash = queryParams.ref || 'HEAD';

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

    // Resolve commitHash if it's a symbolic ref (like HEAD) to actual SHA
    try {
        if (!commitHash.match(/^[0-9a-f]{40}$/i)) {
            // commitHash is not a full SHA, try to resolve it
            const commit = await repository.getCommit(commitHash);
            if (commit) {
                commitHash = commit.hash;
            } else {
                vscode.window.showErrorMessage(`Could not resolve commit reference "${commitHash}". Please ensure the file is part of a valid Git commit.`);
                return undefined;
            }
        }
    } catch (e: any) {
        vscode.window.showErrorMessage(`Error resolving commit reference: ${e.message}`);
        return undefined;
    }

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
