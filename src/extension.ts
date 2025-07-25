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

        if (editor.document.uri.scheme === 'git') {
            // Adding comment from a Git diff view (right side)
            const uri = editor.document.uri;
            let queryParams: any;
            try {
                queryParams = JSON.parse(uri.query);
            } catch (e: any) {
                vscode.window.showErrorMessage(`Failed to parse Git URI query: ${e.message}`);
                return;
            }
            commitHash = queryParams.ref || ''; // 'ref' is the commit hash for git: URIs

            // Ensure commitHash is not empty before proceeding
            if (!commitHash) {
                vscode.window.showErrorMessage('Could not determine commit hash from Git URI. Please ensure the file is part of a valid Git commit.');
                return;
            }

            // The path for a git: URI is typically /<repo_root_path>/<relative_file_path>
            // We need to get the relative file path from the workspace root
            // Try to get the Git API
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (!gitExtension) {
                vscode.window.showErrorMessage('Git extension not found. Please ensure Git extension is enabled.');
                return;
            }
            const git = gitExtension.exports;
            const api = git.getAPI(1); // Get Git API version 1
            if (!api) {
                vscode.window.showErrorMessage('Git API not ready.');
                return;
            }
            const repository = api.getRepository(uri);

            if (!repository) {
                vscode.window.showErrorMessage('Could not find Git repository for the current file.');
                return;
            }

            // The uri.path for a git: URI is typically /<repo_root_path>/<relative_file_path>
            // We need to make it relative to the repository root
            relativeFileName = path.relative(repository.rootUri.fsPath, uri.fsPath);

            // For git: URIs, the parent hash is usually the base of the diff.
            // The 'ref' in the query is the commit hash of the *modified* file.
            // We need to get the parent of that commit.
            // This might require fetching the commit object and getting its parent.
            // For now, we'll assume the parent hash is available via the query or can be derived.
            // For a simple diff, the 'ref' is the new commit, and the 'parent' is the old commit.
            // The Git URI query parameters can be complex. Let's try to extract the base commit if available.
            parentHash = queryParams.base || ''; // 'base' might be the parent commit hash

            if (!parentHash) {
                // Fallback: if 'base' is not present, try to get the parent from the Git API
                try {
                    const commit = await repository.getCommit(commitHash);
                    if (commit && commit.parents && commit.parents.length > 0) {
                        parentHash = commit.parents[0];
                    } else {
                        vscode.window.showErrorMessage('Could not determine parent commit hash.');
                        return;
                    }
                } catch (e: any) {
                    vscode.window.showErrorMessage(`Error getting parent commit: ${e.message}`);
                    return;
                }
            }

        } else if (editor.document.uri.scheme === 'file') {
            // Adding comment from a regular file editor
            const blameResult = await commentManager.getBlameCommitForLine(editor.document.uri, position.line + 1);
            if (!blameResult) {
                vscode.window.showErrorMessage('Could not get Git blame information for the current line.');
                return;
            }
            commitHash = blameResult.commitHash;
            parentHash = blameResult.parentHash;
            relativeFileName = vscode.workspace.asRelativePath(editor.document.fileName); // Convert to relative
        } else {
            // Handle other schemes if necessary, or show an error
            vscode.window.showErrorMessage(`Unsupported document scheme: ${editor.document.uri.scheme}`);
            return;
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

        const originalUri = vscode.Uri.parse(`git:${absoluteFileName}?${JSON.stringify({ path: absoluteFileName, ref: comment.parentHash })}`);
        const modifiedUri = vscode.Uri.file(absoluteFileName);

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
