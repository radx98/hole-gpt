export type Role = "user" | "assistant";

export type HistoryLine = {
  role: Role;
  text: string;
};

export type Highlight = {
  childNodeId: string;
  start: number;
  end: number;
  text: string;
  active?: boolean;
};

export type Message = {
  id: string;
  role: Role;
  text: string;
  highlights?: Highlight[];
  createdAt: number;
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
};

export type Session = {
  id: string;
  title: string | null;
  rootNodeId: string;
  nodes: Record<string, Node>;
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
  start: number;
  end: number;
  rect: DOMRect;
};
