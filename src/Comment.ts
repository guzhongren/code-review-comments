export interface Comment {
    id: string;
    content: string;
    fileName: string;
    lineNumber: number;
    hash: string;
    parentHash: string;
    createdAt: string;
    completed: boolean;
}
