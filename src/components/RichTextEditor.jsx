import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import DOMPurify from 'dompurify';

const btnStyle = (active) => ({
  padding: '4px 8px', border: 'none', borderRadius: 6,
  background: active ? 'rgba(39,174,96,0.15)' : 'transparent',
  color: active ? '#27ae60' : '#666',
  fontSize: 14, fontWeight: 600, cursor: 'pointer',
  minWidth: 28, height: 28,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
});

function Toolbar({ editor }) {
  if (!editor) return null;

  const addLink = () => {
    const url = prompt('URL ссылки:');
    if (!url) return;
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const addImage = () => {
    const url = prompt('URL изображения:');
    if (!url) return;
    editor.chain().focus().setImage({ src: url }).run();
  };

  return (
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
      <button type="button" onClick={addImage} style={btnStyle(false)} title="Изображение">&#x1f4f7;</button>
      <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()} style={btnStyle(false)} title="Разделитель">&mdash;</button>
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
      Image.configure({ inline: false, allowBase64: true }),
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
      border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 12, overflow: 'hidden',
      background: 'rgba(255,255,255,0.7)',
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
        .tiptap hr { border: none; border-top: 1px solid rgba(0,0,0,0.08); margin: 16px 0; }
        .tiptap p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: #aaa; pointer-events: none; float: left; height: 0; }
      `}</style>
    </div>
  );
}

// Read-only renderer for theory content
export function TheoryContent({ html }) {
  const cleanHtml = DOMPurify.sanitize(html || '', {
    ALLOWED_TAGS: ['p', 'h2', 'h3', 'ul', 'ol', 'li', 'a', 'img', 'em', 'strong', 'u', 'blockquote', 'hr', 'br'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'target', 'rel', 'class'],
  });
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
        .theory-content hr { border: none; border-top: 1px solid rgba(0,0,0,0.08); margin: 20px 0; }
      `}</style>
    </div>
  );
}
