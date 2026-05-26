/**
 * contenteditable 富文本仍依赖 Document.execCommand / queryCommand* 系列 API。
 * 浏览器与 TypeScript lib.dom 虽已标记 deprecated，但目前无等价替代；集中封装便于 IDE 消警与日后迁移。
 */
export interface RichTextDocument extends Document {
  execCommand(commandId: string, showUI?: boolean, value?: string): boolean;
  queryCommandState(commandId: string): boolean;
  queryCommandValue(commandId: string): string;
}

function asRichTextDoc(doc: Document = document): RichTextDocument {
  return doc as RichTextDocument;
}

export function richTextExecCommand(
  commandId: string,
  showUI = false,
  value?: string,
  doc: Document = document,
): boolean {
  return asRichTextDoc(doc).execCommand(commandId, showUI, value);
}

export function richTextQueryCommandState(commandId: string, doc: Document = document): boolean {
  return asRichTextDoc(doc).queryCommandState(commandId);
}

export function richTextQueryCommandValue(commandId: string, doc: Document = document): string {
  return asRichTextDoc(doc).queryCommandValue(commandId);
}
