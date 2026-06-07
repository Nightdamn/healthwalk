import React, { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Node, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import DOMPurify from 'dompurify';
import { extractYoutubeId, extractDriveId, detectVideoType } from './VideoSection';
import { uploadTheoryMedia } from '../lib/db';

// Custom node: HTML5 <video controls> for direct file URLs
const VideoNode = Node.create({
  name: 'video',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: 'video[src]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['video', mergeAttributes(HTMLAttributes, {
      controls: 'true',
      playsinline: 'true',
      preload: 'auto',
      style: 'max-width:100%;border-radius:8px;display:block;margin:8px 0;',
    })];
  },
  addCommands() {
    return {
      setVideo: (options) => ({ commands }) =>
        commands.insertContent({ type: 'video', attrs: options }),
    };
  },
});

// Custom node: <iframe> for YouTube / Google Drive embeds
const IframeNode = Node.create({
  name: 'embedIframe',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: null },
      'data-embed': { default: 'video' },
    };
  },
  parseHTML() {
    return [{ tag: 'iframe[src]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['iframe', mergeAttributes(HTMLAttributes, {
      frameborder: '0',
      allowfullscreen: 'true',
      allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
      style: 'width:100%;aspect-ratio:16/9;border:none;border-radius:8px;display:block;margin:8px 0;',
    })];
  },
  addCommands() {
    return {
      setIframe: (options) => ({ commands }) =>
        commands.insertContent({ type: 'embedIframe', attrs: options }),
    };
  },
});

const btnStyle = (active) => ({
  padding: '4px 8px', border: 'none', borderRadius: 6,
  background: active ? 'rgba(39,174,96,0.15)' : 'transparent',
  color: active ? '#27ae60' : '#666',
  fontSize: 14, fontWeight: 600, cursor: 'pointer',
  minWidth: 28, height: 28,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
});

// Pop-over to pick media source: URL or file upload
function MediaPicker({ kind, onClose, onUrl, onFile, uploading }) {
  const [url, setUrl] = useState('');
  const fileRef = useRef(null);
  const accept = kind === 'image' ? 'image/*' : 'video/*';
  const title = kind === 'image' ? 'Картинка' : 'Видео';
  const placeholder = kind === 'image'
    ? 'https://...jpg / .png / .webp'
    : 'YouTube, Google Drive или прямая ссылка на видео';

  return (
    <div style={{
      position: 'absolute', top: '100%', left: 8, right: 8, marginTop: 4, zIndex: 50,
      background: '#fff', borderRadius: 12, padding: 10,
      boxShadow: '0 8px 32px rgba(0,0,0,0.15)', border: '1px solid rgba(0,0,0,0.06)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#1a1a2e' }}>Вставить: {title}</div>
        <button type="button" onClick={onClose} style={{
          background: 'none', border: 'none', color: '#999', cursor: 'pointer',
          fontSize: 16, padding: 2, lineHeight: 1,
        }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && url.trim()) { onUrl(url.trim()); } }}
          placeholder={placeholder}
          autoFocus
          style={{
            flex: 1, padding: '7px 10px', borderRadius: 8,
            border: '1.5px solid rgba(0,0,0,0.08)', background: '#fff',
            fontSize: 12, color: '#1a1a2e', outline: 'none',
          }}
        />
        <button
          type="button"
          disabled={!url.trim()}
          onClick={() => onUrl(url.trim())}
          style={{
            padding: '7px 12px', borderRadius: 8, border: 'none',
            background: url.trim() ? '#27ae60' : 'rgba(0,0,0,0.08)',
            color: url.trim() ? '#fff' : '#999',
            fontSize: 12, fontWeight: 600, cursor: url.trim() ? 'pointer' : 'not-allowed',
          }}
        >OK</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0' }}>
        <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.06)' }} />
        <span style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase' }}>или</span>
        <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.06)' }} />
      </div>

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        style={{
          width: '100%', padding: '8px 10px', borderRadius: 8,
          border: '1px dashed rgba(39,174,96,0.4)', background: 'rgba(39,174,96,0.05)',
          color: '#27ae60', fontSize: 12, fontWeight: 600,
          cursor: uploading ? 'wait' : 'pointer', opacity: uploading ? 0.6 : 1,
        }}
      >
        {uploading ? 'Загрузка...' : `📤 Загрузить ${kind === 'image' ? 'картинку' : 'видео'} с устройства`}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function Toolbar({ editor }) {
  const [picker, setPicker] = useState(null); // null | 'image' | 'video'
  const [uploading, setUploading] = useState(false);

  if (!editor) return null;

  const addLink = () => {
    const url = prompt('URL ссылки:');
    if (!url) return;
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const insertVideoUrl = (url) => {
    const ytId = extractYoutubeId(url);
    const driveId = extractDriveId(url);
    if (ytId) {
      editor.chain().focus().setIframe({ src: `https://www.youtube.com/embed/${ytId}` }).run();
    } else if (driveId) {
      editor.chain().focus().setIframe({ src: `https://drive.google.com/file/d/${driveId}/preview` }).run();
    } else {
      editor.chain().focus().setVideo({ src: url }).run();
    }
    setPicker(null);
  };

  const insertImageUrl = (url) => {
    editor.chain().focus().setImage({ src: url }).run();
    setPicker(null);
  };

  const handleFile = async (file) => {
    setUploading(true);
    try {
      const result = await uploadTheoryMedia(file);
      if (result?.url) {
        if (result.kind === 'image') {
          editor.chain().focus().setImage({ src: result.url }).run();
        } else {
          editor.chain().focus().setVideo({ src: result.url }).run();
        }
        setPicker(null);
      }
    } catch (err) {
      alert(`Не удалось загрузить файл: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 2, padding: '6px 8px',
        borderBottom: '1px solid rgba(0,0,0,0.06)', background: 'rgba(0,0,0,0.01)',
      }}>
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} style={btnStyle(editor.isActive('bold'))} title="Жирный"><b>B</b></button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} style={btnStyle(editor.isActive('italic'))} title="Курсив"><i>I</i></button>
        <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} style={btnStyle(editor.isActive('underline'))} title="Подчёркивание"><u>U</u></button>
        <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.08)', margin: '0 2px', alignSelf: 'center' }} />
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} style={btnStyle(editor.isActive('heading', { level: 2 }))} title="Заголовок 2">H2</button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} style={btnStyle(editor.isActive('heading', { level: 3 }))} title="Заголовок 3">H3</button>
        <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.08)', margin: '0 2px', alignSelf: 'center' }} />
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} style={btnStyle(editor.isActive('bulletList'))} title="Маркированный список">&#8226;</button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} style={btnStyle(editor.isActive('orderedList'))} title="Нумерованный список">1.</button>
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} style={btnStyle(editor.isActive('blockquote'))} title="Цитата">&#8220;</button>
        <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.08)', margin: '0 2px', alignSelf: 'center' }} />
        <button type="button" onClick={addLink} style={btnStyle(editor.isActive('link'))} title="Ссылка">&#x1f517;</button>
        <button type="button" onClick={() => setPicker(picker === 'image' ? null : 'image')} style={btnStyle(picker === 'image')} title="Изображение">&#x1f4f7;</button>
        <button type="button" onClick={() => setPicker(picker === 'video' ? null : 'video')} style={btnStyle(picker === 'video')} title="Видео">&#x1f3ac;</button>
        <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()} style={btnStyle(false)} title="Разделитель">&mdash;</button>
      </div>

      {picker && (
        <MediaPicker
          kind={picker}
          uploading={uploading}
          onClose={() => setPicker(null)}
          onUrl={(url) => picker === 'image' ? insertImageUrl(url) : insertVideoUrl(url)}
          onFile={handleFile}
        />
      )}
    </div>
  );
}

export default function RichTextEditor({ content, onChange, placeholder = 'Начните писать...' }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
      Image.configure({ inline: false, allowBase64: false }),
      VideoNode,
      IframeNode,
      Placeholder.configure({ placeholder }),
    ],
    content: content || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Sync content when switching between activities
  useEffect(() => {
    if (editor && content !== undefined) {
      const currentHtml = editor.getHTML();
      if (currentHtml !== content && content !== null) {
        editor.commands.setContent(content || '');
      }
    }
  }, [content, editor]);

  return (
    <div style={{
      border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 12, overflow: 'visible',
      background: 'rgba(255,255,255,0.7)', position: 'relative',
    }}>
      <Toolbar editor={editor} />
      <div style={{ padding: '12px 14px', minHeight: 120 }}>
        <EditorContent editor={editor} />
      </div>
      <style>{`
        .tiptap { outline: none; font-size: 14px; line-height: 1.6; color: #1a1a2e; }
        .tiptap p { margin: 0 0 8px; }
        .tiptap h2 { font-size: 18px; font-weight: 700; margin: 16px 0 8px; }
        .tiptap h3 { font-size: 16px; font-weight: 600; margin: 12px 0 6px; }
        .tiptap ul, .tiptap ol { padding-left: 20px; margin: 8px 0; }
        .tiptap li { margin: 4px 0; }
        .tiptap blockquote { border-left: 3px solid rgba(39,174,96,0.3); padding-left: 12px; margin: 8px 0; color: #666; font-style: italic; }
        .tiptap a { color: #3498db; text-decoration: underline; }
        .tiptap img { max-width: 100%; border-radius: 8px; margin: 8px 0; }
        .tiptap video { max-width: 100%; border-radius: 8px; margin: 8px 0; display: block; }
        .tiptap iframe { width: 100%; aspect-ratio: 16/9; border: none; border-radius: 8px; margin: 8px 0; display: block; }
        .tiptap hr { border: none; border-top: 1px solid rgba(0,0,0,0.08); margin: 16px 0; }
        .tiptap p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: #aaa; pointer-events: none; float: left; height: 0; }
      `}</style>
    </div>
  );
}

// X-2: iframe src is gated to a tiny allow-list of embed hosts. This is
// installed once per module load; running purify with a hook attached
// validates every iframe in every TheoryContent render.
const IFRAME_HOSTS = /^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com|drive\.google\.com|meet\.instep\.life)\//i;
DOMPurify.addHook('uponSanitizeElement', (node, data) => {
  if (data.tagName === 'iframe') {
    const src = node.getAttribute('src') || '';
    if (!IFRAME_HOSTS.test(src)) {
      // Strip the offending iframe entirely.
      node.parentNode?.removeChild(node);
    }
  }
});

// Read-only renderer for theory content.
// X-1/X-2: tightened DOMPurify config — `style` removed (CSS injection),
// iframe `src` restricted to a whitelist of trusted embed hosts only.
// A-7: same-origin /api/files/media URLs are rewritten with ?token=<jwt> so
// <img>/<video>/<iframe> tags work after the media endpoint went auth-only.
export function TheoryContent({ html }) {
  const cleanHtml = React.useMemo(() => {
    const sanitized = DOMPurify.sanitize(html || '', {
      ALLOWED_TAGS: [
        'p', 'h2', 'h3', 'ul', 'ol', 'li', 'a', 'img', 'em', 'strong', 'u', 'blockquote', 'hr', 'br',
        'video', 'source', 'iframe',
      ],
      ALLOWED_ATTR: [
        'href', 'src', 'alt', 'target', 'rel', 'class',
        'controls', 'playsinline', 'preload', 'poster', 'type',
        'width', 'height', 'frameborder', 'allow', 'allowfullscreen', 'data-embed',
      ],
      ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder'],
    });
    // Rewrite media URLs to carry the auth token. Same-origin /api/files/media/
    // is now requireAuthOrQueryToken; without ?token= the embedded tag would
    // 401 silently and show a broken image.
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('is_token') : null;
    if (!token) return sanitized;
    return sanitized.replace(
      /(src=["'])(\/api\/files\/media\/[^"'?#]+)(["'])/g,
      (_m, before, url, after) => `${before}${url}?token=${encodeURIComponent(token)}${after}`,
    );
  }, [html]);
  return (
    <div style={{ fontSize: 14, lineHeight: 1.7, color: '#1a1a2e' }}>
      <div className="theory-content" dangerouslySetInnerHTML={{ __html: cleanHtml }} />
      <style>{`
        .theory-content p { margin: 0 0 10px; }
        .theory-content h2 { font-size: 20px; font-weight: 700; margin: 20px 0 10px; }
        .theory-content h3 { font-size: 17px; font-weight: 600; margin: 16px 0 8px; }
        .theory-content ul, .theory-content ol { padding-left: 24px; margin: 10px 0; }
        .theory-content li { margin: 4px 0; }
        .theory-content blockquote { border-left: 3px solid rgba(39,174,96,0.3); padding-left: 14px; margin: 12px 0; color: #555; font-style: italic; }
        .theory-content a { color: #3498db; text-decoration: underline; }
        .theory-content img { max-width: 100%; border-radius: 10px; margin: 10px 0; cursor: pointer; }
        .theory-content video { max-width: 100%; border-radius: 10px; margin: 10px 0; display: block; }
        .theory-content iframe { width: 100%; aspect-ratio: 16/9; border: none; border-radius: 10px; margin: 10px 0; display: block; }
        .theory-content hr { border: none; border-top: 1px solid rgba(0,0,0,0.08); margin: 20px 0; }
      `}</style>
    </div>
  );
}
