/**
 * 变量占位符完整性守卫。
 *
 * 后台替换（renderer 的 replaceVariables）按纯文本正则 `\{\{\s*key\s*\}\}` 在
 * 编译后的 HTML 字符串上匹配——token 的 `{{` 与 `}}` 一旦被任何标签切断
 * （如富文本样式命令产生 `{<b>{coupon</b>}}`），正则即失配，收件人将看到
 * 裸 token。编辑期的原子 chip（见 variables/index.ts 的 VARIABLE_CHIP_ATTR）
 * 从源头阻断了切断路径；本模块是导出/发送前的最后防线，覆盖 chip 出现之前的
 * 存量数据、「内容（HTML，备用）」手改、源码视图编辑等一切旁路。
 *
 * 判据与 replaceVariables 对齐：「结构完整」⇔ `{{` 与配对 `}}` 落在同一文本节点内
 * （且 key 不含空白/右花括号）；「会被替换」⇔ key 在宿主变量列表内。
 * 属性值（如 href="{{link}}"）是完整字符串、不受样式命令影响，DOM 文本遍历
 * 天然跳过，不会误报。
 */

/** 与 renderer/replaceVariables 相同的「完整 token」语义 */
const COMPLETE_TOKEN_RE = /\{\{\s*[^}\s]+\s*\}\}/g;

/** 完整 token 内提取 key（与 replaceVariables 的捕获组语义一致） */
const TOKEN_KEY_RE = /^\{\{\s*([^}\s]+)\s*\}\}$/;

export interface BrokenVariableToken {
  /**
   * 断裂处的可见文本片段（截取孤立定界符附近的上下文），
   * 用于在告警 UI / 日志中帮助运营定位到具体位置。
   */
  fragment: string;
  /**
   * broken = token 被标签切断 / 残缺；
   * unknown = 结构完整但 key 不在变量列表，发送端不会替换。
   * 两者后果相同：收件人看到裸 token；但成因与修复方式不同，分开提示。
   */
  kind: 'broken' | 'unknown';
  /** kind=unknown 时的未注册 key（broken 时无意义） */
  key?: string;
}

/**
 * 扫描富文本 HTML，返回被切断 / 残缺的变量占位符。
 * 传入 variables 时同时报告「结构完整但 key 未注册」的 token——
 * 后台 replaceVariables 按 key 查列表，未注册的 token 同样会裸着发给收件人。
 * 空数组 = 所有 token 均完整（且已注册），可安全交给后台替换。
 */
export function findBrokenVariableTokens(
  html: string,
  variables?: ReadonlyArray<{ key: string }>,
): BrokenVariableToken[] {
  if (!html) return [];
  // 快速路径：绝大多数内容不含定界符
  if (!html.includes('{{') && !html.includes('}}')) return [];

  const knownKeys = new Set(variables?.map((v) => v.key) ?? []);
  const broken: BrokenVariableToken[] = [];
  const template = document.createElement('template');
  template.innerHTML = html;

  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node.nodeValue ?? '';
    if (text.includes('{{') || text.includes('}}')) {
      if (knownKeys.size > 0) {
        // 未注册的完整 token：正则捕获组与 replaceVariables 完全一致
        for (const m of text.matchAll(COMPLETE_TOKEN_RE)) {
          const key = TOKEN_KEY_RE.exec(m[0])?.[1];
          if (key && !knownKeys.has(key)) {
            broken.push({ fragment: m[0], kind: 'unknown', key });
          }
        }
      }
      // 剔除本节点内完整的 token，剩下孤立 `{{` / `}}` 即断裂痕迹
      const rest = text.replace(COMPLETE_TOKEN_RE, '');
      const at = rest.search(/\{\{|\}\}/);
      if (at >= 0) {
        const start = Math.max(0, at - 20);
        broken.push({
          fragment: text.slice(start, start + 60).trim() || rest.slice(at, at + 40),
          kind: 'broken',
        });
      }
    }
    node = walker.nextNode();
  }
  return broken;
}
