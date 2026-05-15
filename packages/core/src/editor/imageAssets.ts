/**
 * 右侧「图片地址」类字段的可选宿主能力：上传与图床选择。
 * 编辑器只消费最终写回 props 的 URL 字符串；具体存储、鉴权、弹框 UI 均由宿主实现。
 */

export interface ImageFieldContext {
  /** 当前选中的 Block id */
  blockId: string;
  /** 对应 `block.props` 的字段名，如 `src`、`backgroundUrl` */
  propKey: string;
  /** 输入框当前值，便于宿主作为默认筛选或回填参考 */
  currentUrl: string;
}

export interface ImageAssetsHandlers {
  /**
   * 用户选择本地文件后调用。宿主完成校验与上传后，返回邮件中可用的 **绝对 HTTPS URL**。
   */
  uploadImage?: (file: File, ctx: ImageFieldContext) => Promise<string>;

  /**
   * 打开宿主自管的图床/素材库（自行挂载弹层、列表等）。用户选定图片后 resolve 公网 URL；
   * 取消关闭 resolve `null`。编辑器将把非空字符串写回当前字段。
   */
  pickImageFromGallery?: (ctx: ImageFieldContext) => Promise<string | null>;

  /**
   * 是否显示「上传」按钮。仅当配置了 `uploadImage` 时有效。
   * 默认 `true`；设为 `false` 可关闭上传入口（仍可手输 URL）。
   */
  showUpload?: boolean;

  /**
   * 是否显示「图床」按钮。仅当配置了 `pickImageFromGallery` 时有效。
   * 默认 `false`；需显式设为 `true` 才展示图床入口。
   */
  showGallery?: boolean;
}
