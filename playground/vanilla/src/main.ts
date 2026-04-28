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
  onChange: (doc) => {
    // 示例：把当前 doc 写到 console，方便调试
    console.debug('[doc changed]', doc);
  },
});

// 暴露到 window 方便手动调试
(window as any).editor = editor;
