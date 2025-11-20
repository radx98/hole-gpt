export type Role = "user" | "assistant";

export type HistoryLine = {
  role: Role;
  text: string;
};

export type Highlight = {
  highlightId: string;
  childNodeId: string;
  startOffset: number;
  endOffset: number;
  text: string;
  isActive?: boolean;
};

export type Message = {
  id: string;
  role: Role;
  text: string;
  createdAt: number;
  highlights?: Highlight[];
};

export type ParentLink = {
  parentNodeId: string;
  parentMessageId: string;
  selection: {
    text: string;
    startOffset: number;
    endOffset: number;
  };
};

export type Node = {
  id: string;
  depth: number;
  header: string | null;
  parent: ParentLink | null;
  messages: Message[];
  children?: string[];
};

export type Session = {
  id: string;
  title: string | null;
  rootNodeId: string;
  nodes: Record<string, Node>;
  createdAt: number;
  updatedAt: number;
};

export type BranchingState = {
  version: number;
  activeSessionId: string | null;
  activeBranchNodeIds: string[];
  currentNodeId: string | null;
  sessions: Record<string, Session>;
};

export type SelectionDraft = {
  nodeId: string;
  messageId: string;
  text: string;
  startOffset: number;
  endOffset: number;
  rect: DOMRect;
};
