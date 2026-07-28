// Link prompt shared by the "/" menu and the Mod+Shift+K shortcut.
// Kept separate from rich-editor.js so the slash menu doesn't import it back.

// Ask for a URL, seeded with the existing href when editing an existing link.
export function promptForLink(editor) {
  const previous = editor.getAttributes('link').href || '';
  const input = window.prompt('Link URL (leave empty to remove)', previous);
  if (input === null) return;
  const url = input.trim();
  if (!url) {
    editor.chain().focus().unsetLink().run();
    return;
  }
  // Bare domains like "example.com" would otherwise resolve relative to the
  // extension origin.
  const href = /^(https?:\/\/|mailto:|tel:|#|\/)/i.test(url) ? url : `https://${url}`;
  // With an empty selection, insert the URL as its own linked text.
  if (editor.state.selection.empty && !editor.isActive('link')) {
    editor
      .chain()
      .focus()
      .insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href } }] })
      .run();
    return;
  }
  editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
}
