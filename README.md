# Cursor Trace Viewer

Browse and visualize **Cursor AI Agent** session transcripts directly inside VS Code / Cursor. Inspect each turn, distinguish thinking from final responses, review tool calls, and export sessions as standalone HTML.

[English](#features) · [中文](#功能)

## Features

- **Session browser** — Lists all projects and agent sessions from `~/.cursor/projects/*/agent-transcripts/`, grouped by project with date + first-message preview
- **Conversation viewer** — Opens a session in a rich webview: user messages, assistant steps, tool calls, and collapsible thinking blocks
- **Thinking detection** — Hybrid heuristics: language-based splitting for non-English users (English segments as thinking), pattern-based fallback for English users
- **Markdown & code** — Renders headings, lists, fenced code blocks, and inline code with readable styling
- **Live updates** — Watches transcript files and refreshes the session list when new `.jsonl` files appear
- **Export** — Export any session to a self-contained HTML file for sharing or archiving
- **Session management** — Delete a single session or all sessions under a project (right-click context menu)

## Requirements

- VS Code `^1.85.0` or **Cursor** IDE
- Cursor agent transcripts stored under `~/.cursor/projects/<project>/agent-transcripts/*.jsonl`

## Usage

1. Install the extension (`.vsix` or marketplace).
2. Open the **Cursor Trace** view from the Activity Bar (telescope icon).
3. Expand a project → click a session to open the viewer.
4. Use **Show thinking** / **Collapse** on assistant steps when thinking is detected.
5. Right-click a session → **Export as HTML** or **Delete Session**.
6. Right-click a project → **Delete All Sessions**.

## Commands

| Command | Description |
|---------|-------------|
| `Cursor Trace: Refresh Sessions` | Reload session list from disk |
| `Cursor Trace: Open Session` | Open selected session in viewer |
| `Cursor Trace: Export as HTML` | Save session as HTML file |
| `Delete Session` | Remove one session directory |
| `Delete All Sessions` | Remove all sessions for a project |

## Data & privacy

Transcripts are read **only from your local machine** (`~/.cursor/projects`). Nothing is uploaded by this extension.

## License

MIT — see [LICENSE](LICENSE) if present, or repository metadata.

---

## 功能

- **会话列表** — 扫描 `~/.cursor/projects/*/agent-transcripts/`，按项目分组，标题显示日期 + 首条用户消息摘要
- **对话查看** — Webview 展示每轮对话：用户消息、助手步骤、工具调用，thinking 可折叠
- **Thinking 识别** — 非英文用户按语言切分（英文多为 thinking），英文用户回退到模式匹配
- **Markdown 与代码** — 支持标题、列表、代码块等渲染
- **自动刷新** — 监听 transcript 目录，新会话出现时更新列表
- **导出 HTML** — 将会话导出为独立 HTML 文件
- **会话管理** — 支持删除单个会话或项目下全部会话

## 使用方式

1. 安装扩展。
2. 在活动栏打开 **Cursor Trace**（望远镜图标）。
3. 展开项目 → 点击会话打开查看器。
4. 对含 thinking 的步骤使用 **Show thinking** / **Collapse**。
5. 右键会话可导出 HTML 或删除；右键项目可删除该项目下所有会话。

## 数据说明

扩展仅读取本机 `~/.cursor/projects` 下的 transcript 文件，不会上传任何数据。
