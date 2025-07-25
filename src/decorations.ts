import * as vscode from 'vscode';
import * as path from 'path';
import { CommentManager } from './CommentManager';
import { Comment } from './Comment';
import { DiffContentProvider } from './DiffContentProvider';

export function setupDecorations(context: vscode.ExtensionContext, commentManager: CommentManager) {
    const decorationType = vscode.window.createTextEditorDecorationType({
        gutterIconPath: context.asAbsolutePath('resources/comment.svg'),
        gutterIconSize: 'contain'
    });

    const updateDecorations = (editor: vscode.TextEditor) => {
        let commentsToDecorate: Comment[] = [];
        let targetFileName: string;
        let editorCommitHash: string | undefined;

        if (editor.document.uri.scheme === DiffContentProvider.scheme) {
            // Our custom diff editor (right side)
            targetFileName = editor.document.uri.path;
            commentsToDecorate = commentManager.getComments().filter(c =>
                path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, c.fileName) === targetFileName && !c.completed
            );
        } else if (editor.document.uri.scheme === 'git') {
            // VS Code's native Git diff view (left or right side)
            const uri = editor.document.uri;
            let queryParams: any;
            try {
                queryParams = JSON.parse(uri.query);
            } catch (e) {
                console.error('Failed to parse Git URI query in updateDecorations:', e);
                return; // Exit early if URI is malformed
            }

            editorCommitHash = queryParams.ref;
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
            if (!workspaceFolder) {
                console.error('Could not determine workspace folder for Git URI in updateDecorations.');
                return; // Exit early if no workspace folder
            }
            targetFileName = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);

            // Only decorate if the editor's commit hash matches the comment's hash (right side of diff)
            commentsToDecorate = commentManager.getComments().filter(c =>
                c.fileName === targetFileName && c.hash === editorCommitHash && !c.completed
            );
        } else if (editor.document.uri.scheme === 'file') {
            // Regular file editor
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
            if (workspaceFolder) {
                targetFileName = path.relative(workspaceFolder.uri.fsPath, editor.document.fileName);
                commentsToDecorate = commentManager.getComments().filter(c =>
                    c.fileName === targetFileName && !c.completed
                );
            } else {
                // If no workspace folder, we can't reliably get a relative path to match stored comments
                commentsToDecorate = [];
            }
        } else {
            // Any other scheme (e.g., 'untitled'), no decorations
            commentsToDecorate = [];
        }

        const decorations: vscode.DecorationOptions[] = commentsToDecorate.map(comment => {
            const position = new vscode.Position(comment.lineNumber - 1, 0);
            return {
                range: new vscode.Range(position, position),
                hoverMessage: new vscode.MarkdownString(comment.content)
            };
        });
        editor.setDecorations(decorationType, decorations);
    };

    return updateDecorations;
}
