import * as vscode from 'vscode';
import { Comment } from './Comment';

export class CommentProvider implements vscode.TreeDataProvider<Comment> {

    private _onDidChangeTreeData: vscode.EventEmitter<Comment | undefined | null | void> = new vscode.EventEmitter<Comment | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<Comment | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private comments: Comment[]) { }

    refresh(comments: Comment[]): void {
        this.comments = comments;
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: Comment): vscode.TreeItem {
        const treeItem = new vscode.TreeItem(element.content, vscode.TreeItemCollapsibleState.None);
        const shortParent = element.parentHash && element.parentHash.length >= 7 ? element.parentHash.substring(0, 7) : (element.parentHash || 'n/a');
        const shortHash = element.hash && element.hash.length >= 7 ? element.hash.substring(0, 7) : (element.hash || 'n/a');
        treeItem.description = `${element.fileName}:${element.lineNumber} (${shortParent}<->${shortHash}) - ${new Date(element.createdAt).toLocaleString()}`;
        treeItem.command = {
            command: 'code-review-comments.showDiff',
            title: 'Show Diff',
            arguments: [element]
        };
        treeItem.contextValue = 'comment';
        treeItem.iconPath = new vscode.ThemeIcon(element.completed ? 'check' : 'comment');
        return treeItem;
    }

    getChildren(element?: Comment): Thenable<Comment[]> {
        if (element) {
            return Promise.resolve([]);
        }
        return Promise.resolve(this.comments);
    }
}
