/**
 * 极轻量 HTML 格式化器（约 50 行）。
 *
 * 不追求 100% 通用，但对邮件 HTML（table 嵌套、inline style、无脚本）非常稳定：
 *  - 按 `<` 切 token，识别开标签 / 闭标签 / 自闭合 / 注释 / DOCTYPE
 *  - 维护 depth 控制缩进
 *  - void 元素与 self-closing 不增加 depth
 *  - <pre> / <textarea> 内的换行不二次处理（保留原样）
 */
export function prettyHtml(html: string, indent = '  '): string {
  if (!html) return '';
  const VOID = new Set([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr',
  ]);
  const PRESERVE = new Set(['pre', 'textarea', 'script', 'style']);

  const tokens = html.match(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\/?[^<>]+>|[^<]+/g) ?? [];
  let depth = 0;
  let preserveStack: string[] = [];
  const out: string[] = [];
  const pad = (n: number) => indent.repeat(Math.max(0, n));

  for (const raw of tokens) {
    const tok = raw;
    const inPreserve = preserveStack.length > 0;

    if (tok.startsWith('<!--') || tok.startsWith('<![')) {
      if (inPreserve) out.push(tok);
      else out.push(pad(depth) + tok.trim());
      continue;
    }
    if (tok.startsWith('<!')) {
      out.push(tok.trim());
      continue;
    }

    if (tok.startsWith('</')) {
      const tag = (tok.match(/^<\/([\w-]+)/) ?? [])[1]?.toLowerCase();
      if (preserveStack[preserveStack.length - 1] === tag) {
        preserveStack.pop();
        out.push(tok);
        continue;
      }
      depth = Math.max(0, depth - 1);
      out.push(pad(depth) + tok.trim());
      continue;
    }

    if (tok.startsWith('<')) {
      const tag = (tok.match(/^<([\w-]+)/) ?? [])[1]?.toLowerCase();
      const selfClosing = tok.endsWith('/>') || (tag && VOID.has(tag));
      if (inPreserve) {
        out.push(tok);
        if (tag && PRESERVE.has(tag) && !selfClosing) preserveStack.push(tag);
        continue;
      }
      out.push(pad(depth) + tok.trim());
      if (tag && !selfClosing) {
        if (PRESERVE.has(tag)) preserveStack.push(tag);
        else depth += 1;
      }
      continue;
    }

    // 文本
    if (inPreserve) {
      out.push(tok);
    } else {
      const txt = tok.replace(/\s+/g, ' ').trim();
      if (txt) out.push(pad(depth) + txt);
    }
  }

  return out.join('\n');
}
