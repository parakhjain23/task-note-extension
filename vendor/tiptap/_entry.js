// Bundle entry for the vendored Tiptap ESM build.
// Rebuild with:
//   npm run build:editor
export { Editor, Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
// StarterKit ships bullet/ordered lists but not task lists, so pull those in.
import { TaskList, TaskItem } from '@tiptap/extension-list';
// Powers the "/" block menu.
import Suggestion from '@tiptap/suggestion';
// Markdown parsing/serialization: enables pasting markdown text and
// `insertContent(..., { contentType: 'markdown' })`.
import { Markdown } from '@tiptap/markdown';
// Tables: StarterKit doesn't include them, but pasted Google Docs / markdown
// content needs table nodes in the schema or they get stripped.
import { TableKit } from '@tiptap/extension-table';
// Highlight mark: "==text==" in markdown, <mark> in HTML, and (via the
// parseHTML extension in rich-editor.js) Google Docs background-color spans.
import { Highlight } from '@tiptap/extension-highlight';
export { StarterKit, Placeholder, TaskList, TaskItem, Suggestion, Markdown, TableKit, Highlight };
