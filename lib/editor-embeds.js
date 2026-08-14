import { Node } from '../vendor/tiptap/tiptap.mjs';

// Website/video embeds for notes. The user gives a URL or a pasted
// `<iframe …>` embed snippet; it becomes an iframe block in the note.
// A few well-known share URLs are rewritten to their embeddable form, since
// the share URL itself refuses to load in a frame.
//
// Sites that send X-Frame-Options/frame-ancestors will still refuse to
// render — that's the site's call, not something the note can override.
// YouTube is deliberately not special-cased: its player requires a Referer
// header that chrome-extension:// pages never send (error 153), so YouTube
// embeds are unsupported.

const PROVIDERS = [
  {
    pattern: /vimeo\.com\/(\d+)/i,
    embed: (m) => `https://player.vimeo.com/video/${m[1]}`,
  },
  {
    pattern: /loom\.com\/share\/([\w-]+)/i,
    embed: (m) => `https://www.loom.com/embed/${m[1]}`,
  },
  {
    pattern: /codepen\.io\/([\w-]+)\/pen\/([\w-]+)/i,
    embed: (m) => `https://codepen.io/${m[1]}/embed/${m[2]}`,
  },
  {
    // Figma files/prototypes embed via their wrapper URL.
    pattern: /^(https:\/\/(?:www\.)?figma\.com\/(?:file|proto|design|board)\/\S+)/i,
    embed: (m) => `https://www.figma.com/embed?embed_host=notes&url=${encodeURIComponent(m[1])}`,
  },
];

// Accepts a URL, a bare domain, or a full `<iframe …>` snippet.
// Returns an https src for the iframe, or null when nothing usable is found.
export function toEmbedSrc(input) {
  let url = (input || '').trim();
  if (!url) return null;

  if (url.startsWith('<')) {
    // Embed code: pull the iframe's src, ignore everything else (scripts in
    // pasted snippets never run — only the src survives).
    const doc = new DOMParser().parseFromString(url, 'text/html');
    url = doc.querySelector('iframe[src]')?.getAttribute('src') || '';
    if (!url) return null;
    if (url.startsWith('//')) url = `https:${url}`;
  }

  for (const { pattern, embed } of PROVIDERS) {
    const match = url.match(pattern);
    if (match) return embed(match);
  }

  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
}

export const Embed = Node.create({
  name: 'embed',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: null },
      // Set by drag-resize; unset means full width at 16:9 (via CSS).
      width: {
        default: null,
        parseHTML: (el) => parseInt(el.style.width, 10) || null,
      },
      height: {
        default: null,
        parseHTML: (el) => parseInt(el.style.height, 10) || null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'iframe[src]',
        getAttrs: (el) => {
          const src = el.getAttribute('src');
          return src ? { src } : false;
        },
      },
    ];
  },

  renderHTML({ node }) {
    const { width, height } = node.attrs;
    const style =
      (width ? `width:${width}px;` : '') + (height ? `height:${height}px;` : '') || undefined;
    return [
      'iframe',
      {
        src: node.attrs.src,
        style,
        class: 'note-embed',
        // Enough for video players and interactive demos; no top-navigation
        // or downloads from inside the note.
        sandbox: 'allow-scripts allow-same-origin allow-popups allow-presentation allow-forms',
        // `allow` supersedes the legacy allowfullscreen attribute; setting
        // both makes Chrome log a precedence warning on every note render.
        allow: 'autoplay; fullscreen; picture-in-picture; encrypted-media',
        // YouTube (error 153) and others validate the embedding site via the
        // Referer header; suppressing it breaks them. Send origin only.
        referrerpolicy: 'strict-origin-when-cross-origin',
        loading: 'lazy',
      },
    ];
  },

  // Markdown can't express an iframe; degrade to the plain URL so exports
  // and getMarkdown() stay lossless enough to find the content again.
  renderMarkdown: (node) => node.attrs.src || '',

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('div');
      dom.className = 'embed-resizer';
      const iframe = document.createElement('iframe');
      iframe.className = 'note-embed';
      iframe.setAttribute(
        'sandbox',
        'allow-scripts allow-same-origin allow-popups allow-presentation allow-forms',
      );
      iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
      iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      const handle = document.createElement('div');
      handle.className = 'image-resize-handle';
      handle.title = 'Drag to resize';
      dom.append(iframe, handle);

      let currentNode = node;
      const sync = () => {
        // Only touch src on real change — every assignment reloads the frame.
        if (iframe.getAttribute('src') !== currentNode.attrs.src) {
          iframe.setAttribute('src', currentNode.attrs.src);
        }
        iframe.style.width = currentNode.attrs.width ? `${currentNode.attrs.width}px` : '';
        iframe.style.height = currentNode.attrs.height ? `${currentNode.attrs.height}px` : '';
      };
      sync();

      // Live-resize during the drag, commit once on mouseup (single undo step).
      handle.addEventListener('mousedown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const startX = event.clientX;
        const startY = event.clientY;
        const rect = iframe.getBoundingClientRect();
        const maxWidth = dom.parentElement?.getBoundingClientRect().width || Infinity;
        // The iframe would swallow mousemove the moment the pointer crosses
        // into it, killing the drag mid-flight.
        iframe.style.pointerEvents = 'none';

        const onMove = (e) => {
          const width = Math.round(
            Math.min(maxWidth, Math.max(200, rect.width + (e.clientX - startX))),
          );
          const height = Math.round(Math.max(120, rect.height + (e.clientY - startY)));
          iframe.style.width = `${width}px`;
          iframe.style.height = `${height}px`;
        };
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          iframe.style.pointerEvents = '';
          const finalRect = iframe.getBoundingClientRect();
          const pos = getPos();
          if (typeof pos !== 'number') return;
          editor.view.dispatch(
            editor.view.state.tr.setNodeMarkup(pos, null, {
              ...currentNode.attrs,
              width: Math.round(finalRect.width),
              height: Math.round(finalRect.height),
            }),
          );
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
        stopEvent: (event) => event.target === handle,
      };
    };
  },

  addCommands() {
    return {
      setEmbed:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});

// Slash-menu entry point: ask for a URL or embed code, insert the block.
export function promptForEmbed(editor) {
  const input = window.prompt('Embed a website: paste a URL or <iframe> embed code');
  if (input === null) return;
  const src = toEmbedSrc(input);
  if (!src) {
    window.alert('Could not find an embeddable URL in that.');
    return;
  }
  editor.chain().focus().setEmbed({ src }).run();
}
