/**
 * 邮件链接可用性判定。
 *
 * Outlook 网页端（outlook.com / OWA）会清洗「不可跳转」的 href：空值、`#`、
 * 纯数字 / 相对路径（如 `1234`）、以及非标准协议（javascript:、data: 等）。
 * 被清洗后 `<a>` 会连同内容一起消失，表现为按钮 / 图标「元素在但看不见」。
 *
 * 两个用途：
 * 1. 右栏 `type: 'url'` 字段的默认校验，输入即时提示；
 * 2. 渲染层兜底：不可跳转时不输出 href（如 MJML 会退化为 `<p>`，样式保留、仅不可点）。
 */

/** 变量占位（发送时替换），如 {{couponLink}} */
const VARIABLE_PATTERN = /\{\{[^{}]*\}\}/;
/** 放行协议；其余一律不放行，兼顾安全（屏蔽 javascript: / data: 等） */
const ALLOWED_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:', 'sms:'];

export function isRenderableHref(raw: unknown): boolean {
  const href = String(raw ?? '').trim();
  if (!href || href === '#') return false;
  if (VARIABLE_PATTERN.test(href)) return true;

  /** 协议相对写法 //example.com */
  const normalized = href.startsWith('//') ? `https:${href}` : href;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(normalized)?.[1]?.toLowerCase();
  /** 无协议即相对路径 / 纯数字，邮件客户端不会保留 */
  if (!scheme || !ALLOWED_SCHEMES.includes(`${scheme}:`)) return false;

  try {
    const url = new URL(normalized);
    return scheme === 'mailto' || scheme === 'tel' || scheme === 'sms' ? true : !!url.hostname;
  } catch {
    return false;
  }
}

/** 可跳转则原样返回，否则返回空串，由调用方降级为不可点元素 */
export function resolveHref(raw: unknown): string {
  const href = String(raw ?? '').trim();
  return isRenderableHref(href) ? href : '';
}

/** 右栏链接字段默认校验：空值放行（允许暂不填），填了但不可跳转则给提示 */
export function invalidHrefMessage(raw: unknown, t: (key: string) => string): string | null {
  const href = String(raw ?? '').trim();
  if (!href || isRenderableHref(href)) return null;
  return t('rightPanel.block.invalidLink');
}
