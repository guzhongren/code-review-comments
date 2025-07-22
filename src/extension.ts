import * as vscode from 'vscode';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

import { CommentProvider } from './CommentProvider';
import { StorageManager } from './StorageManager';
import { Comment } from './Comment';
import { GitExtension, API, LogOptions } from './git';
import { DiffContentProvider } from './DiffContentProvider';

function getGitApi(): API | undefined {
    try {
        const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
        if (extension) {
            return extension.exports.getAPI(1);
        }
    } catch (error) {
        console.error("Failed to get Git API:", error);
    }
    return undefined;
}

export function activate(context: vscode.ExtensionContext) {

    const storageManager = new StorageManager();
    const commentProvider = new CommentProvider(storageManager);
    const diffContentProvider = new DiffContentProvider();

    const bellDecorationType = vscode.window.createTextEditorDecorationType({
        gutterIconPath: context.asAbsolutePath(path.join('icon', 'bell.svg')),
        gutterIconSize: 'contain'
    });

    function updateDecorations(editor: vscode.TextEditor | undefined) {
        if (!editor) {
            return;
        }

        if (editor.document.uri.scheme !== DiffContentProvider.scheme) {
            editor.setDecorations(bellDecorationType, []);
            return;
        }

        const query = JSON.parse(editor.document.uri.query);
        const comments = storageManager.readComments();
        const decorations: vscode.DecorationOptions[] = [];

        for (const comment of comments) {
            const commentFileUri = vscode.Uri.file(path.join(query.repoRoot, query.relativePath));
            if (comment.fileUri.toString() === commentFileUri.toString() && comment.commitHash === query.commitHash) {
                const position = new vscode.Position(comment.lineNumber, 0);
                decorations.push({ range: new vscode.Range(position, position) });
            }
        }
        editor.setDecorations(bellDecorationType, decorations);
    }

    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(DiffContentProvider.scheme, diffContentProvider)
    );

    vscode.window.registerTreeDataProvider('diff-comments-view', commentProvider);

    context.subscriptions.push(vscode.commands.registerCommand('diff-comments.refresh', () => {
        commentProvider.refresh();
        updateDecorations(vscode.window.activeTextEditor);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('diff-comments.addComment', async () => {
        const editor = vscode.window.activeTextEditor;
        const git = getGitApi();

        if (!editor) {
            vscode.window.showErrorMessage("No active editor found.");
            return;
        }

        if (!git) {
            vscode.window.showErrorMessage("Git extension is not available.");
            return;
        }

        const position = editor.selection.active;
        const repo = git.getRepository(editor.document.uri);

        if (!repo) {
            vscode.window.showErrorMessage("Couldn't find a git repository for the current file.");
            return;
        }

        let commitHash = repo.state.HEAD?.commit || 'HEAD';

        // Check if we're in a diff view by examining the editor's URI
        let parentHash: string | undefined;
        let actualFileUri = editor.document.uri;
        let isInDiffView = false;

        // If the editor is showing a diff content provider scheme, extract the actual file URI and commit info
        if (editor.document.uri.scheme === DiffContentProvider.scheme) {
            isInDiffView = true;
            try {
                const query = JSON.parse(editor.document.uri.query);
                if (query.relativePath && query.repoRoot) {
                    actualFileUri = vscode.Uri.file(path.join(query.repoRoot, query.relativePath));
                }
                if (query.commitHash) {
                    commitHash = query.commitHash;
                }
            } catch (error) {
                console.warn("Failed to parse diff content URI:", error);
            }
        }

        // Determine the appropriate parent hash based on context
        try {
            if (isInDiffView) {
                // In diff view: use the commit being viewed and its parent
                if (commitHash !== 'HEAD') {
                    const commit = await repo.getCommit(commitHash);
                    if (commit.parents.length > 0) {
                        parentHash = commit.parents[0];
                    }
                } else {
                    // If viewing HEAD in diff, use HEAD and its parent
                    const commits = await repo.getCommits({ maxResults: 2 });
                    if (commits.length > 1) {
                        commitHash = commits[0].hash;
                        parentHash = commits[1].hash;
                    } else if (commits.length === 1 && commits[0].parents.length > 0) {
                        commitHash = commits[0].hash;
                        parentHash = commits[0].parents[0];
                    }
                }
            } else {
                // In normal file view: find the last commit that modified this file
                const relativePath = path.relative(repo.rootUri.fsPath, actualFileUri.fsPath);

                try {
                    const fileCommits = await repo.log({ maxEntries: 2, path: relativePath });
                    if (fileCommits.length > 0) {
                        commitHash = fileCommits[0].hash;
                        if (fileCommits.length > 1) {
                            parentHash = fileCommits[1].hash;
                        } else {
                            // If only one commit for this file, get its parent
                            const commit = await repo.getCommit(fileCommits[0].hash);
                            if (commit.parents.length > 0) {
                                parentHash = commit.parents[0];
                            }
                        }
                    }
                } catch (fileGitError) {
                    console.warn("Failed to get file-specific commits, falling back to HEAD:", fileGitError);
                    // Fallback to HEAD and its parent
                    const commits = await repo.getCommits({ maxResults: 2 });
                    if (commits.length > 0) {
                        commitHash = commits[0].hash;
                        if (commits.length > 1) {
                            parentHash = commits[1].hash;
                        } else if (commits[0].parents.length > 0) {
                            parentHash = commits[0].parents[0];
                        }
                    }
                }
            }
        } catch (error) {
            console.warn("Failed to get commit/parent hash:", error);
            // Fallback to HEAD if we can't determine the specific commits
            commitHash = repo.state.HEAD?.commit || 'HEAD';
        }

        const commentText = await vscode.window.showInputBox({
            prompt: 'Enter your comment',
            placeHolder: `Comment for ${path.basename(actualFileUri.fsPath)} (${commitHash.substring(0, 7)}${parentHash ? ' → ' + parentHash.substring(0, 7) : ''})`
        });
        if (commentText) {
            console.log('Comment context:', {
                isInDiffView,
                commitHash,
                parentHash,
                fileUri: actualFileUri.toString(),
                lineNumber: position.line
            });

            const comment: Comment = {
                id: uuidv4(),
                text: commentText,
                fileUri: actualFileUri,
                lineNumber: position.line,
                commitHash: commitHash,
                parentHash: parentHash,
                completed: false,
                createdAt: new Date()
            };
            storageManager.addComment(comment);
            commentProvider.refresh();
            updateDecorations(vscode.window.activeTextEditor);

            // Show a confirmation message with the commit info
            const commitInfo = parentHash
                ? `${parentHash.substring(0, 7)} → ${commitHash.substring(0, 7)}`
                : commitHash.substring(0, 7);
            vscode.window.showInformationMessage(`Comment added for ${path.basename(actualFileUri.fsPath)} (${commitInfo})`);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('diff-comments.deleteComment', (item) => {
        storageManager.deleteComment(item.comment.id);
        commentProvider.refresh();
        updateDecorations(vscode.window.activeTextEditor);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('diff-comments.editComment', async (item) => {
        const newText = await vscode.window.showInputBox({ value: item.comment.text });
        if (newText) {
            const updatedComment = { ...item.comment, text: newText };
            storageManager.updateComment(updatedComment);
            commentProvider.refresh();
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('diff-comments.toggleCompleted', (item) => {
        storageManager.toggleCompleted(item.comment.id);
        commentProvider.refresh();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('diff-comments.jumpToComment', async (comment: Comment) => {
        const git = getGitApi();
        if (!git) {
            vscode.window.showErrorMessage("Git extension is not available.");
            return;
        }

        try {
            const rightUri = vscode.Uri.parse(comment.fileUri.toString());
            const repo = git.getRepository(rightUri);

            if (!repo) {
                vscode.window.showErrorMessage("Could not find Git repository for this file.");
                return;
            }

            const repoRoot = repo.rootUri.fsPath;
            const relativePath = path.relative(repoRoot, rightUri.fsPath);

            // Create diff view using parentHash if available
            let leftUri: vscode.Uri;
            let title: string;

            if (comment.parentHash) {
                // Show diff between parent and current commit
                const parentQuery = JSON.stringify({
                    commitHash: comment.parentHash,
                    relativePath: relativePath,
                    repoRoot: repoRoot
                });

                const currentQuery = JSON.stringify({
                    commitHash: comment.commitHash,
                    relativePath: relativePath,
                    repoRoot: repoRoot
                });

                leftUri = vscode.Uri.file(rightUri.fsPath).with({
                    scheme: DiffContentProvider.scheme,
                    query: parentQuery
                });

                const currentCommitUri = vscode.Uri.file(rightUri.fsPath).with({
                    scheme: DiffContentProvider.scheme,
                    query: currentQuery
                });

                title = `${path.basename(rightUri.fsPath)} (${comment.parentHash?.substring(0, 7)} ↔ ${comment.commitHash.substring(0, 7)})`;
                await vscode.commands.executeCommand('vscode.diff', leftUri, currentCommitUri, title);
            } else {
                // Fallback to original behavior: compare commit with workspace
                const query = JSON.stringify({
                    commitHash: comment.commitHash,
                    relativePath: relativePath,
                    repoRoot: repoRoot
                });

                leftUri = vscode.Uri.file(rightUri.fsPath).with({
                    scheme: DiffContentProvider.scheme,
                    query
                });

                title = `${path.basename(rightUri.fsPath)} (${comment.commitHash.substring(0, 7)} vs. Workspace)`;
                await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
            }

            setTimeout(() => {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    const position = new vscode.Position(comment.lineNumber, 0);
                    editor.selections = [new vscode.Selection(position, position)];
                    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
                    updateDecorations(editor);
                }
            }, 500);

        } catch (e) {
            const err = e as Error;
            vscode.window.showErrorMessage(`Failed to open diff view: ${err.message}`);
            console.error("Failed to open diff view:", err);
        }
    }));

    // Add a command to show diff info
    context.subscriptions.push(vscode.commands.registerCommand('diff-comments.showDiffInfo', async () => {
        const editor = vscode.window.activeTextEditor;
        const git = getGitApi();

        if (!editor) {
            vscode.window.showErrorMessage("No active editor found.");
            return;
        }

        if (!git) {
            vscode.window.showErrorMessage("Git extension is not available.");
            return;
        }

        const repo = git.getRepository(editor.document.uri);
        if (!repo) {
            vscode.window.showErrorMessage("Couldn't find a git repository for the current file.");
            return;
        }

        let commitHash = repo.state.HEAD?.commit || 'HEAD';
        let actualFileUri = editor.document.uri;

        // Check if we're in a diff view
        if (editor.document.uri.scheme === DiffContentProvider.scheme) {
            try {
                const query = JSON.parse(editor.document.uri.query);
                if (query.commitHash) {
                    commitHash = query.commitHash;
                }
                if (query.relativePath && query.repoRoot) {
                    actualFileUri = vscode.Uri.file(path.join(query.repoRoot, query.relativePath));
                }
            } catch (error) {
                console.warn("Failed to parse diff content URI:", error);
            }
        }

        try {
            const commit = await repo.getCommit(commitHash);
            const relativePath = path.relative(repo.rootUri.fsPath, actualFileUri.fsPath);

            const info = `**Diff Information**\n\nFile: ${relativePath}\nCommit: ${commitHash.substring(0, 7)}\nMessage: ${commit.message}\nAuthor: ${commit.authorName} <${commit.authorEmail}>\nDate: ${commit.authorDate?.toLocaleString()}`;

            vscode.window.showInformationMessage(info, { modal: true });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to get commit information: ${error}`);
        }
    }));

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            updateDecorations(editor);
        })
    );
}

export function deactivate() {}
