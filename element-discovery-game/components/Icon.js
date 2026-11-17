import { isUrl } from '@/lib/ui';

// icon_url may hold an emoji glyph or a real image URL
export default function Icon({ src, size = '1.5rem' }) {
  if (isUrl(src)) return <img src={src} alt="" width={28} height={28} style={{ borderRadius: 6 }} />;
  return <span style={{ fontSize: size, lineHeight: 1 }}>{src || '❔'}</span>;
}
