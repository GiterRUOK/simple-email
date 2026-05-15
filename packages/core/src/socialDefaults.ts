/** 与 blocks 中社交图标预设背景一致；core 不可依赖 blocks，供属性面板展示默认背景色 */
export function defaultSocialIconBackground(network: string): string {
  const m: Record<string, string> = {
    wechat: '#1AAD19',
    weibo: '#E6162D',
    x: '#000000',
    linkedin: '#0A66C2',
    github: '#181717',
    facebook: '#1877F2',
    instagram: '#E4405F',
    ig: '#E4405F',
    youtube: '#FF0000',
    tiktok: '#000000',
    rabbit: '#FF2442',
    website: '#6b7280',
    web: '#6b7280',
  };
  return m[network] ?? '#6b7280';
}
