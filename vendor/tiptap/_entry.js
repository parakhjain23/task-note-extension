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
export { StarterKit, Placeholder, TaskList, TaskItem, Suggestion };
