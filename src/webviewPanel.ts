import * as vscode from 'vscode';
import * as fs from 'fs';
import { parseTranscript } from './transcriptParser';
import { SessionItem, SessionInfo } from './types';
import { getViewerHtml } from './viewerHtml';

interface PanelEntry {
  panel: vscode.WebviewPanel;
  sessionInfo: SessionInfo;
  lastSize: number;
}

export class WebviewPanel {
  private static panels = new Map<string, PanelEntry>();
  private static pollTimer: NodeJS.Timeout | undefined;

  static show(context: vscode.ExtensionContext, item: SessionItem): void {
    if (!item.sessionInfo) return;

    const sessionId = item.sessionInfo.id;
    const existing = WebviewPanel.panels.get(sessionId);
    if (existing) {
      existing.panel.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'cursorTrace.viewer',
      `Trace: ${item.sessionInfo.projectName}`,
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    const fileSize = WebviewPanel.getFileSize(item.sessionInfo.filePath);
    WebviewPanel.panels.set(sessionId, { panel, sessionInfo: item.sessionInfo, lastSize: fileSize });
    panel.onDidDispose(() => {
      WebviewPanel.panels.delete(sessionId);
      if (WebviewPanel.panels.size === 0) {
        WebviewPanel.stopPolling();
      }
    });

    WebviewPanel.renderPanel(panel, item.sessionInfo);
    WebviewPanel.startPolling();
  }

  static refreshAll(): void {
    for (const [, entry] of WebviewPanel.panels) {
      const currentSize = WebviewPanel.getFileSize(entry.sessionInfo.filePath);
      if (currentSize !== entry.lastSize) {
        entry.lastSize = currentSize;
        WebviewPanel.renderPanel(entry.panel, entry.sessionInfo);
      }
    }
  }

  private static renderPanel(panel: vscode.WebviewPanel, sessionInfo: SessionInfo): void {
    const turns = parseTranscript(sessionInfo.filePath);
    panel.webview.html = getViewerHtml(turns, sessionInfo);
  }

  private static getFileSize(filePath: string): number {
    try {
      return fs.statSync(filePath).size;
    } catch {
      return 0;
    }
  }

  private static startPolling(): void {
    if (WebviewPanel.pollTimer) return;
    WebviewPanel.pollTimer = setInterval(() => {
      WebviewPanel.refreshAll();
    }, 2000);
  }

  private static stopPolling(): void {
    if (WebviewPanel.pollTimer) {
      clearInterval(WebviewPanel.pollTimer);
      WebviewPanel.pollTimer = undefined;
    }
  }
}
