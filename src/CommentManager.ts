import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Comment } from './Comment';

const execPromise = promisify(exec);

export class CommentManager {
    private comments: Comment[] = [];
    private storagePath: string | undefined;

    constructor() {
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            this.storagePath = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, '.vscode', 'diff-comments.yaml');
        }
        this.loadComments();
    }

    private loadComments() {
        try {
            if (this.storagePath && fs.existsSync(this.storagePath)) {
                const data = fs.readFileSync(this.storagePath, 'utf8');
                this.comments = yaml.load(data) as Comment[];
            }
        } catch (error) {
            console.error('Error loading comments:', error);
        }
    }

    private saveComments() {
        try {
            if (this.storagePath) {
                const dir = path.dirname(this.storagePath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                fs.writeFileSync(this.storagePath, yaml.dump(this.comments));
            }
        } catch (error) {
            console.error('Error saving comments:', error);
        }
    }

    public addComment(comment: Comment) {
        this.comments.push(comment);
        this.saveComments();
    }

    public getComments(): Comment[] {
        return this.comments.sort((a, b) => {
            if (a.completed === b.completed) {
                // Convert ISO strings to Date objects for comparison
                const dateA = new Date(a.createdAt);
                const dateB = new Date(b.createdAt);
                return dateB.getTime() - dateA.getTime();
            }
            return a.completed ? 1 : -1;
        });
    }

    public deleteComment(id: string) {
        this.comments = this.comments.filter(comment => comment.id !== id);
        this.saveComments();
    }

    public updateComment(updatedComment: Comment) {
        const index = this.comments.findIndex(comment => comment.id === updatedComment.id);
        if (index !== -1) {
            this.comments[index] = updatedComment;
            this.saveComments();
        }
    }

    public deleteAllComments() {
        this.comments = [];
        this.saveComments();
    }

    public toggleAllCommentsCompleted() {
        const allCompleted = this.comments.every(comment => comment.completed);
        this.comments.forEach(comment => {
            comment.completed = !allCompleted;
        });
        this.saveComments();
    }

    public async getBlameCommitForLine(fileUri: vscode.Uri, lineNumber: number): Promise<{ commitHash: string; parentHash: string } | undefined> {
        try {
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (!gitExtension) {
                vscode.window.showWarningMessage('Git extension not found.');
                return undefined;
            }
            const git = gitExtension.exports;
            const api = git.getAPI(1);

            const repo = api.getRepository(fileUri);
            if (!repo) {
                vscode.window.showWarningMessage('No Git repository found for the current file.');
                return undefined;
            }

            const repoRoot = repo.rootUri.fsPath;
            const relativeFilePath = path.relative(repoRoot, fileUri.fsPath);

            const command = `git blame --porcelain -L ${lineNumber},${lineNumber} "${relativeFilePath}"`;
            const { stdout, stderr } = await execPromise(command, { cwd: repoRoot });

            if (stderr) {
                vscode.window.showErrorMessage(`Git blame error: ${stderr}`);
                return undefined;
            }

            const lines = stdout.split('\n');
            if (lines.length > 0) {
                const commitHash = lines[0].split(' ')[0];
                let parentHash = '';

                try {
                    const commit = await repo.getCommit(commitHash);
                    if (commit && commit.parents.length > 0) {
                        parentHash = commit.parents[0];
                    }
                } catch (err) {
                    // If getting commit details fails, parentHash remains empty
                    console.error(`Failed to get parent commit for blame hash ${commitHash}:`, err);
                }

                return { commitHash, parentHash };
            }
        } catch (error) {
            console.error('Error in getBlameCommitForLine:', error);
            vscode.window.showErrorMessage('Failed to get blame information.');
        }
        return undefined;
    }


}
