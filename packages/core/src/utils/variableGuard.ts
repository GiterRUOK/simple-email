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
 * 判据与 replaceVariables 对齐：token 完整可用 ⇔ `{{` 与配对 `}}` 落在同一
 * 文本节点内（且 key 不含空白/右花括号）。属性值（如 href="{{link}}"）是
 * 完整字符串、不受样式命令影响，DOM 文本遍历天然跳过，不会误报。
 */

/** 与 renderer/replaceVariables 相同的「完整 token」语义 */
const COMPLETE_TOKEN_RE = /\{\{\s*[^}\s]+\s*\}\}/g;

export interface BrokenVariableToken {
  /**
   * 断裂处的可见文本片段（截取孤立定界符附近的上下文），
   * 用于在告警 UI / 日志中帮助运营定位到具体位置。
   */
  fragment: string;
}

/**
 * 扫描富文本 HTML，返回被切断 / 残缺的变量占位符。
 * 空数组 = 所有 token 均完整，可安全交给后台替换。
 */
export function findBrokenVariableTokens(html: string): BrokenVariableToken[] {
  if (!html) return [];
  // 快速路径：绝大多数内容不含定界符
  if (!html.includes('{{') && !html.includes('}}')) return [];

  const tpl = document.createElement('template');
  tpl.innerHTML = html;

  const broken: BrokenVariableToken[] = [];
  const walker = document.createTreeWalker(tpl.content, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node.nodeValue ?? '';
    if (text.includes('{{') || text.includes('}}')) {
      // 剔除本节点内完整的 token，剩下孤立 `{{` / `}}` 即断裂痕迹
      const rest = text.replace(COMPLETE_TOKEN_RE, '');
      const at = rest.search(/\{\{|\}\}/);
      if (at >= 0) {
        const start = Math.max(0, at - 20);
        broken.push({
          fragment: text.slice(start, start + 60).trim() || rest.slice(at, at + 40),
        });
      }
    }
    node = walker.nextNode();
  }
  return broken;
}
