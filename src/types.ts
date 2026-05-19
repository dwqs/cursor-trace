export interface ContentBlock {
  type: 'text' | 'tool_use';
  text?: string;
  name?: string;
  id?: string;
  input?: Record<string, unknown>;
}

export interface TranscriptRecord {
  role: 'user' | 'assistant';
  message: {
    content: ContentBlock[];
  };
}

export interface AssistantStep {
  type: 'thinking' | 'response';
  text: string;
  toolMentions: ToolMention[];
}

export interface ToolMention {
  name: string;
  detail: string;
}

export interface Turn {
  turn: number;
  userMessage: string;
  timestamp?: string;
  steps: AssistantStep[];
}

export interface SessionInfo {
  id: string;
  projectName: string;
  filePath: string;
  mtime: number;
  turnCount: number;
  firstMessage: string;
}

export interface SessionItem {
  type: 'project' | 'session';
  label: string;
  sessionInfo?: SessionInfo;
  children?: SessionItem[];
}
