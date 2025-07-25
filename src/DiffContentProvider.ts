import * as vscode from 'vscode';

export class DiffContentProvider implements vscode.TextDocumentContentProvider {
    public static readonly scheme = 'diff-comments';

    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this._onDidChange.event;

    public async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        // This provider is no longer used for fetching git content directly.
        // The 'vscode.diff' command now handles 'git:' URIs.
        // If this provider is still being called, it indicates an unexpected scenario.
        vscode.window.showErrorMessage(`DiffContentProvider called for URI: ${uri.toString()}. This should not happen for Git diffs.`);
        return `Error: DiffContentProvider is deprecated for Git content. URI: ${uri.toString()}`;
    }
}
