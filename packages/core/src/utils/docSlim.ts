import type { EmailDoc, Variable } from '../types';
import { collectVariableKeys } from './docClipboard';

/**
 * 落库 JSON 中 `variables` 的输出策略。
 *
 * 变量列表的权威在宿主（`setVariables` 每次整表覆盖运行期快照），因此默认不外发；
 * 需要离线可读的快照时再按 `'used'` / `'all'` 输出。
 */
export type DocVariablesMode = 'none' | 'used' | 'all';

export interface SlimDocOptions {
  /**
   * - `'none'`（默认）：输出空数组。
   * - `'used'`：只保留内容（含未省略的 `meta`）里实际引用到的 key，并丢弃 `sample`
   *   ——示例值是业务侧数据，逐封邮件各存一份会各自过期。
   * - `'all'`：完整快照（旧行为）。无宿主注入、需要变量面板/未注册 key 检测独立可用时才用。
   */
  variables?: DocVariablesMode;
  /**
   * 省略 `meta.subject` / `meta.preheader`：主题与预览文案由宿主表单管理时用。
   * 此时文档里的值只是 i18n 默认占位，落库反而会让宿主误信它。
   * `meta.width` 是渲染输入，任何情况下都保留。
   */
  omitMailMeta?: boolean;
}

/**
 * 生成用于持久化 / 外发的文档快照：不改动编辑器内部状态，返回新对象。
 * 读回时 `createDefaultDoc` 对缺失的 `variables` / `meta.subject` 均有兜底，可直接 `setValue`。
 */
export function slimDocForStorage(doc: EmailDoc, opts: SlimDocOptions = {}): EmailDoc {
  const variablesMode = opts.variables ?? 'none';
  const omitMailMeta = opts.omitMailMeta === true;
  const next: EmailDoc = structuredClone(doc);

  if (omitMailMeta) {
    // 只留渲染输入 width；不写 undefined 键，JSON.stringify 后 meta 里不会出现 subject / preheader
    next.meta = { width: next.meta.width };
  }

  if (variablesMode === 'none') {
    next.variables = [];
  } else if (variablesMode === 'used') {
    const used = collectVariableKeys({
      sections: next.sections,
      extra: omitMailMeta ? undefined : next.meta,
    });
    next.variables = (next.variables ?? [])
      .filter((v) => used.has(v.key))
      .map<Variable>((v) => ({
        key: v.key,
        label: v.label,
        ...(v.kind ? { kind: v.kind } : {}),
      }));
  }

  return next;
}
