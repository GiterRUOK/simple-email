import mjmlCompile from 'mjml-browser';
import type { Registry } from '../registry/registry';
import type { EmailDoc, RenderEngine, Variable } from '../types';
import { inlineColumnWidthsInHtml } from '../utils/columnWidths';
import { annotateDynamicVariantHtmlAttributes } from '../utils/dynamicVariantHtml';
import { normalizeEmailListsInHtml, resolveGlobalListIndentPx } from '../utils/emailListStyles';
import { findBrokenVariableTokens } from '../utils/variableGuard';
import { docToMjml } from './mjml';

export interface RenderResult {
  mjml: string;
  html: string;
  errors: { message: string }[];
  /**
   * 富文本里被切断 / 残缺的变量占位符（fragment 为断裂处附近的文本片段）。
   * 非空意味着后台 replaceVariables 将无法替换这些 token，收件人会看到裸
   * `{{key}}`——发送端应以非空为阻断 / 人工确认条件。编辑期的原子 chip 已从
   * 源头阻断新损坏；此处是覆盖存量数据与手改旁路的最后防线。
   */
  brokenVariables: { fragment: string }[];
}

export interface RenderOptions {
  /** 渲染引擎，目前仅 'mjml'；'table' 预留作将来直输 table HTML。 */
  engine?: RenderEngine;
  /**
   * 是否把 {{var}} 替换为变量的 sample 值。
   * 设计态预览默认不替换，保持占位符；仅当变量显式配置了 sample 且调用方传 true 时才替换。
   */
  withSampleVariables?: boolean;
}

export function renderDoc(
  doc: EmailDoc,
  registry: Registry,
  opts: RenderOptions = {},
): RenderResult {
  const engine: RenderEngine = opts.engine ?? 'mjml';

  if (engine !== 'mjml') {
    // 预留：将来可在此分支实现纯 table 输出。
    throw new Error(`渲染引擎暂未实现: ${engine}`);
  }

  const mjml = docToMjml(doc, registry);

  const compiled = mjmlCompile(mjml, {
    validationLevel: 'soft',
    keepComments: false,
  });

  let html = compiled.html;
  html = annotateDynamicVariantHtmlAttributes(html, doc);
  html = inlineColumnWidthsInHtml(html);
  html = normalizeEmailListsInHtml(html, resolveGlobalListIndentPx(doc.styles));
  // 扫描须在 sample 替换之前：替换后 token 已变成样值，断裂无从检测。
  // 扫描对象是编译产物 HTML（即 replaceVariables 的实际作用对象），判据完全对齐。
  const brokenVariables = findBrokenVariableTokens(html);
  if (opts.withSampleVariables) {
    html = replaceVariables(html, doc.variables);
  }

  return {
    mjml,
    html,
    brokenVariables,
    errors: (compiled.errors || []).map((e: any) => ({
      message: e.formattedMessage ?? e.message ?? String(e),
    })),
  };
}

/**
 * 用 sample 值替换 `{{var.name}}` 占位符。仅做最简单的字符串替换，
 * 不做任何沙箱式表达式求值（邮件场景里下游模板引擎会再处理一次）。
 */
export function replaceVariables(text: string, vars: Variable[]): string {
  if (!vars.length) return text;
  return text.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (raw, key) => {
    const v = vars.find((x) => x.key === key);
    if (v && v.sample != null) return v.sample;
    return raw;
  });
}
