/**
 * 右侧「图片地址」类字段：宿主可选手输 URL、本地上传、内置图库弹层或完全自管图床回调。
 * 编辑器最终只把 URL 写入 props。
 */

export interface ImageFieldContext {
  /** 当前选中的 Block id */
  blockId: string;
  /** 对应 `block.props` 的字段名，如 `src`、`backgroundUrl` */
  propKey: string;
  /** 输入框当前值，便于宿主作为默认筛选或回填参考 */
  currentUrl: string;
}

/** 图库列表中的一条资源 */
export interface GalleryItem {
  id: string;
  /** 写入邮件字段的最终图片地址（建议 HTTPS 绝对 URL） */
  url: string;
  thumbnailUrl?: string;
  title?: string;
}

export interface ImageGalleryListResult {
  items: GalleryItem[];
  hasMore: boolean;
}

/**
 * 内置图库弹层的数据与扩展能力。实现 `listItems` 即可；上传、链接添加、删除等仅在提供对应方法时显示。
 */
export interface ImageGalleryAdapter {
  /** 搜索 + 分页；`query` 为搜索框当前文本，`page` 从 0 起 */
  listItems: (args: { query: string; page: number }) => Promise<ImageGalleryListResult>;
  /** 在弹层内「上传到图库」：成功后编辑器会重新拉取第 0 页 */
  uploadFile?: (file: File) => Promise<void | string>;
  /** 在弹层内「通过链接添加」：校验/落库后编辑器会重新拉取第 0 页 */
  addByUrl?: (url: string) => Promise<void>;
  /** 从图库删除一条；提供后每张缩略图右上角显示删除按钮 */
  deleteItem?: (id: string) => Promise<void>;
}

export interface ImageAssetsHandlers {
  /**
   * 用户点击右侧「上传」并选择本地文件。宿主完成上传后返回 **绝对 HTTPS URL**。
   */
  uploadImage?: (file: File, ctx: ImageFieldContext) => Promise<string>;

  /**
   * 完全自管图床：与内置 `imageGallery` 可并存；
   * **同时配置时优先使用内置 `imageGallery` 弹层**。
   */
  pickImageFromGallery?: (ctx: ImageFieldContext) => Promise<string | null>;

  /**
   * 内置图库：实现 `listItems` 等后，将 `showGallery: true`，由本库渲染弹层；
   * 无需再写自有弹框 DOM。
   */
  imageGallery?: ImageGalleryAdapter;

  /**
   * 是否显示「上传」按钮。仅当配置了 `uploadImage` 时有效。
   * 默认 `true`；设为 `false` 可关闭（仍可手输 URL）。
   */
  showUpload?: boolean;

  /**
   * 是否显示「图床」按钮。在配置了 `pickImageFromGallery` 或 `imageGallery` 时有效。
   * 默认 `false`；需显式设为 `true` 才展示入口。
   */
  showGallery?: boolean;
}
