import * as vscode from 'vscode';
import * as path from 'path';
import { CommentManager } from './CommentManager';
import { Comment } from './Comment';
import { CommentProvider } from './CommentProvider';
import { DiffContentProvider } from './DiffContentProvider';
import { v4 as uuidv4 } from 'uuid';

export function activate(context: vscode.ExtensionContext) {

    const commentManager = new CommentManager();
    const commentProvider = new CommentProvider(commentManager.getComments());

    vscode.window.registerTreeDataProvider('code-review-comments-view', commentProvider);

    const refreshView = () => {
        commentProvider.refresh(commentManager.getComments());
        // Also update decorations for all visible editors when comments change
        vscode.window.visibleTextEditors.forEach(editor => updateDecorations(editor));
    };

    const formatTimestampWithTimezone = (date: Date): string => {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        const milliseconds = date.getMilliseconds().toString().padStart(3, '0');

        const offset = -date.getTimezoneOffset();
        const offsetSign = offset >= 0 ? '+' : '-';
        const offsetHours = Math.floor(Math.abs(offset) / 60).toString().padStart(2, '0');
        const offsetMinutes = (Math.abs(offset) % 60).toString().padStart(2, '0');

        return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}${offsetSign}${offsetHours}:${offsetMinutes}`;
    };

    context.subscriptions.push(vscode.commands.registerCommand('code-review-comments.addComment', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const position = editor.selection.active;
        const commentText = await vscode.window.showInputBox({ prompt: 'Enter your comment' });
        if (!commentText) {
            return;
        }

        let commitHash: string;
        let parentHash: string;
        let relativeFileName: string; // Changed to relativeFileName

        if (editor.document.uri.scheme === DiffContentProvider.scheme) {
            // Adding comment from a diff view
            const query = new URLSearchParams(editor.document.uri.query);
            const versionHash = query.get('versionHash');
            relativeFileName = editor.document.uri.path; // This is already relative

            if (!versionHash) {
                vscode.window.showErrorMessage('Could not determine version hash from diff view.');
                return;
            }
            commitHash = versionHash;
            const parent = await commentManager.getParentCommitHash(commitHash, editor.document.uri);
            if (parent === undefined) {
                vscode.window.showErrorMessage('Could not get parent commit hash for the diff view version.');
                return;
            }
            parentHash = parent;

        } else {
            // Adding comment from a regular file editor
            const blameResult = await commentManager.getBlameCommitForLine(editor.document.uri, position.line + 1);
            if (!blameResult) {
                vscode.window.showErrorMessage('Could not get Git blame information for the current line.');
                return;
            }
            commitHash = blameResult.commitHash;
            parentHash = blameResult.parentHash;
            relativeFileName = vscode.workspace.asRelativePath(editor.document.fileName); // Convert to relative
        }

        const newComment: Comment = {
            id: uuidv4(),
            content: commentText,
            fileName: relativeFileName, // Store as relative
            lineNumber: position.line + 1,
            hash: commitHash,
            parentHash: parentHash,
            createdAt: formatTimestampWithTimezone(new Date()),
            completed: false
        };
        commentManager.addComment(newComment);
        refreshView();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('code-review-comments.deleteComment', (comment: Comment) => {
        commentManager.deleteComment(comment.id);
        refreshView();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('code-review-comments.refresh', () => {
        refreshView();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('code-review-comments.deleteAllComments', async () => {
        const confirm = await vscode.window.showWarningMessage(
            'Are you sure you want to delete all comments? This action cannot be undone.',
            { modal: true },
            'Delete All'
        );
        if (confirm === 'Delete All') {
            commentManager.deleteAllComments();
            refreshView();
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('code-review-comments.toggleAllCommentsCompleted', () => {
        commentManager.toggleAllCommentsCompleted();
        refreshView();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('code-review-comments.toggleCompleted', (comment: Comment) => {
        comment.completed = !comment.completed;
        commentManager.updateComment(comment);
        refreshView();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('code-review-comments.editComment', async (comment: Comment) => {
        const newCommentText = await vscode.window.showInputBox({ value: comment.content, prompt: 'Edit your comment' });
        if (newCommentText) {
            comment.content = newCommentText;
            commentManager.updateComment(comment);
            refreshView();
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('code-review-comments.showDiff', async (comment: Comment) => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder open.');
            return;
        }

        // Convert stored relative fileName to absolute for URI construction
        const absoluteFileName = path.join(workspaceFolder.uri.fsPath, comment.fileName);

        const relativeFilePathForTitle = vscode.workspace.asRelativePath(absoluteFileName);

        const originalUri = vscode.Uri.parse(`${DiffContentProvider.scheme}:${absoluteFileName}?versionHash=${comment.parentHash}`);
        const modifiedUri = vscode.Uri.parse(`${DiffContentProvider.scheme}:${absoluteFileName}?versionHash=${comment.hash}`);

        const title = `Diff: ${relativeFilePathForTitle} (${comment.parentHash.substring(0, 7)}..${comment.hash.substring(0, 7)})`;

        // Add selection to jump to the line in the modified (right) file of the diff view
        const options: vscode.TextDocumentShowOptions = {
            preview: true,
            selection: new vscode.Range(comment.lineNumber - 1, 0, comment.lineNumber - 1, 0)
        };

        await vscode.commands.executeCommand('vscode.diff', originalUri, modifiedUri, title, options);
    }));

    // Register the DiffContentProvider
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(DiffContentProvider.scheme, new DiffContentProvider()));

    // Add decoration for comments
    const decorationType = vscode.window.createTextEditorDecorationType({
        gutterIconPath: context.asAbsolutePath('resources/bell.svg'),
        gutterIconSize: 'contain'
    });

    const updateDecorations = (editor: vscode.TextEditor) => {
        let commentsToDecorate: Comment[] = [];
        let targetFileName: string;

        // Check if it's our custom diff editor
        if (editor.document.uri.scheme === DiffContentProvider.scheme) {
            const query = new URLSearchParams(editor.document.uri.query);
            const editorVersionHash = query.get('versionHash');
            // The uri.path for our custom scheme is the absolute file path
            targetFileName = editor.document.uri.path;

            // Only decorate the right side of the diff (which corresponds to the comment's 'hash')
            // and ensure the comment's hash matches the editor's version hash
            commentsToDecorate = commentManager.getComments().filter(c =>
                // Compare stored relative path with the absolute path from editor.document.uri.path
                // Need to convert comment.fileName to absolute for comparison
                path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, c.fileName) === targetFileName && c.hash === editorVersionHash
            );
        } else {
            // Regular file editor
            targetFileName = editor.document.fileName;
            commentsToDecorate = commentManager.getComments().filter(c =>
                // Compare stored relative path with the absolute path from editor.document.fileName
                // Need to convert comment.fileName to absolute for comparison
                path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, c.fileName) === targetFileName
            );
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

    // Initial decoration update for all visible editors
    vscode.window.visibleTextEditors.forEach(editor => updateDecorations(editor));

    // Update decorations when the active editor changes
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
            updateDecorations(editor);
        }
    }));

    // Update decorations when a document is saved (relevant for regular files)
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(document => {
        const editor = vscode.window.visibleTextEditors.find(e => e.document === document);
        if (editor) {
            updateDecorations(editor);
        }
    }));

    // Update decorations when visible text editors change (e.g., opening/closing diff views)
    context.subscriptions.push(vscode.window.onDidChangeVisibleTextEditors(editors => {
        editors.forEach(editor => updateDecorations(editor));
    }));
}

export function deactivate() {}
