/**
 * 向富文本 HTML 末尾「行内」追加内容，避免落在 `</p>` 外产生换行。
 * 无块级标签时包一层 `<p style="margin:0;">`。
 */
export function appendInlineToRichHtml(html: string, insert: string): string {
  const trimmed = String(html ?? '').trim();
  if (!insert) return trimmed;
  if (!trimmed) return `<p style="margin:0;">${insert}</p>`;

  const blockClose = trimmed.match(/<\/(p|div|h[1-6]|li)>\s*$/i);
  if (blockClose && blockClose.index != null) {
    const idx = blockClose.index;
    return trimmed.slice(0, idx) + insert + trimmed.slice(idx);
  }
  return trimmed + insert;
}
