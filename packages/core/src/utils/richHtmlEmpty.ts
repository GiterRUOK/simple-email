/** 是否仅为进入编辑时注入的占位 <br>（用户未改动） */
export function isRichHtmlEditorSeedOnly(html: string): boolean {
  const s = String(html ?? '').trim().toLowerCase();
  return s === '<br>' || s === '<br/>' || s === '<br />';
}

/** 是否包含换行（<br>） */
export function hasRichHtmlLineBreak(html: string): boolean {
  const tpl = document.createElement('template');
  tpl.innerHTML = String(html ?? '');
  return tpl.content.querySelector('br') != null;
}

/** 富文本纯文本（不 trim，保留空格；去掉零宽字符） */
export function getRichHtmlPlainText(html: string): string {
  const tpl = document.createElement('template');
  tpl.innerHTML = String(html ?? '');
  return (tpl.content.textContent ?? '').replace(/\u200b/g, '');
}

/**
 * 富文本是否「完全无内容」。
 * 空格、&nbsp;、换行（<br>）均视为有效内容；仅空串或空标签壳子算空。
 */
export function isRichHtmlEffectivelyEmpty(html: string): boolean {
  const raw = String(html ?? '');
  if (!raw.trim()) return true;

  const tpl = document.createElement('template');
  tpl.innerHTML = raw;
  const root = tpl.content;

  if (root.querySelector('img')) return false;
  if (root.querySelector('br')) return false;

  const text = (root.textContent ?? '').replace(/\u200b/g, '');
  return text.length === 0;
}

/** 提交前：完全无内容时统一为 '' */
export function normalizeRichHtmlForCommit(html: string): string {
  return isRichHtmlEffectivelyEmpty(html) ? '' : html;
}
