import { MailEditor } from '@simple-mail/core';
import '@simple-mail/core/style.css';
import { allBlocks } from '@simple-mail/blocks';

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
  /** 演示用：上传 / 图床返回 picsum 占位图（真实项目请接入自家 OSS 与素材库） */
  imageAssets: {
    showGallery: true, // 图床入口默认关闭，演示里显式打开
    async uploadImage(file: File) {
      const seed = encodeURIComponent(file.name.replace(/\W/g, '_').slice(0, 40) || 'up');
      return `https://picsum.photos/seed/${seed}/600/240`;
    },
    async pickImageFromGallery(ctx) {
      const ok = window.confirm(
        '演示：是否填入一张示例图 URL？\n真实接入时请在此打开自有图床弹框并 resolve 图片地址。',
      );
      if (!ok) return null;
      return `https://picsum.photos/seed/pick-${ctx.propKey}-${Date.now()}/600/240`;
    },
  },
  onChange: (doc) => {
    // 示例：把当前 doc 写到 console，方便调试
    console.debug('[doc changed]', doc);
  },
});

// 暴露到 window 方便手动调试
(window as any).editor = editor;
