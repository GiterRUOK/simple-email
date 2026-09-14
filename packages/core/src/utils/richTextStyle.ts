/**
 * 富文本内联样式的「净化」工具。
 *
 * 背景：给一段文字改字号时，编辑器是「包一层 `<span style="font-size:B">`」。
 * 如果这段文字里已经有 `<span style="font-size:A">`，内层 A 会继续覆盖外层 B
 * ——表现为「选了更大的范围改字号，被包含的旧字号却不变」。
 *
 * 因此应用内联样式前需要先把选区内**同属性**的旧声明清掉：
 *  - 只留其他属性（如 color），`font-size` 被新值接管；
 *  - 清完变成空壳（无 style、无任何其他属性）的 span / font 直接拆掉，
 *    避免出现 `<span style="">text</span>` 这种无意义标签。
 *
 * 部分重叠场景无需特殊处理：只有被选区取走的那部分内容进入 fragment，
 * 留在原处的文本仍受旧元素管辖，旧字号自然保留。
 */

/** 允许被拆掉的「纯样式壳」标签（语义标签如 a / strong / li 不在内） */
const UNWRAPPABLE_TAGS = new Set(['span', 'font']);
const UNWRAPPABLE_SELECTOR = 'span, font';

function declRegexp(prop: string): RegExp {
  const escaped = prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 以 `;` 或串首起头，避免误伤 `background-color` 之于 `color`
  return new RegExp(`(?:^|;)\\s*${escaped}\\s*:\\s*[^;]*`, 'i');
}

/** 从 style 串中删掉某条声明（保留其余声明与分隔符） */
export function removeStyleDecl(styleAttr: string, prop: string): string {
  const next = styleAttr
    .replace(declRegexp(prop), '')
    .replace(/;{2,}/g, ';')
    .replace(/^\s*;\s*/, '')
    .trim();
  return next === ';' ? '' : next;
}

/** 删掉元素 style 里的某条声明；样式清空时移除 style 属性本身。返回是否有变化。 */
export function stripInlineStyleDecl(el: Element, prop: string): boolean {
  if (!el.hasAttribute('style')) return false;
  const before = el.getAttribute('style') ?? '';
  const after = removeStyleDecl(before, prop);
  if (after === before) return false;
  if (after) el.setAttribute('style', after);
  else el.removeAttribute('style');
  return true;
}

/** 纯样式壳：span/font 且一个属性都不剩 */
export function isEmptyInlineShell(el: Element): boolean {
  return UNWRAPPABLE_TAGS.has(el.tagName.toLowerCase()) && !el.hasAttributes();
}

/**
 * 无内容壳：span/font 内只剩空文本节点（textContent 为空，连零宽字符都没有），
 * 也没有 br / img 等占位元素——`extractContents` 在边界 split 时常留下这种残壳，
 * 它仍有 style 属性但没有任何可渲染内容，留着只会让 innerHTML 变脏。
 * typing 占位 span 含零宽字符，textContent 非空，不会误伤。
 */
export function isContentlessShell(el: Element): boolean {
  if (!UNWRAPPABLE_TAGS.has(el.tagName.toLowerCase())) return false;
  if (el.hasAttribute('data-sm-typing')) return false;
  if (el.querySelector('br, img')) return false;
  const text = (el.textContent ?? '').replace(/​/g, '');
  return text.length === 0;
}

/** 把元素自身从 DOM 里拆掉，子节点上提到原位置 */
export function unwrapElement(el: Element): void {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

/**
 * 在片段 / 子树内清除某条 inline 声明，并把因此变成空壳的 span / font 拆掉。
 * 倒序遍历：先处理内层，父元素变空壳后可以直接上提，不会漏拆。
 */
export function purgeInlineStyleDecl(root: ParentNode, prop: string): void {
  const targets: Element[] = [];
  if (root.nodeType === 1) targets.push(root as Element);
  targets.push(...Array.from(root.querySelectorAll('[style]')));

  for (let i = targets.length - 1; i >= 0; i--) {
    const el = targets[i];
    if (!el.parentNode) continue;
    stripInlineStyleDecl(el, prop);
    if (isEmptyInlineShell(el)) unwrapElement(el);
  }
}

/**
 * 旧 `<font size="1..7">` → px。必须用浏览器实际渲染 legacy 档位的那张表
 * （与 HTML 规范建议值一致：1=10, 2=13, 3=16, 4=18, 5=24, 6=32, 7=48），
 * 否则编辑器里看到的字号与提交进邮件的字号不一致（如 size=5 显示 24px 却存成 20px）。
 */
const LEGACY_FONT_SIZE_MAP: Record<string, string> = {
  '1': '10px',
  '2': '13px',
  '3': '16px',
  '4': '18px',
  '5': '24px',
  '6': '32px',
  '7': '48px',
};

export function fontSizeFromLegacy(size: string): string {
  return LEGACY_FONT_SIZE_MAP[size] ?? size;
}

/**
 * 把子树内的 `<font color/size/face>` 统一转成 `<span style>`。
 *
 * 背景：`<font size>` 的字号在 **属性** 上、不在 style 上，
 * `purgeInlineStyleDecl` 按 `[style]` 选择器抓取会漏掉它，
 * 于是选中含 `<font size>` 的范围改字号时外层新值盖不过 `<font>` 的 UA 字号。
 * 因此 apply 内联样式前需先把 `<font>` 转成 span，让字号落到 style 上，
 * purge 才能命中。sanitize 提交前也复用同一个转换。
 *
 * 只做「标签转换」，不做属性清理：转出的 span 若仍带 color/face 不会空壳、不会 unwrap。
 */
export function convertFontTags(root: ParentNode): void {
  const fonts = Array.from(root.querySelectorAll('font'));
  for (let i = fonts.length - 1; i >= 0; i--) {
    const el = fonts[i];
    const parent = el.parentNode;
    if (!parent) continue;
    const span = document.createElement('span');
    const color = el.getAttribute('color');
    const size = el.getAttribute('size');
    const face = el.getAttribute('face');
    const styles: string[] = [el.getAttribute('style') ?? ''];
    if (color) styles.push(`color:${color}`);
    if (size) styles.push(`font-size:${fontSizeFromLegacy(size)}`);
    if (face) styles.push(`font-family:${face}`);
    const cleaned = styles.filter((s) => s.trim()).join(';');
    if (cleaned) span.setAttribute('style', cleaned);
    while (el.firstChild) span.appendChild(el.firstChild);
    parent.replaceChild(span, el);
  }
}

/** 提交前清理：拆掉纯样式空壳 + 无内容残壳 */
export function unwrapEmptyInlineShells(root: ParentNode): void {
  const list = Array.from(root.querySelectorAll(UNWRAPPABLE_SELECTOR));
  for (let i = list.length - 1; i >= 0; i--) {
    const el = list[i];
    if (el.parentNode && (isEmptyInlineShell(el) || isContentlessShell(el))) unwrapElement(el);
  }
}

/**
 * 合并 style/class 完全相同的父子 span：反复改字号/字重会套出多层同义 span，
 * 渲染结果一样但 HTML 变胖（逼近 Gmail 102KB 截断）。合并后内层子节点上提。
 */
export function mergeRedundantSpans(root: ParentNode): void {
  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    for (const el of Array.from(root.querySelectorAll('span'))) {
      const parent = el.parentElement;
      if (!parent || parent.tagName.toLowerCase() !== 'span') continue;
      if (spanIdentity(parent) !== spanIdentity(el)) continue;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      el.remove();
      changed = true;
    }
    if (!changed) break;
  }
}

/** span 的样式身份：class + 规范化后的 style，用于判断是否可合并 */
function spanIdentity(el: Element): string {
  const style = (el.getAttribute('style') ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/;+$/, '');
  return `${(el.getAttribute('class') ?? '').trim()} ${style}`;
}

export function firstTextNode(root: Node): Text | null {
  if (root.nodeType === Node.TEXT_NODE) return root as Text;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  return walker.nextNode() as Text | null;
}

export function lastTextNode(root: Node): Text | null {
  if (root.nodeType === Node.TEXT_NODE) return root as Text;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let last: Text | null = null;
  let n = walker.nextNode();
  while (n) {
    last = n as Text;
    n = walker.nextNode();
  }
  return last;
}
