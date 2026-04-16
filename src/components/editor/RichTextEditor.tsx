import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { useState, useCallback, useEffect } from 'react';

interface RichTextEditorProps {
  html: string;
  onHtmlChange: (html: string) => void;
}

export function RichTextEditor({ html, onHtmlChange }: RichTextEditorProps) {
  const [linkUrl, setLinkUrl] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 underline cursor-pointer',
        },
      }),
    ],
    content: html,
    onUpdate: ({ editor: ed }) => {
      onHtmlChange(ed.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          'prose prose-sm max-w-none focus:outline-none min-h-[400px] px-4 py-3',
      },
    },
  });

  // Sync external HTML changes (e.g. after save/refresh)
  useEffect(() => {
    if (editor && html !== editor.getHTML()) {
      editor.commands.setContent(html, false);
    }
  }, [html, editor]);

  const setLink = useCallback(() => {
    if (!editor) return;
    if (!linkUrl) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      setShowLinkInput(false);
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: linkUrl })
      .run();
    setLinkUrl('');
    setShowLinkInput(false);
  }, [editor, linkUrl]);

  const openLinkInput = useCallback(() => {
    if (!editor) return;
    const existingHref = editor.getAttributes('link').href as string | undefined;
    setLinkUrl(existingHref || '');
    setShowLinkInput(true);
  }, [editor]);

  const removeLink = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
  }, [editor]);

  if (!editor) return null;

  const isLinkActive = editor.isActive('link');
  const currentLinkHref = isLinkActive
    ? (editor.getAttributes('link').href as string)
    : '';

  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-200 bg-gray-50 rounded-t-lg flex-wrap">
        <ToolbarButton
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold"
        >
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic"
        >
          <em>I</em>
        </ToolbarButton>
        <span className="w-px h-5 bg-gray-300 mx-1" />
        <ToolbarButton
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Heading 2"
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          title="Heading 3"
        >
          H3
        </ToolbarButton>
        <span className="w-px h-5 bg-gray-300 mx-1" />
        <ToolbarButton
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet List"
        >
          • List
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Ordered List"
        >
          1. List
        </ToolbarButton>
        <span className="w-px h-5 bg-gray-300 mx-1" />
        <ToolbarButton
          active={isLinkActive}
          onClick={openLinkInput}
          title="Add/Edit Link — select text first, then click to add a link"
        >
          🔗 Link
        </ToolbarButton>
        {isLinkActive && (
          <>
            <ToolbarButton active={false} onClick={removeLink} title="Remove Link">
              ✕ Unlink
            </ToolbarButton>
            <span className="ml-2 text-xs text-blue-600 truncate max-w-48" title={currentLinkHref}>
              → {currentLinkHref}
            </span>
          </>
        )}
      </div>

      {/* Link input bar */}
      {showLinkInput && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border-b border-blue-200">
          <label className="text-xs font-medium text-blue-700 whitespace-nowrap">URL:</label>
          <input
            type="text"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setLink();
              if (e.key === 'Escape') setShowLinkInput(false);
            }}
            placeholder="/magazine/your-article-slug"
            className="flex-1 rounded border border-blue-300 px-2 py-1 text-sm outline-none focus:border-blue-500"
            autoFocus
          />
          <button
            onClick={setLink}
            className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
          >
            Apply
          </button>
          {linkUrl && (
            <button
              onClick={() => {
                setLinkUrl('');
                setLink();
              }}
              className="px-2 py-1 text-xs text-red-600 hover:text-red-800"
            >
              Remove
            </button>
          )}
          <button
            onClick={() => setShowLinkInput(false)}
            className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Editor content */}
      <EditorContent editor={editor} />

      {/* Helper text */}
      <div className="px-3 py-1.5 border-t border-gray-100 bg-gray-50 rounded-b-lg">
        <p className="text-[11px] text-gray-400">
          Click to edit text directly. Select text + click 🔗 Link to add a hyperlink. Click on an existing link to see/change its URL.
        </p>
      </div>
    </div>
  );
}

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
        active
          ? 'bg-blue-100 text-blue-700'
          : 'text-gray-600 hover:bg-gray-200 hover:text-gray-800'
      }`}
    >
      {children}
    </button>
  );
}
