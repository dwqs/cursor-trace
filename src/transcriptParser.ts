import * as fs from 'fs';
import * as path from 'path';
import { ContentBlock, TranscriptRecord, Turn, AssistantStep, ToolMention, SessionInfo } from './types';

const USER_QUERY_RE = /<user_query>\s*([\s\S]*?)\s*<\/user_query>/;
const TIMESTAMP_RE = /<timestamp>(.*?)<\/timestamp>/;

const TOOL_PATTERNS: Array<{ pattern: RegExp; nameExtractor: (m: RegExpMatchArray) => string }> = [
  { pattern: /(?:Let me|I'll|I will|Now I'll|Let's)\s+(?:read|open|check)\s+(?:the\s+)?(?:file\s+)?[`"]([^`"]+)[`"]/gi, nameExtractor: m => `Read: ${m[1]}` },
  { pattern: /(?:Let me|I'll|I will|Now I'll)\s+(?:search|grep|find|look for)\s+/gi, nameExtractor: () => 'Search' },
  { pattern: /(?:Let me|I'll|I will|Now I'll)\s+(?:run|execute)\s+/gi, nameExtractor: () => 'Shell' },
  { pattern: /(?:Let me|I'll|I will|Now I'll)\s+(?:write|create|update|modify|edit)\s+/gi, nameExtractor: () => 'Edit' },
  { pattern: /(?:Using|Calling|Invoking)\s+(?:the\s+)?`?(\w+)`?\s+tool/gi, nameExtractor: m => m[1] },
];

export function stripCursorWrappers(text: string): string {
  const match = text.match(USER_QUERY_RE);
  if (match) {
    return match[1].trim();
  }
  return text
    .replace(/<timestamp>.*?<\/timestamp>/gs, '')
    .replace(/<\/?user_query>/g, '')
    .replace(/<uploaded_documents>[\s\S]*?<\/uploaded_documents>/g, '')
    .replace(/<attached_files>[\s\S]*?<\/attached_files>/g, '')
    .replace(/<open_and_recently_viewed_files>[\s\S]*?<\/open_and_recently_viewed_files>/g, '')
    .replace(/<system_reminder>[\s\S]*?<\/system_reminder>/g, '')
    .replace(/<manually_attached_skills>[\s\S]*?<\/manually_attached_skills>/g, '')
    .replace(/<user_info>[\s\S]*?<\/user_info>/g, '')
    .replace(/<agent_transcripts>[\s\S]*?<\/agent_transcripts>/g, '')
    .replace(/<rules>[\s\S]*?<\/rules>/g, '')
    .replace(/<agent_skills>[\s\S]*?<\/agent_skills>/g, '')
    .replace(/<image_files>[\s\S]*?<\/image_files>/g, '')
    .trim();
}

export function extractTimestamp(text: string): string | undefined {
  const match = text.match(TIMESTAMP_RE);
  return match ? match[1].trim() : undefined;
}

function detectToolMentions(text: string): ToolMention[] {
  const mentions: ToolMention[] = [];
  const seen = new Set<string>();

  for (const { pattern, nameExtractor } of TOOL_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const name = nameExtractor(m);
      if (!seen.has(name)) {
        seen.add(name);
        const start = Math.max(0, m.index - 20);
        const end = Math.min(text.length, m.index + m[0].length + 40);
        mentions.push({ name, detail: text.slice(start, end).trim() });
      }
    }
  }
  return mentions;
}

// --- Thinking detection ---
// Strategy: detect user's language from their messages, then route to the appropriate classifier.
// - Non-English users (CJK, Cyrillic, Arabic, etc.): model thinking is always in English,
//   so language difference reliably separates thinking from response.
// - English users: fall back to regex-based pattern matching on thinking indicators.

const NON_LATIN_RE = /[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff\u0980-\u09ff\u0a00-\u0a7f]/;

function hasNonLatinChars(text: string): boolean {
  return NON_LATIN_RE.test(text);
}

function isCodeOnlyMessage(text: string): boolean {
  return /^\s*```/.test(text);
}

type UserLang = 'non-english' | 'english';

function detectUserLanguage(userTexts: string[]): UserLang {
  const sample = userTexts.slice(0, 5);
  if (sample.length === 0) return 'english';
  const nonEnCount = sample.filter(t => hasNonLatinChars(t)).length;
  return nonEnCount / sample.length > 0.3 ? 'non-english' : 'english';
}

const EN_RESPONSE_STARTS = [
  /^all\s+\w+\s+(tasks?|steps?|items?|changes?)\s+(are\s+)?(complete|done|finished)/i,
  /^(done|finished|completed)[.!:\s]/i,
  /^here'?s\s+(the|a|my|your)\s+(final|complete|updated|full)/i,
  /^(i'?ve|i have)\s+(implemented|completed|finished|done|made|applied|fixed|added|updated|created)/i,
  /^(build|compilation|tests?)\s+(passes?|succeeded|passed|ok|successful)/i,
  /^(everything|all)\s+(is|looks)\s+(good|ready|working|set|done)/i,
  /^(the|this)\s+(implementation|fix|change|update|feature)\s+(is|has been)\s+(complete|done|ready)/i,
  /^summary\s*(of\s+(the\s+)?changes?)?:/i,
];

function isEnglishResponse(text: string): boolean {
  const firstLine = text.split('\n')[0].trim();
  return EN_RESPONSE_STARTS.some(re => re.test(firstLine));
}

// --- Path 1: Language-based classification (for non-English users) ---

function classifyByLanguage(text: string): Array<{ type: 'thinking' | 'response'; text: string }> {
  if (!text || text.length < 20) return [{ type: 'response', text }];

  if (!hasNonLatinChars(text)) {
    if (isCodeOnlyMessage(text)) return [{ type: 'response', text }];
    if (isEnglishResponse(text)) return [{ type: 'response', text }];
    return [{ type: 'thinking', text }];
  }

  const paragraphs = text.split(/\n{2,}/);
  if (paragraphs.length < 3) return [{ type: 'response', text }];

  const paraLangs: Array<'local' | 'en' | 'neutral'> = paragraphs.map(p => {
    const trimmed = p.trim();
    if (!trimmed || trimmed === '---' || /^\s*```/.test(trimmed)) return 'neutral';
    return hasNonLatinChars(trimmed.slice(0, 80)) ? 'local' : 'en';
  });

  // Case 1: EN head → local body (thinking at start)
  const firstLocalIdx = paraLangs.indexOf('local');
  if (firstLocalIdx >= 2) {
    const headEnCount = paraLangs.slice(0, firstLocalIdx).filter(l => l === 'en').length;
    if (headEnCount >= 2) {
      const thinkingPart = paragraphs.slice(0, firstLocalIdx).join('\n\n').trim();
      const responsePart = paragraphs.slice(firstLocalIdx).join('\n\n').trim();
      const result: Array<{ type: 'thinking' | 'response'; text: string }> = [];
      if (thinkingPart) result.push({ type: 'thinking', text: thinkingPart });
      if (responsePart) result.push({ type: 'response', text: responsePart });
      return result.length > 0 ? result : [{ type: 'response', text }];
    }
  }

  // Case 2: local body → EN tail (thinking at end)
  let lastLocalIdx = -1;
  for (let i = paraLangs.length - 1; i >= 0; i--) {
    if (paraLangs[i] === 'local') { lastLocalIdx = i; break; }
  }

  if (lastLocalIdx < 0 || lastLocalIdx >= paraLangs.length - 2) {
    return [{ type: 'response', text }];
  }

  const tailEnCount = paraLangs.slice(lastLocalIdx + 1).filter(l => l === 'en').length;
  if (tailEnCount < 2) return [{ type: 'response', text }];

  const responsePart = paragraphs.slice(0, lastLocalIdx + 1).join('\n\n').trim();
  const thinkingPart = paragraphs.slice(lastLocalIdx + 1).join('\n\n').trim();

  const result: Array<{ type: 'thinking' | 'response'; text: string }> = [];
  if (responsePart) result.push({ type: 'response', text: responsePart });
  if (thinkingPart) result.push({ type: 'thinking', text: thinkingPart });
  return result.length > 0 ? result : [{ type: 'response', text }];
}

// --- Path 2: Pattern-based classification (for English users) ---

const THINKING_PATTERNS = [
  /^(The user|Let me|I need to|I'll|I should|Looking at|Now I|First,|OK,? so|Alright)/im,
  /^(Actually|Hmm|Wait|So |Let's see)/im,
  /\bThe user (wants|is asking|wants me to|said|provided|is saying|says)\b/i,
  /\bLet me (first |now )?(check|read|look|search|see|think|analyze|understand|explore|find|review|investigate|update|modify)/i,
  /\bI (need to|should|will|'ll) (first |now )?(check|read|look|search|figure|understand|analyze|find|review|update|fix|trace)/i,
  /\bLooking at (the|this|these)/i,
  /\bNow I (understand|see|know|realize|need)/i,
  /\bActually,? (looking|thinking|I think|let me|I realize|I should|I need)/i,
  /\bSo I'?ll (go with|use|try|implement|create|need)/i,
  /\b(The issue|The problem|The fix) (is|might be|seems|would be)/i,
];

const RESPONSE_PATTERNS = [
  /^(#{1,3} )/m,
  /^```[\w]*/m,
  /^(\d+\.\s|\-\s|\*\s).{20,}/m,
  /^(Done|Here'?s|I'?ve (made|updated|created|added|fixed|implemented))/im,
  /^(---\s*$)/m,
];

function classifyByPatterns(text: string): Array<{ type: 'thinking' | 'response'; text: string }> {
  if (!text || text.length < 20) return [{ type: 'response', text }];
  if (isCodeOnlyMessage(text)) return [{ type: 'response', text }];

  const thinkingScore = THINKING_PATTERNS.filter(r => r.test(text)).length;
  const responseScore = RESPONSE_PATTERNS.filter(r => r.test(text)).length;

  // Strong thinking signal with weak response signal
  if (thinkingScore >= 3 && responseScore <= 1) return [{ type: 'thinking', text }];
  if (thinkingScore >= 2 && responseScore === 0) return [{ type: 'thinking', text }];

  return [{ type: 'response', text }];
}

function extractContentBlocks(message: unknown): ContentBlock[] {
  if (!message || typeof message !== 'object') return [];
  const msg = message as Record<string, unknown>;
  const content = msg.content;
  if (!Array.isArray(content)) return [];

  const blocks: ContentBlock[] = [];
  for (const item of content) {
    if (!item || typeof item !== 'object') continue;
    const block = item as Record<string, unknown>;

    if (block.type === 'text' && typeof block.text === 'string') {
      blocks.push({ type: 'text', text: block.text });
    } else if (block.type === 'tool_use') {
      blocks.push({
        type: 'tool_use',
        name: typeof block.name === 'string' ? block.name : 'Tool',
        id: typeof block.id === 'string' ? block.id : undefined,
        input: typeof block.input === 'object' && block.input !== null
          ? block.input as Record<string, unknown>
          : {},
      });
    }
  }
  return blocks;
}

function textFromBlocks(blocks: ContentBlock[]): string {
  return blocks
    .filter(b => b.type === 'text' && b.text)
    .map(b => b.text!)
    .join('\n')
    .trim();
}

export function parseTranscript(filePath: string): Turn[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());

  const messages: Array<{ role: string; blocks: ContentBlock[]; rawText: string }> = [];

  for (const line of lines) {
    try {
      const record: TranscriptRecord = JSON.parse(line);
      if (!record.role || !['user', 'assistant'].includes(record.role)) continue;
      const blocks = extractContentBlocks(record.message);
      if (blocks.length === 0) continue;
      messages.push({ role: record.role, blocks, rawText: textFromBlocks(blocks) });
    } catch {
      continue;
    }
  }

  // Detect user language to choose classification strategy
  const userTexts = messages.filter(m => m.role === 'user').map(m => m.rawText);
  const userLang = detectUserLanguage(userTexts);
  const classify = userLang === 'non-english' ? classifyByLanguage : classifyByPatterns;

  const turns: Turn[] = [];
  let currentTurn: Turn | null = null;
  let stepIndex = 0;

  for (const { role, rawText } of messages) {
    if (role === 'user') {
      if (currentTurn) turns.push(currentTurn);
      stepIndex = 0;
      const rawUserText = rawText;
      const timestamp = extractTimestamp(rawUserText);
      currentTurn = {
        turn: turns.length + 1,
        userMessage: stripCursorWrappers(rawUserText),
        timestamp,
        steps: [],
      };
    } else if (role === 'assistant' && currentTurn) {
      stepIndex++;
      const segments = classify(rawText);
      for (const seg of segments) {
        const toolMentions = detectToolMentions(seg.text);
        currentTurn.steps.push({ type: seg.type, text: seg.text, toolMentions });
      }
    }
  }

  if (currentTurn) turns.push(currentTurn);
  return turns;
}

export function getSessionInfo(filePath: string): SessionInfo | null {
  try {
    const stat = fs.statSync(filePath);
    const id = path.basename(filePath, '.jsonl');
    const projectDir = path.resolve(filePath, '..', '..', '..');
    const projectName = path.basename(projectDir)
      .replace(/^Users-\w+-/, '')
      .replace(/-/g, '/');

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    let turnCount = 0;
    let firstMessage = '';
    for (const line of lines) {
      try {
        const rec = JSON.parse(line);
        if (rec.role === 'user') {
          turnCount++;
          if (!firstMessage) {
            const blocks = rec.message?.content;
            if (Array.isArray(blocks)) {
              const textBlock = blocks.find((b: Record<string, unknown>) => b.type === 'text' && b.text);
              if (textBlock) {
                firstMessage = stripCursorWrappers(textBlock.text as string)
                  .replace(/\s+/g, ' ')
                  .slice(0, 50);
              }
            }
          }
        }
      } catch { /* skip */ }
    }

    return {
      id,
      projectName,
      filePath,
      mtime: stat.mtimeMs,
      turnCount,
      firstMessage,
    };
  } catch {
    return null;
  }
}

export function scanAllSessions(): SessionInfo[] {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const projectsDir = path.join(homeDir, '.cursor', 'projects');

  if (!fs.existsSync(projectsDir)) return [];

  const sessions: SessionInfo[] = [];

  try {
    const projects = fs.readdirSync(projectsDir);
    for (const project of projects) {
      const transcriptsDir = path.join(projectsDir, project, 'agent-transcripts');
      if (!fs.existsSync(transcriptsDir)) continue;

      try {
        const sessionDirs = fs.readdirSync(transcriptsDir);
        for (const sessionDir of sessionDirs) {
          const jsonlPath = path.join(transcriptsDir, sessionDir, `${sessionDir}.jsonl`);
          if (!fs.existsSync(jsonlPath)) continue;

          const info = getSessionInfo(jsonlPath);
          if (info) sessions.push(info);
        }
      } catch {
        continue;
      }
    }
  } catch {
    return [];
  }

  sessions.sort((a, b) => b.mtime - a.mtime);
  return sessions;
}
