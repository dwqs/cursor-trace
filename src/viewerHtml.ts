import { Turn, AssistantStep, SessionInfo } from './types';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderMarkdown(text: string): string {
  // Render fenced code blocks first
  let result = text.replace(
    /^```(\w*)\n([\s\S]*?)^```$/gm,
    (_match, lang, code) => {
      const langLabel = lang ? `<span class="code-lang">${lang}</span>` : '';
      return `</pre><div class="code-block">${langLabel}<pre class="code-pre">${code.trimEnd()}</pre></div><pre>`;
    }
  );
  // Also handle ``` without language on same line as content (single-line blocks)
  result = result.replace(
    /```([^`\n]*?)```/g,
    (_match, code) => `<code>${code}</code>`
  );
  // Inline code
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Markdown headings
  result = result.replace(/^(#{1,3})\s+(.+)$/gm, (_match, hashes, content) => {
    const level = hashes.length;
    return `</pre><h${level + 2} class="md-heading">${content}</h${level + 2}><pre>`;
  });
  // Horizontal rules
  result = result.replace(/^---\s*$/gm, '</pre><hr class="md-hr"><pre>');
  return result;
}

function renderAssistantStep(step: AssistantStep, index: number): string {
  const escaped = escapeHtml(step.text);
  const rendered = renderMarkdown(escaped);
  const isThinking = step.type === 'thinking';
  const toolBadges = step.toolMentions.map(t =>
    `<span class="tool-badge" title="${escapeHtml(t.detail)}">${escapeHtml(t.name)}</span>`
  ).join('');

  return `
    <div class="assistant-step ${isThinking ? 'thinking-step' : 'response-step'}">
      <div class="step-label">
        <span class="step-type-badge ${isThinking ? 'type-thinking' : 'type-response'}">
          ${isThinking ? 'Thinking' : `Response ${index}`}
        </span>
        ${toolBadges}
      </div>
      <div class="step-content ${isThinking ? 'collapsed' : ''}">
        <pre>${rendered}</pre>
      </div>
      ${isThinking ? '<button class="expand-btn">Show thinking...</button>' : ''}
    </div>`;
}

function renderTurn(turn: Turn): string {
  let responseIndex = 0;
  const stepsHtml = turn.steps.map((step, _i) => {
    if (step.type !== 'thinking') responseIndex++;
    return renderAssistantStep(step, responseIndex);
  }).join('');

  const allToolMentions = turn.steps.flatMap(s => s.toolMentions);
  const toolSummary = allToolMentions.length > 0
    ? `<div class="turn-tools"><span class="tools-label">Tools:</span> ${allToolMentions.map(t => `<span class="tool-badge-sm">${escapeHtml(t.name)}</span>`).join('')}</div>`
    : '';

  return `
    <div class="turn" data-turn="${turn.turn}">
      <div class="turn-header">
        <span class="badge turn-badge">Turn ${turn.turn}</span>
        <span class="turn-steps-count">${turn.steps.length} steps</span>
        ${turn.timestamp ? `<span class="turn-time">${escapeHtml(turn.timestamp)}</span>` : ''}
      </div>
      <div class="section user-section">
        <div class="section-label">USER</div>
        <div class="section-content"><pre>${renderMarkdown(escapeHtml(turn.userMessage))}</pre></div>
      </div>
      ${toolSummary}
      <div class="section assistant-section">
        <div class="section-label">ASSISTANT</div>
        <div class="section-content">${stepsHtml}</div>
      </div>
    </div>`;
}

function renderSidebarItem(turn: Turn): string {
  const preview = turn.userMessage.slice(0, 50).replace(/\n/g, ' ');
  const toolCount = turn.steps.reduce((sum, s) => sum + s.toolMentions.length, 0);
  const toolIndicator = toolCount > 0 ? `<span class="sidebar-tool-count">${toolCount}</span>` : '';
  return `
    <div class="sidebar-item" data-turn="${turn.turn}">
      <span class="sidebar-badge">T${turn.turn}</span>
      <span class="sidebar-preview">${escapeHtml(preview)}</span>
      ${toolIndicator}
    </div>`;
}

export function getViewerHtml(steps: Turn[], session: SessionInfo): string {
  const sidebarItems = steps.map(renderSidebarItem).join('');
  const mainContent = steps.map(renderTurn).join('');
  const totalSteps = steps.reduce((sum, t) => sum + t.steps.length, 0);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Cursor Trace - ${escapeHtml(session.projectName)}</title>
<style>
:root {
  --bg: #1e1e1e;
  --bg-secondary: #252526;
  --bg-hover: #2a2d2e;
  --bg-tertiary: #1a1a1a;
  --border: #3c3c3c;
  --text: #cccccc;
  --text-muted: #888888;
  --accent: #569cd6;
  --accent-dim: #264f78;
  --user-bg: #1a2e3e;
  --thinking-bg: #1e1e2e;
  --thinking-border: #4a4a6a;
  --tool-color: #dcdcaa;
  --tool-bg: #2d2a1e;
  --tool-border: #6b6330;
  --success: #4ec9b0;
  --sidebar-width: 260px;
  --header-height: 44px;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  height: 100vh;
  overflow: hidden;
}

.container {
  display: grid;
  grid-template-columns: var(--sidebar-width) 1fr;
  grid-template-rows: var(--header-height) 1fr;
  height: 100vh;
}

.header {
  grid-column: 1 / -1;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 16px;
}

.header-title { font-size: 13px; font-weight: 600; color: var(--accent); }
.header-meta { font-size: 12px; color: var(--text-muted); }
.header-stats { margin-left: auto; display: flex; gap: 12px; font-size: 11px; }
.stat { color: var(--text-muted); }
.stat-value { color: var(--success); font-weight: 600; }

.sidebar {
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.search-box {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.search-box input {
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 5px 8px;
  border-radius: 3px;
  font-size: 12px;
  outline: none;
}

.search-box input:focus { border-color: var(--accent); }

.sidebar-list { overflow-y: auto; flex: 1; padding: 4px 0; }

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: background 0.1s;
}

.sidebar-item:hover { background: var(--bg-hover); }
.sidebar-item.active { background: var(--bg-hover); border-left-color: var(--accent); }

.sidebar-badge {
  font-size: 10px;
  font-weight: 700;
  color: var(--accent);
  background: var(--accent-dim);
  padding: 1px 5px;
  border-radius: 3px;
  white-space: nowrap;
  flex-shrink: 0;
}

.sidebar-preview {
  font-size: 11px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.sidebar-tool-count {
  font-size: 9px;
  background: var(--tool-bg);
  color: var(--tool-color);
  border: 1px solid var(--tool-border);
  padding: 0 4px;
  border-radius: 3px;
  flex-shrink: 0;
}

.main { overflow-y: auto; padding: 16px 20px; }

.turn {
  margin-bottom: 20px;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}

.turn-header {
  background: var(--bg-secondary);
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 8px;
}

.badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 3px; }
.turn-badge { background: var(--accent-dim); color: var(--accent); }
.turn-steps-count { font-size: 11px; color: var(--text-muted); }
.turn-time { font-size: 11px; color: var(--text-muted); margin-left: auto; }

.section { padding: 10px 14px; }
.section + .section { border-top: 1px solid var(--border); }

.section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.8px;
  margin-bottom: 6px;
  color: var(--text-muted);
}

.user-section { background: var(--user-bg); }

.section-content pre {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 12.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.section-content code {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  background: #2d2d2d;
  padding: 2px 5px;
  border-radius: 3px;
  font-size: 11.5px;
  border: 1px solid #3a3a3a;
}

.section-content strong { color: #e0e0e0; }

.code-block {
  margin: 8px 0;
  overflow: hidden;
  position: relative;
}

.code-block .code-lang {
  position: absolute;
  top: 4px;
  right: 8px;
  font-size: 10px;
  color: #555;
  font-family: -apple-system, sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.code-block .code-pre {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace !important;
  font-size: 12px;
  line-height: 1.5;
  padding: 8px 0;
  margin: 0;
  overflow-x: auto;
  white-space: pre;
  word-break: normal;
  color: #d4d4d4;
}

.md-heading {
  color: var(--accent);
  margin: 12px 0 6px;
  font-size: 13px;
}

h3.md-heading { font-size: 14px; }
h4.md-heading { font-size: 13px; }
h5.md-heading { font-size: 12.5px; }

.md-hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 12px 0;
}

.turn-tools {
  padding: 6px 14px;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  background: var(--bg-tertiary);
}

.tools-label { font-size: 10px; color: var(--text-muted); font-weight: 600; }

.tool-badge, .tool-badge-sm {
  font-size: 10px;
  background: var(--tool-bg);
  color: var(--tool-color);
  border: 1px solid var(--tool-border);
  padding: 1px 6px;
  border-radius: 3px;
  cursor: default;
}

.tool-badge { margin-left: 6px; }

.assistant-step { margin-bottom: 10px; }
.assistant-step:last-child { margin-bottom: 0; }

.step-label { display: flex; align-items: center; margin-bottom: 4px; gap: 6px; }

.step-type-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 3px;
}

.type-thinking { background: #2a2a40; color: #9999cc; border: 1px solid var(--thinking-border); }
.type-response { background: #1a3020; color: var(--success); }

.thinking-step .step-content { background: var(--thinking-bg); border: 1px solid var(--thinking-border); border-radius: 4px; padding: 8px 10px; }
.response-step .step-content { padding: 4px 0; }

.step-content.collapsed { max-height: 60px; overflow: hidden; position: relative; }
.step-content.collapsed::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 30px;
  background: linear-gradient(transparent, var(--thinking-bg));
}

.expand-btn {
  margin-top: 4px;
  font-size: 11px;
  color: var(--accent);
  background: none;
  border: 1px solid var(--accent-dim);
  padding: 2px 8px;
  border-radius: 3px;
  cursor: pointer;
}
.expand-btn:hover { background: var(--accent-dim); }

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  font-size: 14px;
}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <span class="header-title">Cursor Trace</span>
    <span class="header-meta">${escapeHtml(session.projectName)}</span>
    <div class="header-stats">
      <span class="stat">Turns: <span class="stat-value">${steps.length}</span></span>
      <span class="stat">Steps: <span class="stat-value">${totalSteps}</span></span>
      <span class="stat">ID: <span class="stat-value">${escapeHtml(session.id)}</span></span>
    </div>
  </div>
  <div class="sidebar">
    <div class="search-box">
      <input type="text" id="searchInput" placeholder="Search..." />
    </div>
    <div class="sidebar-list">
      ${sidebarItems}
    </div>
  </div>
  <div class="main" id="mainContent">
    ${mainContent || '<div class="empty-state">No conversation data</div>'}
  </div>
</div>
<script>
(function() {
  const sidebarItems = document.querySelectorAll('.sidebar-item');
  const turns = document.querySelectorAll('.turn');
  const searchInput = document.getElementById('searchInput');

  sidebarItems.forEach(item => {
    item.addEventListener('click', () => {
      const turn = item.dataset.turn;
      const target = document.querySelector('.turn[data-turn="' + turn + '"]');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        sidebarItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
      }
    });
  });

  if (sidebarItems.length > 0) sidebarItems[0].classList.add('active');

  const mainEl = document.getElementById('mainContent');
  if (mainEl) {
    mainEl.addEventListener('scroll', () => {
      let closest = null;
      let closestDist = Infinity;
      turns.forEach(t => {
        const rect = t.getBoundingClientRect();
        const dist = Math.abs(rect.top - 60);
        if (dist < closestDist) { closestDist = dist; closest = t; }
      });
      if (closest) {
        const turn = closest.dataset.turn;
        sidebarItems.forEach(i => i.classList.toggle('active', i.dataset.turn === turn));
      }
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      turns.forEach(t => {
        const text = t.textContent.toLowerCase();
        t.style.display = query && !text.includes(query) ? 'none' : '';
      });
      sidebarItems.forEach(item => {
        const turn = item.dataset.turn;
        const target = document.querySelector('.turn[data-turn="' + turn + '"]');
        item.style.display = target && target.style.display === 'none' ? 'none' : '';
      });
    });
  }

  document.querySelectorAll('.expand-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const content = btn.previousElementSibling;
      if (!content) return;
      content.classList.toggle('collapsed');
      btn.textContent = content.classList.contains('collapsed') ? 'Show thinking...' : 'Collapse';
    });
  });
})();
</script>
</body>
</html>`;
}
