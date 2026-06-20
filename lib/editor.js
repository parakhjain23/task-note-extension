import EditorJS from '../vendor/editorjs/editorjs.mjs';
import Header from '../vendor/editorjs/header.mjs';
import List from '../vendor/editorjs/list.mjs';
import Paragraph from '../vendor/editorjs/paragraph.mjs';
import Checklist from '../vendor/editorjs/checklist.mjs';
import { descriptionToEditorData } from './editor-helper.js';

let editorInstance = null;
let saveTimer = null;
let onSaveCallback = null;

export async function initEditor(holderId, data, onSave) {
  onSaveCallback = onSave;
  await destroyEditor();

  editorInstance = new EditorJS({
    holder: holderId,
    data: descriptionToEditorData(data),
    placeholder: 'Write a description, user story, or notes…',
    minHeight: 280,
    tools: {
      header: {
        class: Header,
        config: {
          levels: [2, 3, 4],
          defaultLevel: 3,
        },
      },
      list: {
        class: List,
        inlineToolbar: true,
      },
      checklist: {
        class: Checklist,
        inlineToolbar: true,
      },
      paragraph: {
        class: Paragraph,
        inlineToolbar: true,
      },
    },
    onChange: () => scheduleSave(),
  });

  await editorInstance.isReady;
}

export async function destroyEditor() {
  if (editorInstance) {
    try {
      await editorInstance.destroy();
    } catch {
      // ignore destroy errors
    }
    editorInstance = null;
  }
  clearTimeout(saveTimer);
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    if (!editorInstance || !onSaveCallback) return;
    try {
      const data = await editorInstance.save();
      onSaveCallback(data);
    } catch {
      // editor not ready
    }
  }, 600);
}

export async function flushEditor() {
  if (!editorInstance || !onSaveCallback) return;
  clearTimeout(saveTimer);
  const data = await editorInstance.save();
  onSaveCallback(data);
}
