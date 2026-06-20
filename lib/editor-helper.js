export function descriptionToEditorData(value) {
  if (!value) return { blocks: [] };
  if (typeof value === 'object' && value.blocks) return value;
  try {
    const parsed = JSON.parse(value);
    if (parsed?.blocks) return parsed;
  } catch {
    // plain text fallback
  }
  if (typeof value === 'string' && value.trim()) {
    return {
      blocks: [{ type: 'paragraph', data: { text: value.trim() } }],
    };
  }
  return { blocks: [] };
}

export function editorDataToString(data) {
  if (!data?.blocks?.length) return '';
  return JSON.stringify(data);
}

export function editorDataToPlainText(data) {
  if (!data?.blocks?.length) return '';
  return data.blocks
    .map((block) => {
      if (block.type === 'header') return block.data.text;
      if (block.type === 'paragraph') return block.data.text;
      if (block.type === 'list') return (block.data.items || []).join(' ');
      if (block.type === 'checklist') {
        return (block.data.items || []).map((i) => i.text).join(' ');
      }
      return '';
    })
    .filter(Boolean)
    .join(' ');
}
