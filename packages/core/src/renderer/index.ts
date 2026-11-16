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
   * 发送端无法完成替换的变量占位符（fragment 为附近的文本片段）。
   * kind='broken'：token 被样式标签切断；kind='unknown'：结构完整但 key 未注册。
   * 非空意味着收件人会看到裸 `{{key}}`——发送端应以非空为阻断 / 人工确认条件。
   * 编辑期的原子 chip 已从源头阻断新损坏；此处是覆盖存量数据与手改旁路的最后防线。
   */
  brokenVariables: { fragment: string; kind: 'broken' | 'unknown'; key?: string }[];
}

export interface PreviewVariableContext {
  doc: EmailDoc;
  engine: RenderEngine;
}

/**
 * 预览期变量解析器。只影响展示用的 HTML，不写回 EmailDoc、不进入导出给后端的 content。
 * 返回 null / undefined 表示该 key 不由此解析器处理（回退到 sample 或保留占位符）。
 * 典型用途：{{navimowFooter}} 这类由宿主按站点 / 接口动态提供的系统变量。
 */
export type PreviewVariableResolver = (
  key: string,
  ctx: PreviewVariableContext,
) => string | null | undefined;

export interface RenderOptions {
  /** 渲染引擎，目前仅 'mjml'；'table' 预留作将来直输 table HTML。 */
  engine?: RenderEngine;
  /**
   * 是否把 {{var}} 替换为变量的 sample 值。
   * 设计态预览默认不替换，保持占位符；仅当变量显式配置了 sample 且调用方传 true 时才替换。
   */
  withSampleVariables?: boolean;
  /**
   * 仅用于预览 / 画布展示的变量解析。与 withSampleVariables 正交：
   * 解析器优先命中，未命中的 key 才按 sample 处理，因此不会把业务变量一起展开。
   * 源码视图与落库导出不传此选项，占位符保持原样。
   */
  previewVariableResolver?: PreviewVariableResolver;
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
  const brokenVariables = findBrokenVariableTokens(html, doc.variables);
  html = replaceVariables(html, doc.variables, {
    withSampleVariables: opts.withSampleVariables ?? false,
    resolver: opts.previewVariableResolver,
    ctx: { doc, engine },
  });

  return {
    mjml,
    html,
    brokenVariables,
    errors: (compiled.errors || []).map((e: any) => ({
      message: e.formattedMessage ?? e.message ?? String(e),
    })),
  };
}

export interface ReplaceVariablesOptions {
  /** 是否把 {{var}} 替换为 doc.variables 里的 sample 值 */
  withSampleVariables?: boolean;
  /** 预览期解析器，优先级高于 sample */
  resolver?: PreviewVariableResolver;
  ctx?: PreviewVariableContext;
}

/**
 * 替换 `{{var.name}}` 占位符。仅做最简单的字符串替换，
 * 不做任何沙箱式表达式求值（邮件场景里下游模板引擎会再处理一次）。
 * 两参数调用保持原有语义（替换 sample）；预览场景传 resolver 只展开命中的系统变量。
 */
export function replaceVariables(
  text: string,
  vars: Variable[],
  opts: ReplaceVariablesOptions = {},
): string {
  const withSample = opts.withSampleVariables ?? true;
  const resolver = opts.resolver;
  if (!withSample && !resolver) return text;
  const ctx: PreviewVariableContext = opts.ctx ?? {
    doc: { variables: vars } as EmailDoc,
    engine: 'mjml',
  };
  return text.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (raw, key: string) => {
    const resolved = resolver?.(key, ctx);
    if (resolved != null) return resolved;
    if (withSample) {
      const v = vars.find((x) => x.key === key);
      if (v && v.sample != null) return v.sample;
    }
    return raw;
  });
}
