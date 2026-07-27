// Helpers for normalizing stored rich-text content to HTML (for Tiptap) and
// back to plain text (for search / thumbnails). Task descriptions written by
// the old Editor.js integration are stored as Editor.js block JSON; this module
// converts them to HTML on read so nothing is lost after the Tiptap migration.

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Legacy Editor.js block data -> HTML string.
export function editorJsToHtml(data) {
  if (!data?.blocks?.length) return '';
  return data.blocks
    .map((block) => {
      const d = block.data || {};
      switch (block.type) {
        case 'header': {
          const level = [2, 3, 4].includes(d.level) ? d.level : 3;
          return `<h${level}>${d.text || ''}</h${level}>`;
        }
        case 'paragraph':
          return `<p>${d.text || ''}</p>`;
        case 'list': {
          const tag = d.style === 'ordered' ? 'ol' : 'ul';
          const items = (d.items || [])
            .map((i) => `<li>${typeof i === 'string' ? i : i.content || ''}</li>`)
            .join('');
          return `<${tag}>${items}</${tag}>`;
        }
        case 'checklist': {
          const items = (d.items || [])
            .map((i) => `<li>${i.checked ? '☑' : '☐'} ${i.text || ''}</li>`)
            .join('');
          return `<ul>${items}</ul>`;
        }
        default:
          return '';
      }
    })
    .filter(Boolean)
    .join('');
}

// Normalize any stored description value to an HTML string for Tiptap.
export function descriptionToHtml(value) {
  if (!value) return '';
  if (typeof value === 'object' && value.blocks) return editorJsToHtml(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed?.blocks) return editorJsToHtml(parsed);
    } catch {
      // not JSON
    }
    if (trimmed.startsWith('<')) return trimmed; // already HTML
    return `<p>${escapeHtml(trimmed)}</p>`; // plain text
  }
  return '';
}

// Strip HTML to plain text (for search indexing and card thumbnails' alt text).
// Block boundaries become spaces so adjacent blocks don't run words together.
export function htmlToPlainText(html) {
  if (!html) return '';
  const spaced = String(html)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|blockquote|pre|tr)>/gi, '</$1> ');
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(spaced, 'text/html');
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  }
  return spaced.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
