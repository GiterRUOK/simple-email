import mjmlCompile from 'mjml-browser';
import type { EmailDoc, RenderEngine, Variable } from '../types';
import type { Registry } from '../registry/registry';
import { docToMjml } from './mjml';

export interface RenderResult {
  mjml: string;
  html: string;
  errors: { message: string }[];
}

export interface RenderOptions {
  /** 渲染引擎，目前仅 'mjml'；'table' 预留作将来直输 table HTML。 */
  engine?: RenderEngine;
  /**
   * 是否把 {{var}} 替换为示例值。设计态画布预览传 true，导出原始 HTML 传 false。
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
  if (opts.withSampleVariables) {
    html = replaceVariables(html, doc.variables);
  }

  return {
    mjml,
    html,
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
