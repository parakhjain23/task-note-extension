// Bundle entry for the vendored Tiptap ESM build.
// Rebuild with:
//   npx esbuild vendor/tiptap/_entry.js --bundle --format=esm --minify --outfile=vendor/tiptap/tiptap.mjs
export { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
export { StarterKit, Placeholder };
