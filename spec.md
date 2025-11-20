# Description

## 1. Core concept

The app is a ChatGPT-like interface where conversations are **non-linear** and represented as a **tree of nodes**, each node being a **single column** in the UI.

* **Vertical axis**: time within a single column (a linear chat between user and LLM).
* **Horizontal axis**: branching depth in the conversation tree.

Each **column = one node** in the JSON tree:

* The **root column** is the entry point of the session.
* From any message, the user can select text and spawn a **child column** to the right.
* Under the hood, the app stores the **full tree** (all nodes and branches).
* In the UI, the user **explores one branch at a time**: the visible columns are the nodes along the active path from the root to the currently focused node.
* The user can jump back into already explored branches by clicking highlights that represent previously created branches.

Every column/node:

* Holds a linear conversation (user and LLM messages).
* Has an AI-generated header (the root column header becomes the session name).
* Knows which parent selection it came from.
* Can itself spawn further branches.

---

## 2. Terminology

* **Session**
  A complete non-linear conversation tree, starting from a single root column and containing all derived branches. Stored as a JSON in the browser local storage.

* **Node / Column**
  A single linear chat thread and a single node in the session tree.

  * Exactly one node per column.
  * Each node has:

    * An AI-generated header.
    * A linear list of messages.
    * A reference to its **parent node** (the root doesn't have one).
    * A reference to the **text selection** that created it.
    * A depth (0 for root, 1 for its children, etc.).

* **Message**
  One user prompt or one LLM response inside a node.

* **Linear input field**
  The main input at the bottom of a column, used to continue that node’s chat linearly.

* **Context input field**
  A temporary mini input that appears **above a text selection** inside a message. Sending from it creates a **new child node / column** to the right.

* **Highlight**
  A persistent visual mark on a text selection that has at least one branch associated with it. Highlights indicate places where branches exist and let the user navigate to those branches. The highlight who's child node is open on the right appears brighter than the other highlights in the same column.

* **Active branch**
  The ordered list of node ids from the root node to the current node. Columns on screen always correspond to the active branch only. It always starts with the root/0 but not necessarily ends with the last node in the branch. The following nodes if there are any can be opened by clicking/tapping the highlights.

---

## 3. Layout & appearance

### 3.1 Global layout

* Overall design is **minimalistic**, with no decorative elements.
* Typeface: **Helvetica** for all text (other standard sans-serif if no Helvetica).
* Background: white.
* **Thin gray lines** separate main UI areas (e.g., top bar from content, columns from each other).

At the very top:

* A **viewport-wide bar** fixed at the top of the viewport spans the full width.
* The top bar contains:

  * On the **far left**: the **app name** in uppercase.
  * A **session segment** showing the session name and a Lucide **chevrons-up-down** icon, representing both the session and its root node. Clicking this segment opens the session list dropdown.
  * After the session segment: a series of **path segments** separated by slashes, displaying the active branch from root to the current node. Format: `[APP NAME] / [session name + icon] / [second column title] / [third column title] / …`
  * Each segment after the session represents one node/column along the currently active branch, with labels matching the node/column headers.
* The top bar has a thin gray line at its bottom edge to separate it from the main content.

Below the top bar:

* The main content area is a horizontally scrollable stack of columns representing the active branch.
* The page itself (html/body) does not scroll vertically. Each column is its own independent vertical scroll container.
* Each column extends from below the top bar to the bottom of the viewport, with its content scrolling vertically within that space.

### 3.2 Root column initial state

The **root column**:

* Sits on the **left** side of the main area.
* Has maximum width of approximately `max-w-3xl`.
* Uses the full available height between top bar and viewport bottom.

Initial state of a new session, before any messages:

* The column contains:

  * A **centered placeholder block** in the main area with:

    * Text: `"A new rabbithole entrance is right here"`.
    * A **Lucide “arrow-down” icon** below the text.
  * A **floating “Ask anything” linear input** at the bottom:

    * Sticks to the bottom of the column (above any system scroll indicators).
    * Minimal padding and minimal corner rounding.
    * Includes an integrated **Send button** on the right side.
    * Submit is triggered by:

      * Clicking the Send button, or
      * Pressing Enter (with appropriate handling for multiline if implemented).

As soon as the first conversation turn starts (user sends the first message), the placeholder disappears permanently for that session.

### 3.3 Column structure

Each visible column (node) is a vertical scroll container showing:

* **Header area** at the top of the column content:

  * The AI-generated h3 header (short title describing the node).
  * Stays fixed at the top of that column's scrollable area.
* **Messages area** below the header:

  * A vertically scrolling stack of messages.
  * Each column scrolls independently; scrolling one column does not affect others.
  * Content scrolls within the column between the header at the top and the bottom of the viewport.
* **Linear input area** at the bottom of the column:

  * For the **current/focused column**, the linear input is active and visible, floating at the bottom of the column.
  * The layout guarantees the active linear input is always within the viewport. As content grows, the column scrolls down while the input remains visible at the bottom.
  * For other visible columns, the linear input is hidden completely.
  * Every column has additional padding at the bottom to prevent the linear input field from overlapping with column content.

Columns are separated from each other visually by a thin vertical gray line, same as those separating other elements.

### 3.4 Message styling

Within any column:

* **User messages**:

  * Right-aligned.
  * Max width ~**80%** of the column width.
  * Light gray background.
  * Minimal border radius.
  * User can use markdown for formatting.

* **LLM messages**:

  * Left-aligned.
  * Occupy **the full column width**; they do not sit inside a visible container.
  * No distinct background container; just text with standard spacing and typographic hierarchy.
  * Support **markdown rendering** (headings, lists, code, emphasis) to improve readability. The LLM is instructed to use markdown if it serves the purpose.

Messages appear in strict chronological order:

* User → LLM → user → LLM → …

### 3.5 Input fields

**Linear input field** (per column):

* Located at the bottom of the active column.
* Styling:

  * Floats at the bottom.
  * A white text input area inside.
  * Minimal padding from the column edges and bottom.
  * Minimal rounding.
  * Integrated Send button on the right.
* Behavior:

  * In the **current column**, the input is visible:

    * Focusable, editable, and can submit data.
  * In **other visible columns** the input is hidden.
  * On send:

    * The text is treated as a new prompt for this node.
    * The app sends a request to the LLM (see §10).
    * The new user message appears in the message list, followed by the LLM response when received.

**Context input field**:

* Appears when the user selects non-empty text within any message (user or LLM).
* Styling:

  * A mini version of the linear input:

    * Smaller width.
    * Minimal rounding.
    * Appears directly **above** the selected text, anchored visually to it.
* Behavior:

  * On send:

    * The context input disappears.
    * A new **child column** is created to the **right** of the column where the selection was made. It contains the user message that's jsut been sent.
    * The app sends a request to the LLM (see §10) and then adds a generated header and a response to the user message to that new column.
    * The selected text becomes a **highlight** (see §5.3).

---

## 4. Column & navigation behavior

### 4.1 Current / focused column

At any moment, exactly **one column is “current”**.

* The current column:

  * Has an active linear input.
  * Looks normal, while in other columns all the elements are 15% paler.

The user can change focus by clicking or tapping anywhere inside a column (header, message area, or input). Any interaction with a column makes it the current/focused.

Horizontal scroll also changes focus. The algorythm making that possible works the following way:

As the user scrolls horizontally, compute how far they are between the left and right ends (from 0% to 100%). Place an invisible **focus point** inside the viewport at the same percentage between its left and right edges. The **focused column** is always the one that covers this focus point.

The user can focus on a column without scrolling, just by interacting with it as described above. But as soon as the content is horizontally scrolled for more than 5% of the viewport width, the scroll algorythm takes control back.

### 4.2 Vertical scrolling

* The page itself (html/body) does not scroll vertically. The top bar is always fixed at the top of the viewport.
* Every column is its own vertical scroll container, with content scrolling independently within that column.
* Scrolling one column does not affect the scroll of others; columns do not sync vertically.
* For the currently active column, the **linear input** floats at the bottom of the column, remaining visible as messages scroll within the column's viewport.
* Non-active columns keep their own independent vertical scroll positions.
* The content has additional padding at the bottom to account for the linear input field height.

### 4.3 Horizontal scrolling

* The row of columns for the active branch can be **wider than the viewport**.
* When there are more columns than fit horizontally:

  * The user can scroll horizontally:

    * With scrollbars on desktop.
    * With horizontal drag/swipe on touch devices.

### 4.4 Horizontal overscroll behavior

* The app prevents the browser's native horizontal back/forward swipe gesture at the leftmost and rightmost horizontal scroll positions.
* This is achieved using CSS overscroll control (e.g., `overscroll-behavior-x: none` on html and body), ensuring trackpad gestures at the edges do not trigger browser navigation.

### 4.5 Horizontal layout and overlapping columns

Columns form an ordered horizontal stack from left (root) to right (deepest node in the branch), with a z-index stacking order from bottom to top: the root column is at the bottom of the stack, and each subsequent child layers on top of its parent. This stacking order allows left columns to slide under their right neighbors as horizontal scrolling occurs.

**Layout geometry:**

* Each column has a fixed width of approximately 768px (tailwind `max-w-3xl` or similar).
* **Column position** is defined by the position of its **left edge**.
* The **standard offset** is 40px (used for edge constraints).

**Column positioning:**

The root column position is always 0 (its left edge aligned with the viewport's left edge). Other columns normally follow each other side by side, with the right edge of the left column aligned with the left edge of the right column (i.e., columns are normally ~768px apart). **However**, column positions are constrained at the viewport edges:

* **Left edge constraint**: On the left, a column cannot go below `standard_offset × z_index`.
  * In other words, column i cannot have its left edge positioned to the left of `40px × i`.
  * Example: z_index 1 cannot go farther than 40px from the left viewport edge; z_index 2 cannot go farther than 80px from the left edge.

* **Right edge constraint**: On the right, a column cannot go above `viewport_width - standard_offset × number_of_columns_already_at_their_rightmost_position`.
  * In other words, the column with the biggest z_index (the rightmost column) cannot have its left edge beyond `viewport_width - 40px` to the right.
  * The next column after it cannot have its left edge beyond `viewport_width - 80px` to the right, and so on.

**Example:**

There are 10 columns, each 768px wide, with standard_offset = 40px.

By default, the left edge of a column is 768px away from the left edges of its neighbors, but:

* Column 0 can be positioned only within the range of `0px` to `viewport_width - 400px`.
* Column 1 can be between `40px` and `viewport_width - 360px`.
* Column 2 can be between `80px` and `viewport_width - 320px`.
* ...
* Column 8 can be between `320px` and `viewport_width - 80px`.
* Column 9 can be between `360px` and `viewport_width - 40px`.

**Center region (columns fully visible):**

* Columns positioned within the viewport's visible area and not overlapped by higher-z-index neighbors appear fully with their complete content: header, messages, highlights, and linear input (if active).
* As many columns as can fit fully in the viewport are shown completely.

**Left edge behavior:**

* As the user scrolls right, earlier columns on the left slide under their right neighbors due to z-index stacking.
* Columns that would scroll off-screen to the left are instead clamped by the left edge constraint (`left_edge >= 40px × z_index`), ensuring they remain partially visible at the left viewport edge.
* When multiple columns are clamped at the left edge, they stack horizontally maintaining their 40px spacing (column 0 showing at 0px with its leftmost 40px visible, column 1 showing at 40px with its leftmost 40px visible, and so on).
* These stacked columns show their actual layout and content within the visible 40px-wide slice, not a special collapsed state.

**Right edge behavior:**

* The maximum scroll position is constrained by the right edge constraint: when scrolled all the way right, the rightmost column's left edge is positioned at `viewport_width - 40px`.
* At this maximum scroll, the next-to-last column's left edge is at `viewport_width - 80px`, the next at `viewport_width - 120px`, and so on, maintaining their 40px spacing.
* When multiple columns extend beyond the right viewport edge, they stack horizontally at the right edge, each displaying a 40px-wide slice of their leftmost content.
* These stacked columns show their actual layout and content within the visible 40px-wide slice.

**Interaction:**

* Clicking or tapping anywhere in a partially visible column scrolls horizontally to bring that column into full view and focuses it.

---

## 5. Branching interactions

### 5.1 Selecting text & context input

* The user can select any contiguous range inside a message in any visible column.
* Once a non-empty selection exists (and if it is not spanning text from more than one message), a **context input field** appears directly above the selection.

The user can:

* Type a prompt in the context input.
* Send the prompt (Enter or Send button).
* Cancel by clicking outside or clearing the selection.

### 5.2 Creating a new branch column

When the user sends a prompt via the **context input**:

1. The selection (text and offsets) is captured (and cancelled as if the user clicked out or pressed Esc) and highlighted.
2. A new **child node** is created in the session tree with:

   * Parent node id = the node where the selection was made.
   * Parent message id = the message containing the selection.
   * Selection text and character offsets.
3. A new **column** is created to the **right** of the parent column:

   * The new column becomes the **last column** in the active branch.
   * The active branch is updated to include this new node at the end.
4. The new column’s header is initially filled with gray slightly rounded placeholder block representing future header (until the LLM suggests one).
5. The LLM request is built with full branch context (see §10).
6. When the LLM responds:

   * The context prompt becomes the first user message in the new column.
   * The LLM reply becomes the first assistant message in that column.
   * The column’s header is set from the LLM-provided header.

### 5.3 Highlights and branch switching

Highlights represent selections that **already have branches**:

* When a context input is sent and a child node is successfully created:

  * The selected text in the parent message becomes a **persistent highlight**.
* Highlight states:

  * **Active highlight**:

    * The highlight whose child node lies on the **current active branch**, i.e. in the column on the right (for that selection).
    * Appears brighter or more saturated.
  * **Inactive highlight**:

    * Highlights whose child nodes are **not** on the current active branch, i.e. not displayed on the right.
    * Appear slightly **paler** but remain visible.

Interaction with highlights:

* Clicking an inactive highlight:

  * Switches the active branch to the branch that ends at that highlight’s child node (no further nodes/columns are displayed after it). If there was a column on the right from the one containing this highlight, it gets hidden. Instead of it the highlight's child node/column is shown.
  * Doesn't change the other columns.
  * The clicked highlight becomes active (bright).
* Clicking an active highlight (if multiple branches exist from the same selection or a few highlights intersect at the clicked character) shows a small chooser to pick one branch.

---

## 6. Top bar and branch address line

The top bar is a viewport-wide bar fixed at the top of the viewport. It functions as a branch "address line" that reflects the current active branch.

**Top bar structure:**

* On the **far left**: the **app name** in uppercase.
* A **session segment** that displays:

  * The session name (which is the root node header).
  * A Lucide **chevrons-up-down** icon.
  * This segment represents both the session and its root node.
  * Clicking this segment opens the **session list dropdown**.
* After the session segment: a series of **path segments** separated by slashes, showing the active branch from root to the current node:

  * Format: `[APP NAME] / [session name + icon] / [second column title] / [third column title] / …`
  * Each segment after the session represents one node/column along the currently active branch, in order from root to the current node.
  * The labels in these segments come from the node/column headers.
  * The number and order of path segments always match the currently active branch (the same nodes visualized as columns).

**Session list dropdown:**

* Opened by clicking the session segment (session name + chevrons-up-down icon).
* Lists all sessions:

  * Each item displays:

    * The session name (root node header).
    * Lucide **trash-2** button to delete the session.
  * The **current session** is clearly highlighted.
* Clicking a session in the dropdown:

  * Switches the activeSessionId in the data model.
  * Loads the tree for that session.
  * Reconstructs and renders the active branch for that session (typically from root to last focused node).

**Session titles:**

* Each session uses the root node's header as its **session title**.
* The **root column header and the session title are always identical**:

  * When the LLM proposes a header for the root node, the session title is set to exactly that string.

---

## 7. Behavioral summary

1. User opens the app.
2. A **new session** is available or loaded; the root column appears on the left with:

   * Placeholder text and arrow-down icon.
   * "Ask anything" input at the bottom.
3. User types into the root's linear input and sends:

   * Placeholder disappears.
   * The root column shows the user message and then the LLM reply.
   * The root header is generated by the LLM and becomes the session title.
   * The top bar displays the session name in the session segment.
4. User continues linearly in any visible column via its (active) linear input.
5. At any time, the user can select text in any message:

   * A context input appears above the selection.
   * Sending from it creates a child column to the right.
   * The selected text becomes a highlight.
   * The top bar updates to show the new branch path.
6. The active branch is the sequence of columns from root to the current node; only these columns are visible as a horizontal stack.
7. Previously created branches are represented by **pale highlights**:

   * Clicking them switches back to those branches and shows one column they lead to but none of the further columns.
   * The top bar updates to reflect the new active branch.
8. The page itself does not scroll vertically. Each column is its own vertical scroll container, scrolling independently. The currently active column has a floating linear input at the bottom that stays within the viewport as the column's content scrolls.
9. Horizontally, columns form a stack from left (root) to right (deepest node). Columns normally follow each other side by side (~768px apart), but are constrained at viewport edges by a 40px standard offset, creating an overlapping layout at the edges. The layout shows as many full columns as fit in the center. At the left edge, columns are clamped to positions `40px × z_index` (0px, 40px, 80px, etc.), and at the right edge to `viewport_width - 40px × number_of_columns_from_the_right`. Columns at viewport edges display 40px-wide peeks showing their actual content. Clicking a partially visible column scrolls it into full view.

---

## 8. Data model and identifiers

All persistent state is represented as JSON that can be:

* Stored in browser storage.
* Sent to the LLM as context.
* Used to reconstruct UI purely from data.

### 8.1 Session

A session object contains:

* `"id"`: unique session id.
* `"title"`: session title (always equal to root node header).
* `"rootNodeId"`: id of the root node.
* `"nodes"`: map of node ids → node objects.
* `"createdAt"` / `"updatedAt"`: timestamps.

Example shape (conceptual):

{ "id": "session_123", "title": "Intro to matrix multiplication", "rootNodeId": "node_root", "nodes": { ... }, "createdAt": "ISO timestamp", "updatedAt": "ISO timestamp" }

### 8.2 Node / column

Each node represents exactly one column and contains:

* `"id"`: node id.
* `"depth"`: integer, 0 for root, 1 for its children, etc.
* `"header"`: AI-generated title string (or null before set).
* `"parent"`: either null (for root) or an object describing where this node branched from:

  * `"parentNodeId"`: id of the parent node.
  * `"parentMessageId"`: id of the message containing the selection.
  * `"selection"`:

    * `"text"`: the selected text.
    * `"startOffset"` / `"endOffset"`: character offsets within the parent message text.
* `"messages"`: array of message objects (see §8.3), in chronological order.
* Optional `"children"`: list of child node ids for convenience (can be derived but may be stored for fast traversal).

Conceptual example:

{
"id": "node_7",
"depth": 2,
"header": "Concrete example for clause X",
"parent": {
"parentNodeId": "node_3",
"parentMessageId": "msg_18",
"selection": {
"text": "the clause describing termination",
"startOffset": 120,
"endOffset": 180
}
},
"messages": [ ... ]
}

The root node has `"parent": null` and `"depth": 0`.

### 8.3 Message

Messages are stored in `node.messages` as plain JSON objects:

* `"id"`: unique within the session (e.g., "msg_5").
* `"role"`: `"user"` or `"assistant"`.
* `"text"`: message content.
* `"createdAt"`: timestamp.
* `"highlights"`: array of highlight link objects (see §8.4) for selections in this message that have branches.

Conceptual example:

{ "id": "msg_5", "role": "user", "text": "What happens if the matrix is singular?", "createdAt": "ISO timestamp", "highlights": [ ... ] }

Messages in each node are append-only: new messages are appended to the end in send order.

### 8.4 Highlights and branch links

Highlights do not exist as separate top-level entities; they are stored on the **message** level.

Each highlight entry in `message.highlights` includes:

* `"highlightId"`: unique id for the highlight.
* `"startOffset"` / `"endOffset"`: character offsets in `message.text`.
* `"text"`: the exact substring.
* `"childNodeId"`: id of the node that this highlight leads to (one child per highlight for the base spec).
* `"isActive"`: optional UI flag indicating whether this highlight’s child node lies on the **current active branch**.

Conceptual example:

{
"highlightId": "hl_9",
"startOffset": 120,
"endOffset": 180,
"text": "the clause describing termination",
"childNodeId": "node_7",
"isActive": true
}

This allows the UI to:

* Render the highlight with different tint depending on isActive.
* Navigate to the child node on click (switching the active branch).

### 8.5 Active branch and UI state

The **active branch** and lightweight UI state are stored separately from sessions:

* `"version"`: numeric schema version.
* `"activeSessionId"`: id of the current session.
* `"activeBranchNodeIds"`: ordered array of node ids forming the currently visible path from root to the current node.
* `"currentNodeId"`: id of the current/focused node (usually the last element of activeBranchNodeIds).

Optional UI state:

* `"lastFocusedNodeId"`: latest focused node in this session.
* Per-session last focused nodes if needed.

Top-level state example:

{
"version": 1,
"activeSessionId": "session_123",
"activeBranchNodeIds": ["node_root", "node_3", "node_7"],
"currentNodeId": "node_7",
"sessions": {
"session_123": { ... }
}
}

### 8.6 Persistent vs ephemeral state

**Persistent state** (stored in browser storage):

* Entire `sessions` map.
* `activeSessionId`.
* `activeBranchNodeIds`.
* `currentNodeId`.
* Node headers, messages, parent links, highlights, timestamps.

**Ephemeral state** (in memory only):

* Current text in any linear input.
* Current text in a context input field.
* Current raw text selection before a branch is created.
* Loading / error indicators.
* Scroll positions for columns.
* Hover states and other transient UI flags.

---

## 9. Local browser storage

All persistent state is stored under a **single key** in browser storage, for example `"branching_chat_state"`.

### 9.1 Initial load

On app startup:

1. The app attempts to read and parse the JSON snapshot from storage.
2. If nothing is stored:

   * Initialize with an empty state such as:
     { "version": 1, "activeSessionId": null, "sessions": {}, "activeBranchNodeIds": [], "currentNodeId": null }.
3. If parsing fails or structure is invalid:

   * Fallback to the same empty state.
   * Optionally keep the corrupted payload under a separate key for manual recovery.

### 9.2 Saving updates

Whenever a **meaningful change** happens, the in-memory state is updated and then serialized back into storage. Changes include:

* Creating a new session and its root node.
* Adding user or assistant messages to a node.
* Creating a new node via context branching.
* Updating node headers.
* Updating highlight active states.
* Changing activeSessionId, activeBranchNodeIds or currentNodeId.

To avoid excessive writes:

* Writes can be debounced:

  * After each state change, schedule a write a few hundred milliseconds later.
  * If more changes happen before the timer fires, they are coalesced into a single write.

The stored snapshot always contains a fully consistent representation of:

{ "version": 1, "activeSessionId": "...", "activeBranchNodeIds": [...], "currentNodeId": "...", "sessions": { ... } }

### 9.3 Session lifecycle

Creating a new session:

1. Generate a new session id.
2. Create a root node with:

   * depth = 0,
   * parent = null,
   * empty messages array,
   * null header initially.
3. Create a session object with:

   * rootNodeId = root node id.
   * title = null (until header is set).
4. Set activeSessionId to the new session id.
5. Set activeBranchNodeIds to `[rootNodeId]` and currentNodeId to rootNodeId.
6. Persist the state.

Deleting or closing sessions:

* Remove the session entry from `sessions`.
* If the deleted session was active:

  * Clear activeBranchNodeIds and currentNodeId or switch to another session.
* Persist the updated state.

### 9.4 Versioning

A top-level `"version"` field enables migrations:

* On load, the app checks the version.
* If it is older than the code’s current schema, apply data transformations.
* Save the transformed state back with the new version.

---

## 10. LLM payload and minimal storage

### 10.1 State used for LLM and storage

For each session:

* The **full tree** is stored as described in §8 (sessions, nodes, messages, highlights).
* Additionally, the **current branch** (visible columns) is stored as an ordered list of node ids from root to the last opened node:

```json
{
  "activeSessionId": "session_123",
  "activeBranchNodeIds": ["node_root", "node_3", "node_7"]
}
```

* The **last id** in `activeBranchNodeIds` is the current node for sending prompts.
* Scroll positions, which column is visually focused, and any hover/selection state are **never stored**; they live only in memory.

Only data needed to rebuild the branch and send minimal LLM payloads is persisted.

---

### 10.2 Building a minimal LLM request

For any turn (linear or branched), the LLM receives only:

* The **conversation history** along the current branch, as plain text.
* The **current prompt**.

No ids, timestamps, depths, or other metadata are sent.

1. Take `activeBranchNodeIds` for the current session.

2. For each node on this branch, in order from root to current:

   * Append its messages in chronological order as `{ role, text }`.
   * For every node after the root, insert a short **branch note** right before its first message, derived from the `parent.selection.text` of that node:

     *Example branch note text:*
     `[Branch created from previous text: "the clause describing termination"]`

3. The last user input (from the linear or context input) is sent separately as `prompt`.

Resulting request shape:

```json
{
  "history": [
    {
      "role": "user",
      "text": "Explain matrix multiplication in simple terms."
    },
    {
      "role": "assistant",
      "text": "Matrix multiplication combines rows and columns..."
    },
    {
      "role": "user",
      "text": "[Branch created from previous text: \"the clause describing termination\"]"
    },
    {
      "role": "user",
      "text": "Can you give a concrete example of that termination clause?"
    },
    {
      "role": "assistant",
      "text": "Sure, imagine a contract that ends when..."
    }
  ],
  "prompt": "Rewrite that example so a beginner lawyer can understand it."
}
```

All highlight/branch information that matters to the LLM is encoded in these branch note lines; no separate highlight objects, node ids, or selection offsets are sent.

---

### 10.3 LLM response and state update

The LLM responds with a single JSON object:

```json
{
  "header": "Beginner-friendly termination clause example",
  "message": "Here is a simple explanation in **markdown**..."
}
```

* `header`: short title for the current node.
* `message`: full reply in markdown, to be stored as an assistant message and rendered as such.

On successful response:

1. The user message with the current `prompt` is already present in the current node’s `messages` (it was added immediately when the user sent it).
2. It appends an assistant message with `role: "assistant"` and `text: message` to the current node’s `messages`.
3. If the node’s `header` is null, it is set to `header`.
   *If this is the root node, the session title is also set to the same string (§6).*
4. The updated session, nodes, messages and `activeBranchNodeIds` are written back to browser storage (debounced as in §9.2).

---

## 11. Data flow for common actions

### 11.1 Sending the first prompt in a session

1. User

   * Focuses the root column’s linear input.
   * Types a prompt and sends it.

2. App

   * `activeBranchNodeIds = ["node_root"]`, `currentNodeId = "node_root"`.
   * Builds the LLM request:

     * `history`: all messages along the active branch (none yet for a brand-new session).
     * `prompt`: the typed text.
   * Sends:

     ```json
     {
       "history": [],
       "prompt": "Explain matrix multiplication in simple terms."
     }
     ```

3. On LLM response

   * Receives:

     ```json
     {
       "header": "Intro to matrix multiplication",
       "message": "Matrix multiplication combines rows and columns..."
     }
     ```

   * The user message was appended to the root node’s `messages` when it was sent; on response, only the assistant message is appended:

     ```json
     { "id": "msg_2", "role": "assistant", "text": "Matrix multiplication combines rows and columns..." }
     ```

   * Sets the root node’s `header = "Intro to matrix multiplication"`.

   * Sets `session.title` to the same string.

   * Updates timestamps and persists state (sessions, nodes, `activeBranchNodeIds`, `currentNodeId`).

---

### 11.2 Continuing in the current column

1. User

   * Types into the linear input field of the current node (last id in `activeBranchNodeIds`) and sends.

2. App

   * `currentNodeId` is the node being continued.

   * Builds `history` from `activeBranchNodeIds` in order:

     * For each node on the branch:

       * Appends all its existing messages as `{ role, text }`.
       * For non-root nodes, just before their first message, appends a branch note line derived from `parent.selection.text`, for example:

         ```json
         {
           "role": "user",
           "text": "[Branch created from previous text: \"the clause describing termination\"]"
         }
         ```

   * Sets `prompt` to the new input text.

   * Sends:

     ```json
     {
       "history": [ { "role": "user", "text": "..." }, { "role": "assistant", "text": "..." }, ... ],
       "prompt": "Follow-up question here..."
     }
     ```

3. On LLM response

   * Receives:

     ```json
     {
       "header": "Refined explanation of X",
       "message": "Here is a clearer explanation in markdown..."
     }
     ```

   * The user message was appended to the current node’s `messages` when it was sent; on response, only the assistant message is appended:

     ```json
     { "id": "msg_n+1", "role": "assistant", "text": "Here is a clearer explanation in markdown..." }
     ```

   * If the node’s `header` is null, sets it to `"Refined explanation of X"`; otherwise keeps the existing header.

   * Persists updated state.

---

### 11.3 Creating a branch via context input

1. User

   * Selects text in a message in node **P**.
   * Context input appears above the selection.
   * Types a context question and sends.

2. App

   * Captures the selection:

     * `parentNodeId = P.id`.
     * `parentMessageId =` id of the message containing the selection.
     * `selection = { text, startOffset, endOffset }`.

   * Creates a new node **C**:

     ```json
     {
       "id": "node_C",
       "depth": P.depth + 1,
       "header": null,
       "parent": {
         "parentNodeId": "node_P",
         "parentMessageId": "msg_18",
         "selection": {
           "text": "the clause describing termination",
           "startOffset": 120,
           "endOffset": 180
         }
       },
       "messages": []
     }
     ```

   * Adds a highlight entry to the parent message pointing to `childNodeId = "node_C"`.

   * Updates branch state:

     * Takes the prefix of `activeBranchNodeIds` up to and including `P.id`.
     * Sets `activeBranchNodeIds = [ ..., "node_P", "node_C" ]`.
     * Sets `currentNodeId = "node_C"`.

   * Builds `history` for the **new** active branch using the same rules as in 11.2:

     * All messages from root to P.
     * A branch note for C based on `selection.text`, e.g.:

       ```json
       {
         "role": "user",
         "text": "[Branch created from previous text: \"the clause describing termination\"]"
       }
       ```

   * Sets `prompt` to the context question.

   * Sends:

     ```json
     {
       "history": [ ... ],
       "prompt": "Can you give a concrete example of that termination clause?"
     }
     ```

3. On LLM response

   * Receives:

     ```json
     {
       "header": "Concrete termination clause example",
       "message": "Here is a concrete example in **markdown**..."
     }
     ```

   * The user message was appended to node C’s `messages` when it was sent; on response, only the assistant message is appended:

     ```json
     { "id": "msg_k+1", "role": "assistant", "text": "Here is a concrete example in **markdown**..." }
     ```

   * Sets `node_C.header = "Concrete termination clause example"`.

   * Persists updated `sessions`, `activeBranchNodeIds`, `currentNodeId`.

---

### 11.4 Switching branches via highlight

1. User

   * Clicks a pale (inactive) highlight in node **A** that points to node **B**.

2. App

   * Reconstructs the path from the root to **B** by following `parent.parentNodeId` links, then reversing:

     ```json
     activeBranchNodeIds = ["node_root", "node_3", "node_B"]
     ```

   * Sets `currentNodeId = "node_B"`.

   * Updates `isActive` flags in `message.highlights`:

     * Highlights whose `childNodeId` is in `activeBranchNodeIds` and immediately followed on the branch become active (bright).
     * Other highlights become inactive (pale).

   * Rerenders columns to match the new `activeBranchNodeIds`.

3. No LLM request is made; branch switching reads and updates only the stored tree and branch state, then persists those changes.

---

## 12. Simplicity and extensibility

The model is intentionally minimal:

* **Single structural entity**: the node (column), with parent links, messages, and highlights.

* **Single source of truth**: one JSON state in memory, mirrored in browser storage.

* **Single LLM shape**: every call uses the same structure:

  ```json
  {
    "history": [ { "role": "user" | "assistant", "text": "..." }, ... ],
    "prompt": "..."
  }
  ```

  and always receives:

  ```json
  {
    "header": "Short node title",
    "message": "Full reply in markdown..."
  }
  ```

* **Single branching mechanism**: always from a text selection in a message, creating a child node with a parent link and a highlight in the parent message.

* **Single visible view**: only nodes along `activeBranchNodeIds` are shown as columns at any time.

Extensibility hooks:

* Nodes can be extended with additional fields (e.g. `tags`, `summary`, `pinned`).
* Messages can gain extra fields (e.g. `isDraft`, `attachments`, `editedAt`).
* Highlights can be extended to support multiple child nodes per selection or richer metadata if needed.
* Extra LLM behaviors can be layered on top of the same `{ history, prompt } → { header, message }` pattern (e.g. by encoding simple instructions into the prompt).

These additions do not change the core rules:

* One node per column.
* Highlights link selections to child nodes.
* The active branch is the only branch rendered as columns; the rest of the tree remains accessible via highlights.

---

## 13. Routing and URLs

The app uses client-side routing to represent sessions and branches in the URL, allowing direct navigation to specific nodes in the conversation tree.

### 13.1 URL structure

**Root route:**

* When a session root node is created, its header becomes both the session name and the root column header.
* The URL for a session's root is:

  * `/[root-node-name]`
  * where `[root-node-name]` is derived from the root node's header (slugified for URL safety).

**Branch routes:**

* As soon as a child node is created under the root, the URL represents the current branch from the root to the currently open node:

  * Format: `/[root-node-name]/[end-node-name]`
  * `[root-node-name]` is derived from the session root header.
  * `[end-node-name]` is derived from the header of the last (deepest, current) node in the active branch.
* The URL always reflects:

  * The session root (first segment).
  * The current end node of the active branch (last segment).

### 13.2 Opening by route and initial scroll positions

**Opening a root route** (`/[root-node-name]`):

* The app loads the session with that root node.
* The active branch contains only the root node.
* The root column is displayed.

**Opening a branch route** (`/[root-node-name]/[end-node-name]`):

* The app reconstructs the branch from the root node to the node corresponding to `[end-node-name]`.
* **Horizontal scroll position:**

  * The horizontal scroll is positioned all the way to the end (rightmost position).
  * The deepest (last) column in the branch is fully visible on the right side of the viewport.
  * Earlier columns may appear as full columns or as collapsed edge bars on the left, according to the horizontal layout rules.
* **Vertical scroll positions:**

  * For every column that has a child created from a highlight:

    * The column is vertically scrolled so that the highlight that spawned its child is centered vertically in that column's visible area (between the header and the bottom input region).
  * For the last (deepest) column in the branch:

    * The column is vertically scrolled to the bottom, so that the latest messages are visible.

---

## 14. Technology stack

### 14.1 Framework and language

* A React-based SPA or hybrid app using **TypeScript**.
* The UI is implemented in **React**:

  * Horizontal stack of columns for `activeBranchNodeIds` with edge-bar collapse behavior.
  * Per-column vertical scroll containers with message lists and linear inputs.
  * Context input, highlights, and branching interactions.
  * Top bar with branch address line and session dropdown.

All conversation state is managed on the client and hydrated from browser storage on load.

### 14.2 Styling and UI components

* **Tailwind CSS** (or a similar utility-first framework) for:

  * Minimalistic layout.
  * Helvetica (or system sans-serif) typography.
  * Thin gray separators between top bar, columns, and edge bars.
  * Root column width (e.g. `max-w-3xl`), spacing, alignment.
  * User message style (right-aligned, 80% width, light gray background).

* **Lucide icons** for:

  * Chevrons-up-down in the session segment of the top bar.
  * Arrow-down in the root placeholder.
  * Trash-2 for session deletion.
  * Any other simple glyphs if needed.

* Small, composable components (buttons, dropdown, input fields, context input).

### 14.3 Client state and persistence

* A global store holds:

  ```json
  {
    "version": 1,
    "activeSessionId": "session_123",
    "activeBranchNodeIds": ["node_root", "node_3", "node_7"],
    "currentNodeId": "node_7",
    "sessions": {
      "session_123": {
        "id": "session_123",
        "title": "Intro to matrix multiplication",
        "rootNodeId": "node_root",
        "nodes": {
          "node_root": { ... },
          "node_3": { ... },
          "node_7": { ... }
        }
      }
    }
  }
  ```

* Implementation options:

  * React context + reducer, or
  * A lightweight state library (e.g. Zustand).

* On startup:

  * Read JSON from `localStorage` under a single key.
  * If missing or invalid, initialize with an empty default state.

* On each meaningful change (new node, new message, header update, branch switch):

  * Update the in-memory store.
  * Debounced write of the full snapshot back to `localStorage`.

Scroll positions, focus, and selections are not persisted.

### 14.4 LLM integration

* A single backend endpoint (e.g. `/api/chat`) mediates all LLM calls.

* Client sends:

  ```json
  {
    "history": [
      { "role": "user", "text": "..." },
      { "role": "assistant", "text": "..." },
      { "role": "user", "text": "[Branch created from previous text: \"...\"]" },
      { "role": "user", "text": "Follow-up question..." },
      { "role": "assistant", "text": "..." }
    ],
    "prompt": "New question here..."
  }
  ```

  where `history` is built from the current `activeBranchNodeIds` and branch notes, and `prompt` is the current input.

* Server:

  * Reads the OpenAI API key from environment variables.

  * Sends a system message describing the expected JSON output and that `history` + `prompt` form the context.

  * Sends the `{ history, prompt }` object as the content of a user message.

  * Parses the model’s JSON response:

    ```json
    {
      "header": "Short node title",
      "message": "Markdown reply..."
    }
    ```

  * Returns this object directly to the client.

The client never sees or stores the API key.

### 14.5 Data flow between UI, storage and LLM

For any turn (linear or context):

1. **UI**

   * User submits text via a linear input (current node) or context input (new branch).

2. **State**

   * If it’s a context turn, create a new node with parent link and highlight, update `activeBranchNodeIds` and `currentNodeId`.

   * Build `history` from `activeBranchNodeIds`:

     * For each node, append its messages in `{ role, text }` form.
     * For non-root nodes, insert a branch note line just before that node’s first message.

   * Set `prompt` to the current input text.

3. **Network**

   * Send `{ history, prompt }` to `/api/chat`.

4. **Response**

   * Receive `{ header, message }`.
   * Append a user message with `prompt` and an assistant message with `message` to the target node’s `messages`.
   * If the node’s header is null, set it to `header`.

     * If this is the root node, set the session title to the same string.
   * Persist the updated JSON snapshot (state + sessions) to `localStorage`.

The UI always renders from the in-memory store; browser storage is only a durable snapshot.

---

# Implementation

## Phase 1: Core data layer and state management

* Define the complete data model as TypeScript interfaces:
  * **Session**: `id`, `title`, `rootNodeId`, `nodes` (map of node id → node object), `createdAt`, `updatedAt`
  * **Node**: `id`, `depth`, `header`, `parent` (null for root, or object with `parentNodeId`, `parentMessageId`, `selection`), `messages` array, optional `children` array
  * **Message**: `id`, `role` ("user" | "assistant"), `text`, `createdAt`, `highlights` array
  * **Highlight** (embedded in messages, not top-level): `highlightId`, `startOffset`, `endOffset`, `text`, `childNodeId`, optional `isActive`
* Implement browser storage layer:
  * Single-key localStorage (`"branching_chat_state"`) for entire app state
  * JSON serialization/deserialization with error handling
  * Debounced save mechanism (few hundred ms delay, coalescing multiple updates)
  * Versioning support with `version` field at root level for future migrations
  * Initial load: parse from storage, fallback to empty state if missing/invalid
* Create global state management (React Context + reducer preferred) with complete structure:
  * Implement as BranchingProvider wrapping the app, consumed via useBranchingContext hook
  * Keep state management pure - UI state (loading, drafts) and LLM calls belong in separate hooks/components
  * Top-level fields: `version`, `activeSessionId`, `activeBranchNodeIds`, `currentNodeId`
  * `sessions` map: session id → session object (containing nodes map)
  * Optional: `lastFocusedNodeId` per session for restoring focus
  * State update functions for all operations
* Implement core tree operations and utilities:
  * Create new session with root node (depth 0, parent null, empty messages, null header)
  * Add message to existing node (append to messages array)
  * Create child node with parent link (increment depth, store selection reference)
  * Build active branch path from root to any node (traverse parent links, reverse)
  * Switch active branch to different path (update activeBranchNodeIds and currentNodeId)
  * Update highlight isActive flags based on current branch
  * Generate unique IDs for sessions, nodes, messages, and highlights
* Set up persistent vs ephemeral state boundaries:
  * Persistent: sessions, nodes, messages, highlights, activeBranchNodeIds, currentNodeId, timestamps
  * Ephemeral (not stored): input field contents, selections, loading states, scroll positions

## Phase 2: Basic single-column UI

* Set up global layout constraints (per §3.1):
  * White background on page
  * Page itself (html/body) does not scroll vertically
  * Helvetica typeface (or system sans-serif fallback) for all text
  * Thin gray lines to separate UI areas
* Implement root column component with (per §3.2, §3.3):
  * Fixed-width container (~768px, max-w-3xl in Tailwind)
  * Full viewport height below top bar (from top bar bottom to viewport bottom)
  * Independent vertical scroll container (scrolls within its bounds, not the page)
  * Additional padding at bottom to prevent linear input overlap with content
* Create column header area (per §3.3):
  * AI-generated h3 header displaying node's header text
  * Fixed at top of the column's scrollable area
  * Initially null: show gray rounded placeholder block until LLM provides header
* Create message components (per §3.4):
  * **User message**: right-aligned, max width ~80% of column width, light gray background, minimal border radius, supports markdown formatting input
  * **LLM message**: left-aligned, full column width, no background container, markdown rendering (headings, lists, code, emphasis)
  * Messages display in strict chronological order: user → LLM → user → LLM...
* Implement linear input field (per §3.2, §3.5):
  * Positioned at bottom of column, floating above content
  * White text input area with minimal padding from column edges and bottom
  * Minimal corner rounding
  * Placeholder text: "Ask anything"
  * Integrated Send button on right side of input
  * Submit triggers: Enter key or Send button click
  * On send: create user message, send LLM request, append assistant response
* Create initial empty state for new session (per §3.2):
  * Centered placeholder block in main area with:
    * Text: "A new rabbithole entrance is right here"
    * Lucide "arrow-down" icon below the text
  * Placeholder disappears permanently after first message is sent
  * Linear input still visible and functional at bottom

## Phase 3: Top bar and navigation

* Implement fixed top bar (per §3.1, §6):
  * Viewport-wide bar fixed at top, spans full width
  * Functions as branch "address line" reflecting current active branch
  * Thin gray line at bottom edge to separate from main content
  * Structure from left to right:
    1. **App name** (far left, uppercase)
    2. **Slash separator** (`/`)
    3. **Session segment** containing:
       * Session name (always equals root node header)
       * Lucide chevrons-up-down icon
       * Represents both the session and its root node
       * Clickable to open session list dropdown
    4. **Path segments** (if branch has more than root node):
       * Slash separator before each segment
       * One segment per node/column along active branch (after root)
       * Ordered from root to current node
       * Labels taken from node/column headers
       * Format: `[APP NAME] / [session name + icon] / [second column title] / [third column title] / ...`
       * Display-only (not clickable)
* Create session list dropdown (per §6):
  * Triggered by clicking session segment (session name + chevrons-up-down icon)
  * Lists all sessions, each item showing:
    * Session name (root node header)
    * Lucide trash-2 button for deletion
  * Current session is clearly highlighted/distinguished
  * Clicking a session item:
    * Switches activeSessionId in data model
    * Loads the tree for that session
    * Reconstructs and renders active branch (typically root to last focused node)
    * Closes the dropdown
  * Clicking trash-2 button:
    * Deletes the session from sessions map
    * If deleted session was active, switch to another session or clear state
    * Updates localStorage
* Session title synchronization (per §6):
  * Session title always equals root node header (they are identical)
  * When LLM proposes header for root node, session title is set to exactly that string
  * Session segment displays this synchronized value
* Dynamic updates:
  * Top bar path segments update whenever activeBranchNodeIds changes
  * Number and order of segments always match currently visible columns
  * Session name updates when root node header is set by LLM

## Phase 4: LLM integration

* Create `/api/chat` endpoint (per §14.4):
  * Read OpenAI API key from environment (never expose to client)
  * Accept `{ history, prompt }` payload
  * Send system message describing expected JSON output
  * Send `{ history, prompt }` as content of user message to LLM
  * Parse model's JSON response: `{ header, message }`
  * Return response object directly to client
* Implement client-side LLM request builder (per §10.2):
  * Build history from activeBranchNodeIds (all nodes on current branch)
  * For each node in order from root to current:
    * For non-root nodes, insert branch note as first message:
      * Format: `{ role: "user", text: "[Branch created from previous text: \"<selection.text>\"]" }`
      * Derived from `node.parent.selection.text`
    * Append all node messages in chronological order as `{ role, text }`
  * Set `prompt` to current user input (linear or context)
  * Send: `{ history: [...], prompt: "..." }`
* Handle user input submission:
  * Immediately append user message to current node's messages array
  * Then send LLM request (user message already in state before request)
* Handle LLM response (per §10.3):
  * Parse response: `{ header, message }`
  * Append assistant message with `role: "assistant"` and `text: message`
  * If node's `header` is null, set it to response `header`
  * If this is the root node, also set session title to same string
  * Update activeBranchNodeIds and currentNodeId in state
  * Persist entire state to localStorage with debouncing (§9.2)
* Add loading states and error handling:
  * Loading indicator while waiting for LLM response
  * Error handling for network failures
  * Error handling for malformed responses

## Phase 5: Text selection and context input

* Implement text selection detection (per §5.1):
  * Listen for selection change events in any message
  * Validate selection is **non-empty** AND within single message only
  * If valid, capture selection text and character offsets (startOffset, endOffset)
  * If valid, show context input; otherwise hide it
  * Support cancellation by clicking outside or clearing selection
* Create context input component (per §3.5, §5.1):
  * A **mini version** of the linear input with **smaller width**
  * Minimal rounding and styling
  * Positioned directly **above** selected text, anchored visually to it
  * Integrated Send button
  * Submit triggers: Enter key OR Send button click
  * Auto-focus when appearing
* Handle context input submission (per §5.2, §11.3):
  1. **Capture and clear selection:**
     * Store `parentNodeId` (node containing selection)
     * Store `parentMessageId` (message containing selection)
     * Store `selection = { text, startOffset, endOffset }`
     * Clear/cancel the selection (as if user clicked out or pressed Esc)
  2. **Create new child node** with structure:
     * Generate unique `id`
     * Set `depth = parentNode.depth + 1`
     * Set `header = null` (placeholder shown until LLM responds)
     * Set `parent = { parentNodeId, parentMessageId, selection }`
     * Initialize `messages = []` (empty array)
     * Add node to sessions map
  3. **Add highlight to parent message:**
     * Create highlight entry in parent message's `highlights` array
     * Include: `highlightId`, `startOffset`, `endOffset`, `text`, `childNodeId` (pointing to new node)
  4. **Create new column to the right** (per §3.5):
     * New column becomes last column in active branch
  5. **Update branch state:**
     * Take prefix of `activeBranchNodeIds` up to and including `parentNodeId`
     * Append new node id to end: `activeBranchNodeIds = [...prefix, newNodeId]`
     * Set `currentNodeId = newNodeId`
  6. **Show header placeholder:**
     * Display gray slightly rounded placeholder block for header until LLM responds (§5.2 step 4)
  7. **Append user message to new node:**
     * Add user message with context prompt text to new node's `messages` array
     * This happens BEFORE LLM request is sent
  8. **Build and send LLM request:**
     * Build `history` from updated `activeBranchNodeIds` including branch note for new node
     * Set `prompt` to context input text
     * Send `{ history, prompt }` to `/api/chat` (using Phase 4 logic)
  9. **Hide context input**
  10. **On LLM response** (handled by Phase 4 logic):
     * Append assistant message to new node
     * Set node header from response
     * Persist state with debouncing
* Render highlights in messages (per §5.3):
  * Highlights represent selections that **already have branches** (persistent visual marks)
  * For each highlight in message.highlights array:
    * Render visual mark on text range (startOffset to endOffset)
    * **Active highlight** (child node is on current active branch):
      * Appears **brighter or more saturated**
      * Child node is displayed in column to the right
    * **Inactive highlight** (child node NOT on current active branch):
      * Appears **paler** but still visible
      * Child node is not currently displayed
  * Click handlers:
    * **Clicking inactive highlight:**
      * Reconstruct path from root to highlight's child node
      * Update `activeBranchNodeIds` to new path (ending at child node, no further columns)
      * Set `currentNodeId` to child node
      * Hide any columns that were to the right of parent
      * Show child node's column instead
      * Update all highlight `isActive` flags based on new branch
      * Clicked highlight becomes active (bright)
      * Re-render columns for new active branch
    * **Clicking active highlight** (when multiple branches exist from same selection):
      * Show small chooser UI to pick specific branch
      * On choice, apply same logic as inactive highlight click

## Phase 6: Multi-column layout with simple horizontal scroll

Note: This phase implements a simplified multi-column layout with basic side-by-side positioning. Advanced layout features (edge overlapping, clamping) are deferred to Phase 9.

* Implement horizontal column stack:
  * Render one column per node in activeBranchNodeIds (in order)
  * Each column positioned side by side with full width (~768px)
  * Columns arranged left to right: root → deepest
  * Simple horizontal scrollable container (standard CSS overflow-x: auto)
  * All columns fully visible when scrolled into view (no partial visibility yet)
  * Main content area positioned below top bar (from Phase 3)
* Add visual separation:
  * Thin vertical gray lines between adjacent columns (per §3.1, §3.3)
* Set up z-index stacking:
  * Root column at bottom (z-index: 0)
  * Each subsequent child layers on top (z-index increments by depth)
  * Note: Visual effect not apparent in side-by-side layout, but prepares for Phase 9
* Implement per-column vertical scrolling (per §3.3, §4.2):
  * Each column is independent vertical scroll container
  * Column height spans from below top bar to viewport bottom
  * Content scrolls within column between header and bottom
  * No vertical sync between columns
  * Page itself (html/body) does not scroll vertically
  * Additional padding at bottom of each column to prevent linear input overlap
* Show/hide linear input based on current column (per §3.3, §3.5):
  * Only current/focused column shows active linear input
  * Active input floats at bottom of its column, stays in viewport
  * Other columns hide their linear inputs completely
* Implement column focus management (per §4.1):
  * Click anywhere in column (header, message area, input) to focus it
  * Focused column has normal appearance
  * Non-focused columns are 15% paler (reduce opacity or desaturate)
  * Update currentNodeId in state on focus change
  * Persist focus change to localStorage
* Add horizontal scroll behavior (per §4.3, §4.4):
  * Standard scrollbar on desktop
  * Horizontal drag/swipe on touch devices
  * Prevent browser back/forward gesture: overscroll-behavior-x: none on html/body (per §4.4)
  * Scroll position is NOT persisted (ephemeral state per §8.6)

## Phase 7: Branch switching and highlight interaction

* Implement **inactive highlight** click handler (per §5.3, §11.4):
  * User clicks a pale (inactive) highlight that points to child node
  * Reconstruct path from root to clicked highlight's child node:
    * Follow `parent.parentNodeId` links backwards from child node to root
    * Reverse the path to get ordered array from root to child
    * Result: `activeBranchNodeIds = ["node_root", ..., "node_child"]`
  * Update branch state:
    * Set `activeBranchNodeIds` to new path (ending at child node)
    * Set `currentNodeId` to child node id
  * Update column visibility:
    * Hide any columns that were to the right of parent column
    * Show child node's column instead (as last column in branch)
    * **Other columns remain unchanged** (columns before parent stay visible)
  * Update `isActive` flags in **all** `message.highlights` across all nodes:
    * Highlights whose `childNodeId` is in new `activeBranchNodeIds` AND immediately followed on the branch become active (bright)
    * All other highlights become inactive (pale)
  * The clicked highlight becomes active (bright)
  * Re-render columns to match new `activeBranchNodeIds`
  * **No LLM request is made** - this is pure navigation
  * Persist changes to localStorage (updated `activeBranchNodeIds`, `currentNodeId`, highlight flags)
* Implement **active highlight** click handler (per §5.3):
  * Applies when clicking an active highlight AND either:
    * Multiple branches exist from the same selection, OR
    * Multiple highlights intersect at the clicked character
  * Show small chooser UI to pick specific branch
  * On user selection from chooser:
    * Apply same logic as inactive highlight click (above)
    * Switch to chosen branch
* Verify highlight appearance updates correctly:
  * Active highlights appear **brighter or more saturated**
  * Inactive highlights appear **paler** but still visible
  * Visual transition on branch switch (smooth feedback)

## Phase 8: URL routing and deep linking

* Set up client-side routing (per §13.1):
  * **Root route**: `/[root-node-name]`
    * `[root-node-name]` is derived from the root node's header (slugified for URL safety)
    * Represents session at root level
  * **Branch route**: `/[root-node-name]/[end-node-name]`
    * `[root-node-name]` derived from session root header (slugified)
    * `[end-node-name]` derived from header of the last (deepest, current) node in active branch (slugified)
    * Format always reflects: session root (first segment) + current end node of active branch (last segment)
  * Use a routing library (e.g., React Router, Next.js App Router) for client-side navigation
* Implement route handling for **root route** (per §13.2):
  * Parse `/[root-node-name]` from URL
  * Load session with that root node name
  * Set `activeBranchNodeIds = [rootNodeId]` (only root node)
  * Set `currentNodeId = rootNodeId`
  * Display root column only
* Implement route handling for **branch route** (per §13.2):
  * Parse `/[root-node-name]/[end-node-name]` from URL
  * Load session with that root node name
  * Find node with header matching `[end-node-name]`
  * Reconstruct branch from root to that end node:
    * Follow `parent.parentNodeId` links backwards from end node to root
    * Reverse to get ordered path from root to end
  * Set `activeBranchNodeIds` to reconstructed path
  * Set `currentNodeId` to end node id
  * Display all columns along the branch
* Update URL when active branch changes:
  * When creating new child node (context input submission)
  * When switching branches (highlight click)
  * When continuing linearly (if it changes the end node)
  * Update URL to match new `activeBranchNodeIds` structure
  * Use slugified header of last node in `activeBranchNodeIds` for `[end-node-name]`
* Handle invalid/missing routes gracefully:
  * If root node name not found: redirect to default or show error
  * If end node name not found: fall back to root route or show error
  * If slugs are ambiguous: use additional logic (e.g., node IDs in query params if needed)
* Set initial scroll positions when opening branch routes (per §13.2):
  * **Horizontal scroll position:**
    * Scroll all the way to the end (rightmost position)
    * Deepest (last) column in branch is fully visible on right side of viewport
    * Earlier columns may appear as full columns or as collapsed edge bars on left (per horizontal layout rules from Phase 9)
  * **Vertical scroll positions:**
    * For every column that has a child created from a highlight (i.e., not the last column):
      * Scroll that column vertically so the highlight that spawned its visible child is **centered** in the column's visible area
      * Center between the header at top and the bottom input region
      * This ensures continuity: you can see what was selected to create the next branch
    * For the last (deepest) column in the branch:
      * Scroll to the **bottom** so that the latest messages are visible
      * User sees most recent conversation in the current node

## Phase 9: Advanced horizontal layout with overlapping columns

Note: This phase replaces the simple side-by-side layout from Phase 6 with the advanced overlapping edge behavior described in §4.5.

* Implement layout geometry (per §4.5):
  * Each column has **fixed width of approximately 768px** (Tailwind max-w-3xl)
  * **Column position** is defined by the position of its **left edge**
  * **Standard offset** is 40px (used for edge constraints)
  * Z-index stacking from Phase 6 (root at bottom, children layer on top) allows left columns to **slide under right neighbors** as scrolling occurs
* Implement edge constraint system (per §4.5):
  * **Left edge constraint**: A column cannot have its left edge positioned to the left of `standard_offset × z_index`
    * Formula: `left_edge >= 40px × z_index`
    * Example: column with z_index 0 (root) can go to 0px, z_index 1 cannot go farther left than 40px, z_index 2 cannot go farther left than 80px, etc.
  * **Right edge constraint**: Columns stack at right edge with 40px spacing
    * The column with biggest z_index (rightmost) cannot have left edge beyond `viewport_width - 40px`
    * Next column (second-to-last) cannot have left edge beyond `viewport_width - 80px`
    * Formula: `left_edge <= viewport_width - 40px × (total_columns - z_index)`
  * **Example with 10 columns** (per §4.5):
    * Column 0: range `0px` to `viewport_width - 400px`
    * Column 1: range `40px` to `viewport_width - 360px`
    * Column 2: range `80px` to `viewport_width - 320px`
    * ...
    * Column 8: range `320px` to `viewport_width - 80px`
    * Column 9: range `360px` to `viewport_width - 40px`
* Update column positioning logic (per §4.5):
  * **Root column position is always 0** (left edge aligned with viewport's left edge)
  * **Normal positioning**: Other columns follow side by side, with right edge of left column aligned with left edge of right column (columns normally ~768px apart)
  * **Clamped positioning**: When constraints are violated by scrolling, clamp column positions to stay within constraints
  * Multiple columns stack at edges maintaining 40px spacing
* Implement center region behavior (per §4.5):
  * Columns positioned within viewport's visible area and **not overlapped by higher-z-index neighbors** appear fully
  * Display complete content: header, messages, highlights, linear input (if active)
  * As many columns as can fit fully in viewport are shown completely
* Implement left edge behavior (per §4.5):
  * As user scrolls right, earlier columns on left slide under right neighbors (due to z-index stacking)
  * Columns that would scroll off-screen are clamped by left edge constraint
  * When multiple columns clamped at left edge:
    * They stack horizontally maintaining 40px spacing
    * Column 0 shows at 0px with leftmost 40px visible
    * Column 1 shows at 40px with leftmost 40px visible
    * And so on
  * **Important**: Stacked columns show their **actual layout and content** within visible 40px-wide slice, **not a special collapsed state**
* Implement right edge behavior (per §4.5):
  * Maximum scroll position constrained by right edge constraint
  * When scrolled all the way right:
    * Rightmost column's left edge positioned at `viewport_width - 40px`
    * Next-to-last column's left edge at `viewport_width - 80px`
    * Next at `viewport_width - 120px`, and so on
    * Maintains 40px spacing
  * When multiple columns extend beyond right viewport edge:
    * They stack horizontally at right edge
    * Each displays 40px-wide slice of their leftmost content
  * **Important**: Stacked columns show their **actual layout and content** within visible 40px-wide slice
* Add click-to-expand for partially visible columns (per §4.5):
  * Clicking or tapping anywhere in a partially visible column triggers:
    * Horizontal scroll to bring that column into full view
    * Focus that column (update currentNodeId)
* Implement focus point algorithm for scroll-based focus (per §4.1):
  * As user scrolls horizontally:
    * Compute how far scroll position is between left and right ends (as percentage from 0% to 100%)
    * Place invisible **focus point** inside viewport at same percentage between its left and right edges
    * **Focused column** is always the one that covers this focus point
    * Update currentNodeId to focused column
  * User can focus on column without scrolling by clicking/interacting with it (per Phase 6)
  * **But**: As soon as content is horizontally scrolled for more than 5% of viewport width, scroll algorithm takes control back
  * This creates smooth focus behavior during scrolling while preserving manual focus control