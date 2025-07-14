import * as vscode from 'vscode';
import { Comment } from './Comment';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

export class StorageManager {
    private storagePath: string | undefined;
    private workspaceRoot: string | undefined;

    constructor() {
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            this.workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            this.storagePath = path.join(this.workspaceRoot, '.vscode', 'diff-comments.yaml');
            this.ensureStorageFileExists();
        } else {
            vscode.window.showErrorMessage('No workspace folder found. Cannot initialize storage.');
        }
    }

    private ensureStorageFileExists() {
        if (!this.storagePath) return;
        const dir = path.dirname(this.storagePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        if (!fs.existsSync(this.storagePath)) {
            fs.writeFileSync(this.storagePath, yaml.dump([]));
        }
    }

    public readComments(): Comment[] {
        if (!this.storagePath || !this.workspaceRoot) return [];
        try {
            const data = fs.readFileSync(this.storagePath, 'utf8');
            const commentsData = yaml.load(data) as Partial<Comment>[];
            if (!commentsData) {
                return [];
            }
            const workspaceRoot = this.workspaceRoot;

            return commentsData.map((c: Partial<Comment>) => {
                if (!c.fileUri) {
                    throw new Error('Missing fileUri in comment data');
                }
                const absolutePath = path.join(workspaceRoot, c.fileUri as unknown as string);
                return {
                    ...c,
                    fileUri: vscode.Uri.file(absolutePath),
                    completed: c.completed || false,
                    createdAt: c.createdAt ? new Date(c.createdAt) : new Date()
                } as Comment;
            });
        } catch (e) {
            if (e instanceof Error) {
                console.error(`Error reading or parsing comments YAML: ${e.message}`);
            }
            return [];
        }
    }

    public writeComments(comments: Comment[]): void {
        if (!this.storagePath || !this.workspaceRoot) return;
        const workspaceRoot = this.workspaceRoot;
        const storableComments = comments.map(c => {
            const relativePath = path.relative(workspaceRoot, c.fileUri.fsPath);
            return {
                ...c,
                fileUri: relativePath,
            };
        });
        fs.writeFileSync(this.storagePath, yaml.dump(storableComments));
    }

    public addComment(comment: Comment): void {
        const comments = this.readComments();
        comments.push(comment);
        this.writeComments(comments);
    }

    public deleteComment(commentId: string): void {
        const comments = this.readComments();
        const filteredComments = comments.filter(c => c.id !== commentId);
        this.writeComments(filteredComments);
    }

    public updateComment(updatedComment: Comment): void {
        const comments = this.readComments();
        const index = comments.findIndex(c => c.id === updatedComment.id);
        if (index !== -1) {
            comments[index] = updatedComment;
            this.writeComments(comments);
        }
    }

    public toggleCompleted(commentId: string): void {
        const comments = this.readComments();
        const index = comments.findIndex(c => c.id === commentId);
        if (index !== -1) {
            comments[index].completed = !comments[index].completed;
            this.writeComments(comments);
        }
    }
}
