import * as vscode from 'vscode';
import { scanAllSessions } from './transcriptParser';
import { SessionInfo, SessionItem } from './types';

export class SessionProvider implements vscode.TreeDataProvider<SessionTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SessionTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private sessions: SessionInfo[] = [];

  refresh(): void {
    this.sessions = scanAllSessions();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SessionTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SessionTreeItem): SessionTreeItem[] {
    if (!element) {
      if (this.sessions.length === 0) {
        this.sessions = scanAllSessions();
      }
      return this.buildProjectTree();
    }

    if (element.contextValue === 'project') {
      return element.sessionChildren || [];
    }

    return [];
  }

  private buildProjectTree(): SessionTreeItem[] {
    const grouped = new Map<string, SessionInfo[]>();

    for (const session of this.sessions) {
      const list = grouped.get(session.projectName) || [];
      list.push(session);
      grouped.set(session.projectName, list);
    }

    const projectItems: SessionTreeItem[] = [];

    for (const [projectName, sessions] of grouped) {
      const children = sessions.map(s => {
        const date = new Date(s.mtime);
        const timeStr = date.toLocaleString('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
        const preview = s.firstMessage || '(empty)';
        const label = `${timeStr}  ${preview}`;
        const item = new SessionTreeItem(
          label,
          vscode.TreeItemCollapsibleState.None,
          'session',
        );
        item.sessionInfo = s;
        item.tooltip = `${s.id}\n${new Date(s.mtime).toLocaleString()}`;
        item.command = {
          command: 'cursorTrace.openSession',
          title: 'Open Session',
          arguments: [{ type: 'session', label, sessionInfo: s } as SessionItem],
        };
        return item;
      });

      const projectItem = new SessionTreeItem(
        projectName,
        vscode.TreeItemCollapsibleState.Expanded,
        'project',
      );
      projectItem.sessionChildren = children;
      projectItem.description = `${sessions.length} sessions`;
      projectItems.push(projectItem);
    }

    return projectItems;
  }
}

export class SessionTreeItem extends vscode.TreeItem {
  sessionChildren?: SessionTreeItem[];
  sessionInfo?: SessionInfo;

  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public override contextValue: string,
  ) {
    super(label, collapsibleState);
  }
}
