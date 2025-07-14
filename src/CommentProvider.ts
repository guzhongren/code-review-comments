import * as vscode from 'vscode';
import * as path from 'path';
import { Comment } from './Comment';
import { StorageManager } from './StorageManager';

export class CommentProvider implements vscode.TreeDataProvider<CommentTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<CommentTreeItem | undefined | null | void> = new vscode.EventEmitter<CommentTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<CommentTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private storageManager: StorageManager) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: CommentTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: CommentTreeItem): Thenable<CommentTreeItem[]> {
        if (element) {
            return Promise.resolve([]);
        } else {
            const comments = this.storageManager.readComments();
            const workspaceRoot = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
                ? vscode.workspace.workspaceFolders[0].uri.fsPath
                : '';

            // Sort comments: uncompleted first (by creation time desc), then completed (by creation time desc)
            const sortedComments = comments.sort((a, b) => {
                // First sort by completion status (uncompleted first)
                const aCompleted = a.completed;
                const bCompleted = b.completed;

                if (aCompleted !== bCompleted) {
                    return aCompleted ? 1 : -1; // uncompleted (false) comes before completed (true)
                }

                // Then sort by creation time (newest first)
                const aTime = a.createdAt.getTime();
                const bTime = b.createdAt.getTime();
                return bTime - aTime; // descending order (newest first)
            });

            const treeItems = sortedComments.map(comment => {
                const item = new CommentTreeItem(comment.text, vscode.TreeItemCollapsibleState.None, comment, workspaceRoot);
                item.command = {
                    command: 'diff-comments.jumpToComment',
                    title: 'Jump to Comment',
                    arguments: [comment]
                };
                return item;
            });
            return Promise.resolve(treeItems);
        }
    }
}

class CommentTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly comment: Comment,
        private readonly workspaceRoot: string
    ) {
        super(label, collapsibleState);
        const relativePath = path.relative(this.workspaceRoot, this.comment.fileUri.fsPath);

        // Set checkbox icon based on completed status
        if (this.comment.completed) {
            this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
        } else {
            this.iconPath = new vscode.ThemeIcon('circle-outline');
        }

        // Create description and tooltip with diff information
        if (this.comment.parentHash) {
            this.description = `${relativePath} (${this.comment.parentHash.substring(0, 7)} → ${this.comment.commitHash.substring(0, 7)})`;
            this.tooltip = `${this.label}\n\nFile: ${relativePath}\nDiff: ${this.comment.parentHash.substring(0, 7)} → ${this.comment.commitHash.substring(0, 7)}\nLine: ${this.comment.lineNumber + 1}`;
        } else {
            this.description = `${relativePath} (${this.comment.commitHash.substring(0, 7)})`;
            this.tooltip = `${this.label}\n\nFile: ${relativePath}\nCommit: ${this.comment.commitHash.substring(0, 7)}\nLine: ${this.comment.lineNumber + 1}`;
        }

        // Apply gray styling for completed comments
        if (this.comment.completed) {
            this.resourceUri = vscode.Uri.parse(`completed:${this.comment.id}`);
            // Use a more subtle approach by overriding the label with strikethrough
            this.label = `~~${this.label}~~`;
        }

        this.contextValue = 'comment';
    }
}
