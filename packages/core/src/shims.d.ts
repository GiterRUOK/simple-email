/** mjml-browser 没有官方类型声明，做个最小 shim。 */
declare module 'mjml-browser' {
  export interface MjmlError {
    message: string;
    formattedMessage?: string;
    line?: number;
    tagName?: string;
  }
  export interface MjmlOptions {
    keepComments?: boolean;
    /** 'strict' | 'soft' | 'skip' */
    validationLevel?: 'strict' | 'soft' | 'skip';
    minify?: boolean;
    fonts?: Record<string, string>;
  }
  export interface MjmlResult {
    html: string;
    errors: MjmlError[];
  }
  export default function mjml2html(input: string, options?: MjmlOptions): MjmlResult;
}

/** Vite 把 ?css 当成副作用模块导入；TS 需要知道这个文件类型。 */
declare module '*.css' {
  const css: string;
  export default css;
}
