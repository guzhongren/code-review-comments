import * as vscode from 'vscode';

export interface Comment {
  id: string;
  text: string;
  fileUri: vscode.Uri; // The URI of the file in the workspace
  lineNumber: number;
  commitHash: string; // The current commit hash when the comment was made
  parentHash?: string; // The parent commit hash for creating diff view
  originalFileUri?: vscode.Uri; // The git: URI for the original file content
  completed: boolean; // Whether the comment is marked as completed
  createdAt: Date; // When the comment was created
}
