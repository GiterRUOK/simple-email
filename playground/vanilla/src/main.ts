import {
  MailEditor,
  type GalleryItem,
  type ImageGalleryAdapter,
  type ImageGalleryListResult,
} from '@simple-mail/core';
import '@simple-mail/core/style.css';
import { allBlocks } from '@simple-mail/blocks';

const demoItems: GalleryItem[] = [
  {
    id: 'demo-1',
    url: 'https://picsum.photos/seed/simplemail-a/640/320',
    thumbnailUrl: 'https://picsum.photos/seed/simplemail-a/240/160',
    title: '示例素材 A',
  },
  {
    id: 'demo-2',
    url: 'https://picsum.photos/seed/simplemail-b/640/320',
    thumbnailUrl: 'https://picsum.photos/seed/simplemail-b/240/160',
    title: '示例素材 B',
  },
];

let demoNextId = 100;

const demoGalleryAdapter: ImageGalleryAdapter = {
  async listItems({
    query,
    page,
  }: {
    query: string;
    page: number;
  }): Promise<ImageGalleryListResult> {
    const q = query.trim().toLowerCase();
    const filtered = demoItems.filter(
      (x) => !q || `${x.title ?? ''} ${x.url}`.toLowerCase().includes(q),
    );
    const pageSize = 6;
    const start = page * pageSize;
    const items = filtered.slice(start, start + pageSize);
    const hasMore = start + pageSize < filtered.length;
    await new Promise((r) => setTimeout(r, page === 0 ? 120 : 60));
    return { items, hasMore };
  },
  async uploadFile(file: File): Promise<void> {
    const seed =
      encodeURIComponent(file.name.replace(/\W/g, '_').slice(0, 24) || 'up') +
      '-' +
      Date.now();
    const url = `https://picsum.photos/seed/${seed}/640/280`;
    demoItems.unshift({
      id: `up-${demoNextId++}`,
      url,
      thumbnailUrl: url,
      title: file.name,
    });
  },
  async addByUrl(raw: string): Promise<void> {
    const u = raw.trim();
    if (!/^https?:\/\/.+/i.test(u)) throw new Error('请输入有效的 http(s) 链接');
    demoItems.unshift({
      id: `url-${demoNextId++}`,
      url: u,
      thumbnailUrl: u,
      title: '外链图片',
    });
  },
  async deleteItem(id: string): Promise<void> {
    const i = demoItems.findIndex((x) => x.id === id);
    if (i >= 0) demoItems.splice(i, 1);
  },
};

const container = document.getElementById('app')!;

const editor = new MailEditor({
  container,
  blocks: allBlocks,
  initialDoc: {
    meta: { subject: '欢迎加入 Simple Mail！', preheader: '一封示例邮件', width: 600 },
    variables: [
      { key: 'user.name', label: '用户名', sample: '张三' },
      { key: 'user.email', label: '邮箱', sample: 'zhangsan@example.com' },
      { key: 'unsubscribeUrl', label: '退订地址', sample: 'https://example.com/unsubscribe' },
    ],
    sections: [],
  },
  /** 演示：侧边栏上传 + 内置图库（列表 / 搜索一行工具栏 / 上传与添加 / 删除） */
  imageAssets: {
    showGallery: true,
    async uploadImage(file: File) {
      const seed = encodeURIComponent(file.name.replace(/\W/g, '_').slice(0, 40) || 'up');
      return `https://picsum.photos/seed/${seed}/600/240`;
    },
    imageGallery: demoGalleryAdapter,
  },
  onChange: (doc) => {
    console.debug('[doc changed]', doc);
  },
  /** 体验：右栏数字 / 内边距 / 字号滑块等（字重恒为五档平铺） */
  ui: { preferSliderControls: true },
  /** 顶栏主题色拾色器；未设 accentColor 时使用样式表随 light/dark/system 的默认紫/靛 */
  showAccentColorPicker: true,
});

(window as unknown as { editor: MailEditor }).editor = editor;
