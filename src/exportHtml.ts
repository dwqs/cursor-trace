import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { parseTranscript } from './transcriptParser';
import { getViewerHtml } from './viewerHtml';
import { SessionItem } from './types';

export async function exportSessionHtml(item: SessionItem): Promise<void> {
  if (!item.sessionInfo) {
    vscode.window.showErrorMessage('No session data to export.');
    return;
  }

  const defaultName = `trace_${item.sessionInfo.id.slice(0, 8)}_${new Date(item.sessionInfo.mtime).toISOString().slice(0, 10)}.html`;

  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(path.join(
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.env.HOME || '',
      defaultName,
    )),
    filters: { 'HTML Files': ['html'] },
  });

  if (!uri) return;

  const turns = parseTranscript(item.sessionInfo.filePath);
  const html = getViewerHtml(turns, item.sessionInfo);

  try {
    fs.writeFileSync(uri.fsPath, html, 'utf-8');
    const openAction = await vscode.window.showInformationMessage(
      `Exported trace to ${path.basename(uri.fsPath)}`,
      'Open in Browser',
      'Reveal in Finder',
    );

    if (openAction === 'Open in Browser') {
      vscode.env.openExternal(uri);
    } else if (openAction === 'Reveal in Finder') {
      vscode.commands.executeCommand('revealFileInOS', uri);
    }
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to export: ${err}`);
  }
}
