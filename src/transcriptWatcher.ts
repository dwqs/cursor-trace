import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { SessionProvider } from './sessionProvider';
import { WebviewPanel } from './webviewPanel';

export class TranscriptWatcher {
  private watcher: vscode.FileSystemWatcher | undefined;
  private debounceTimer: NodeJS.Timeout | undefined;

  constructor(private sessionProvider: SessionProvider) {}

  start(): void {
    const projectsDir = path.join(os.homedir(), '.cursor', 'projects');
    const pattern = new vscode.RelativePattern(
      vscode.Uri.file(projectsDir),
      '**/agent-transcripts/**/*.jsonl',
    );

    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

    const debouncedRefresh = () => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.sessionProvider.refresh();
        WebviewPanel.refreshAll();
      }, 1000);
    };

    this.watcher.onDidCreate(debouncedRefresh);
    this.watcher.onDidChange(debouncedRefresh);
    this.watcher.onDidDelete(debouncedRefresh);
  }

  dispose(): void {
    this.watcher?.dispose();
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }
}
