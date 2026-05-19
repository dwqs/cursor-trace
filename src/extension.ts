import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SessionProvider, SessionTreeItem } from './sessionProvider';
import { TranscriptWatcher } from './transcriptWatcher';
import { WebviewPanel } from './webviewPanel';
import { exportSessionHtml } from './exportHtml';
import { SessionItem } from './types';

let watcher: TranscriptWatcher | undefined;

function deleteDirRecursive(dirPath: string): void {
  if (!fs.existsSync(dirPath)) return;
  for (const entry of fs.readdirSync(dirPath)) {
    const fullPath = path.join(dirPath, entry);
    if (fs.statSync(fullPath).isDirectory()) {
      deleteDirRecursive(fullPath);
    } else {
      fs.unlinkSync(fullPath);
    }
  }
  fs.rmdirSync(dirPath);
}

export function activate(context: vscode.ExtensionContext) {
  const sessionProvider = new SessionProvider();
  const treeView = vscode.window.createTreeView('cursorTrace.sessions', {
    treeDataProvider: sessionProvider,
    showCollapseAll: true,
  });

  watcher = new TranscriptWatcher(sessionProvider);
  watcher.start();

  context.subscriptions.push(
    treeView,
    vscode.commands.registerCommand('cursorTrace.refreshSessions', () => {
      sessionProvider.refresh();
    }),
    vscode.commands.registerCommand('cursorTrace.openSession', (item: SessionItem) => {
      WebviewPanel.show(context, item);
    }),
    vscode.commands.registerCommand('cursorTrace.exportHtml', (item: SessionItem) => {
      exportSessionHtml(item);
    }),
    vscode.commands.registerCommand('cursorTrace.deleteSession', async (treeItem: SessionTreeItem) => {
      const info = treeItem.sessionInfo;
      if (!info) return;
      const confirm = await vscode.window.showWarningMessage(
        `Delete session ${info.id.slice(0, 8)}...?`,
        { modal: true },
        'Delete',
      );
      if (confirm !== 'Delete') return;
      const sessionDir = path.dirname(info.filePath);
      deleteDirRecursive(sessionDir);
      sessionProvider.refresh();
    }),
    vscode.commands.registerCommand('cursorTrace.deleteProjectSessions', async (treeItem: SessionTreeItem) => {
      const children = treeItem.sessionChildren;
      if (!children || children.length === 0) return;
      const projectName = treeItem.label;
      const confirm = await vscode.window.showWarningMessage(
        `Delete all ${children.length} sessions under "${projectName}"?`,
        { modal: true },
        'Delete All',
      );
      if (confirm !== 'Delete All') return;
      for (const child of children) {
        if (child.sessionInfo) {
          const sessionDir = path.dirname(child.sessionInfo.filePath);
          deleteDirRecursive(sessionDir);
        }
      }
      sessionProvider.refresh();
    }),
    { dispose: () => watcher?.dispose() },
  );
}

export function deactivate() {
  watcher?.dispose();
}
