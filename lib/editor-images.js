import { Image } from '../vendor/tiptap/tiptap.mjs';

// Image handling for the notes editor. Pasted/dropped image files are inlined
// as data URIs so they travel with the note's contentHTML everywhere it goes
// (IndexedDB, export/import, Drive sync) with no separate blob store. Photos
// and screenshots are downscaled and re-encoded to WebP so a single paste
// can't balloon a note by megabytes.

const MAX_DIMENSION = 1600;
const WEBP_QUALITY = 0.85;
// Anything bigger than this is almost certainly not meant for a note.
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export function extractImageFiles(dataTransfer) {
  return Array.from(dataTransfer?.files || []).filter((f) => f.type.startsWith('image/'));
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function fileToDataUrl(file) {
  // A canvas would flatten GIF animation and rasterize SVG; keep those raw.
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
    return readAsDataURL(file);
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL('image/webp', WEBP_QUALITY);
}

// Inserts each readable image at the current selection. Unreadable or
// oversized files are skipped silently — paste should never throw.
export async function insertImageFiles(editor, files) {
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) continue;
    try {
      const src = await fileToDataUrl(file);
      editor
        .chain()
        .focus()
        .setImage({ src, alt: file.name.replace(/\.\w+$/, '') })
        .run();
    } catch {
      // Corrupt/undecodable image — skip it, keep the rest of the paste.
    }
  }
}

// Fullscreen preview, opened by double-clicking an image in the editor.
// Click anywhere or press Escape to close.
export function openImageLightbox(src, alt = '') {
  const overlay = document.createElement('div');
  overlay.className = 'image-lightbox';
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt;
  overlay.appendChild(img);

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
  };
  const onKey = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };
  overlay.addEventListener('click', close);
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(overlay);
}

const MIN_RESIZE_WIDTH = 60;

// Image node with a persisted `width` attribute, a drag handle to resize,
// and a double-click fullscreen preview. Height is never stored — CSS keeps
// the aspect ratio from the width alone.
export const ResizableImage = Image.extend({
  // Inlined images are data URIs; without this the base extension's parse
  // rule rejects them, so saved notes would lose images on reload.
  addOptions() {
    return { ...this.parent?.(), allowBase64: true };
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => {
          const width = el.getAttribute('width') || parseInt(el.style.width, 10);
          return width ? parseInt(width, 10) : null;
        },
        renderHTML: (attrs) => (attrs.width ? { width: attrs.width } : {}),
      },
    };
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('div');
      dom.className = 'image-resizer';
      const img = document.createElement('img');
      const handle = document.createElement('div');
      handle.className = 'image-resize-handle';
      handle.title = 'Drag to resize';
      dom.append(img, handle);

      let currentNode = node;
      const sync = () => {
        img.src = currentNode.attrs.src;
        img.alt = currentNode.attrs.alt || '';
        img.style.width = currentNode.attrs.width ? `${currentNode.attrs.width}px` : '';
      };
      sync();

      img.addEventListener('dblclick', (event) => {
        event.preventDefault();
        openImageLightbox(currentNode.attrs.src, currentNode.attrs.alt);
      });

      // Live-resize the DOM during the drag; commit the width to the document
      // once on mouseup so a single drag is a single undo step.
      handle.addEventListener('mousedown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const startX = event.clientX;
        const startWidth = img.getBoundingClientRect().width;
        const maxWidth = dom.parentElement?.getBoundingClientRect().width || Infinity;

        const onMove = (e) => {
          const width = Math.round(
            Math.min(maxWidth, Math.max(MIN_RESIZE_WIDTH, startWidth + (e.clientX - startX))),
          );
          img.style.width = `${width}px`;
        };
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          const width = Math.round(img.getBoundingClientRect().width);
          const pos = getPos();
          if (typeof pos !== 'number') return;
          const tr = editor.view.state.tr.setNodeMarkup(pos, null, {
            ...currentNode.attrs,
            width,
          });
          editor.view.dispatch(tr);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });

      return {
        dom,
        update(updated) {
          if (updated.type !== currentNode.type) return false;
          currentNode = updated;
          sync();
          return true;
        },
        selectNode: () => dom.classList.add('selected'),
        deselectNode: () => dom.classList.remove('selected'),
        // Resize drags and double-clicks are the node view's business;
        // without this ProseMirror would treat them as drag-and-drop.
        stopEvent: (event) => event.target === handle,
      };
    };
  },
});

// Opens a file picker and inserts the chosen images (slash-menu "Image").
export function pickImages(editor) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.addEventListener('change', () => {
    if (input.files?.length) insertImageFiles(editor, Array.from(input.files));
  });
  input.click();
}
