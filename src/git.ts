import { Uri, Event, SourceControl, QuickPickItem } from 'vscode';

export interface GitExtension {
    readonly enabled: boolean;
    readonly onDidChangeEnablement: Event<boolean>;
    readonly state: 'uninitialized' | 'initialized';
    readonly onDidChangeState: Event<'uninitialized' | 'initialized'>;
    readonly onDidOpenRepository: Event<Repository>;
    readonly onDidCloseRepository: Event<Repository>;

    getAPI(version: 1): API;
    getRepositories(): Repository[];
    getRepository(uri: Uri): Repository | undefined;
}

export interface API {
    readonly state: 'uninitialized' | 'initialized';
    readonly onDidChangeState: Event<'uninitialized' | 'initialized'>;
    readonly onDidOpenRepository: Event<Repository>;
    readonly onDidCloseRepository: Event<Repository>;
    readonly repositories: Repository[];
    readonly git: Git;

    getRepository(uri: Uri): Repository | null;
    openRepository(path: string): Promise<Repository | null>;
    close(repository: Repository): Promise<void>;
}

export interface Git {
    readonly path: string;
    readonly version: string;
    readonly onDidChangeGitState: Event<void>;
}

export interface Repository {
    readonly rootUri: Uri;
    readonly inputBox: SourceControl;
    readonly state: RepositoryState;
    readonly onDidChangeState: Event<void>;

    getBranch(name: string): Promise<Branch | undefined>;
    getBranches(query?: string): Promise<Branch[]>;
    getCommit(hash: string): Promise<Commit>;
    getCommits(options?: unknown): Promise<Commit[]>;
    log(options?: LogOptions): Promise<Commit[]>;
    // ... and many more git operations
}

export interface LogOptions {
    maxEntries?: number;
    path?: string;
    range?: string;
}

export interface RepositoryState {
    readonly HEAD: Branch | undefined;
    readonly remotes: Remote[];
    readonly submodules: Submodule[];
    readonly rebaseCommit: Commit | undefined;
    readonly mergeChanges: Change[];
    readonly indexChanges: Change[];
    readonly workingTreeChanges: Change[];
    readonly onDidChange: Event<void>;
}

export interface Branch extends QuickPickItem {
    readonly name: string;
    readonly commit: string | undefined;
    readonly upstream?: Upstream;
    readonly ahead?: number;
    readonly behind?: number;
}

export interface Upstream extends QuickPickItem {
    readonly remote: string;
    readonly name: string;
}

export interface Commit {
    readonly hash: string;
    readonly message: string;
    readonly parents: string[];
    readonly authorDate?: Date;
    readonly authorName?: string;
    readonly authorEmail?: string;
    readonly commitDate?: Date;
    readonly commitName?: string;
    readonly commitEmail?: string;
}

export interface Remote {
    readonly name: string;
    readonly fetchUrl?: string;
    readonly pushUrl?: string;
    readonly isReadOnly: boolean;
}

export interface Submodule {
    readonly name: string;
    readonly path: string;
    readonly url: string;
}

export interface Change {
    readonly uri: Uri;
    readonly originalUri: Uri;
    readonly renameUri: Uri | undefined;
    readonly status: Status;
}

export enum Status {
    INDEX_MODIFIED,
    INDEX_ADDED,
    INDEX_DELETED,
    INDEX_RENAMED,
    INDEX_COPIED,
    MODIFIED,
    DELETED,
    UNTRACKED,
    IGNORED,
    BOTH_DELETED,
    BOTH_ADDED,
    BOTH_MODIFIED,
    CONFLICT
}
