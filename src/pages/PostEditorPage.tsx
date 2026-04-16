import { useState } from 'react';
import { usePost } from '../hooks/usePost';
import { usePostContent, useUpdatePostContent } from '../hooks/usePostContent';
import { revertToLastRevision } from '../api/content';
import { useQueryClient } from '@tanstack/react-query';
import { useYoast } from '../hooks/useYoast';
import { useAcf } from '../hooks/useAcf';
import { RawContentEditor } from '../components/editor/RawContentEditor';
import { FindReplacePanel } from '../components/editor/FindReplacePanel';
import { YoastPanel } from '../components/seo/YoastPanel';
import { AcfLeadPanel } from '../components/seo/AcfLeadPanel';
import { SaveBar } from '../components/editor/SaveBar';
import { DiffPreview } from '../components/editor/DiffPreview';
import { AiChatEditor } from '../components/editor/AiChatEditor';
import { BlockManager } from '../components/editor/BlockManager';
import { ContentPreviewModal } from '../components/editor/ContentPreviewModal';
import { ReviewPreview } from '../components/editor/ReviewPreview';
import { getArticleUrls } from '../lib/url-mapping';
import { getActiveSite } from '../config';

type EditorView = 'ai-chat' | 'blocks' | 'find-replace' | 'raw';

const EDITOR_VIEWS: { id: EditorView; label: string; icon: string }[] = [
  { id: 'ai-chat', label: 'AI Editor', icon: '🤖' },
  { id: 'blocks', label: 'Blocks', icon: '🧩' },
  { id: 'find-replace', label: 'Find & Replace', icon: '🔍' },
  { id: 'raw', label: 'Raw HTML', icon: '📝' },
];

interface PostEditorPageProps {
  postIdOverride?: number;
}

export function PostEditorPage({ postIdOverride }: PostEditorPageProps) {
  const postId = postIdOverride ?? 0;
  const queryClient = useQueryClient();

  const { data: post, isLoading: postLoading } = usePost(postId);
  const { data: contentData, isLoading: contentLoading } = usePostContent(postId);
  const yoast = useYoast(postId);
  const acf = useAcf(postId);
  const updateContent = useUpdatePostContent(postId);

  const [editedContent, setEditedContent] = useState<string | null>(null);
  const [editorView, setEditorView] = useState<EditorView>('ai-chat');
  const [diffOpen, setDiffOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [seoOpen, setSeoOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const currentContent = editedContent ?? contentData?.content.raw ?? '';
  const renderedHtml = contentData?.content.rendered ?? '';
  const originalContent = contentData?.content.raw ?? '';
  const hasChanges = editedContent !== null && editedContent !== originalContent;

  function handleContentChange(newContent: string) {
    setEditedContent(newContent);
  }

  function handleSave() {
    if (!editedContent) return;
    updateContent.mutate(editedContent, {
      onSuccess: () => {
        setEditedContent(null);
        setLastSaved(new Date());
        setDiffOpen(false);
      },
    });
  }

  if (postLoading || contentLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="w-10 h-10 mx-auto mb-3 rounded-full border-2 border-blue-200 border-t-blue-500 animate-spin" />
          <p className="text-sm text-gray-400">Loading post...</p>
        </div>
      </div>
    );
  }

  if (!post || !contentData) {
    return (
      <div className="bg-white rounded-xl border border-red-200 p-8 text-center">
        <div className="text-3xl mb-2">⚠️</div>
        <p className="text-red-600 font-medium">Post not found</p>
      </div>
    );
  }

  return (
    <div className="pb-20 space-y-4">
      {/* Post header card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h1
              className="text-xl font-bold text-gray-800 leading-snug"
              dangerouslySetInnerHTML={{ __html: post.title.rendered }}
            />
            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs font-mono text-gray-400 truncate">/{post.slug}</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                post.status === 'publish'
                  ? 'bg-green-50 text-green-600'
                  : 'bg-amber-50 text-amber-600'
              }`}>
                {post.status}
              </span>
              {hasChanges && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-50 text-[10px] font-semibold text-amber-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Unsaved changes
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4">
            <InfoPill label="ID" value={String(post.id)} />
            <InfoPill label="Modified" value={new Date(post.modified).toLocaleDateString()} />
            <InfoPill label="Content" value={`${(currentContent.length / 1000).toFixed(1)}k`} />
          </div>
        </div>
      </div>

      {/* Editor tabs + SEO toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-200 shadow-sm p-1">
          {EDITOR_VIEWS.map((view) => (
            <button
              key={view.id}
              onClick={() => setEditorView(view.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                editorView === view.id
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              }`}
            >
              <span>{view.icon}</span>
              {view.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setPreviewOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl border bg-white border-gray-200 text-gray-500 hover:bg-gray-50 shadow-sm transition-all"
          >
            👁️ Preview Article
          </button>
          <button
            onClick={() => setSeoOpen(!seoOpen)}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl border transition-all ${
              seoOpen
                ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50 shadow-sm'
            }`}
          >
            ⚙️ SEO & Meta
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div className={`grid gap-4 ${seoOpen ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1'}`}>
        {/* Editor */}
        <div className={seoOpen ? 'lg:col-span-2' : ''}>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {editorView === 'ai-chat' && (
              <AiChatEditor
                content={currentContent}
                postTitle={post.title.rendered}
                onContentChange={handleContentChange}
                onShowReview={() => setReviewOpen(true)}
                onShowDiff={() => setDiffOpen(true)}
              />
            )}

            {editorView === 'blocks' && (
              <div className="p-5">
                <BlockManager
                  content={currentContent}
                  onContentChange={handleContentChange}
                />
              </div>
            )}

            {editorView === 'find-replace' && (
              <div className="p-5">
                <FindReplacePanel
                  content={currentContent}
                  onContentChange={handleContentChange}
                />
              </div>
            )}

            {editorView === 'raw' && (
              <RawContentEditor
                content={currentContent}
                onChange={handleContentChange}
                readOnly={false}
              />
            )}
          </div>
        </div>

        {/* SEO Sidebar */}
        {seoOpen && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-4">
                <span className="w-6 h-6 rounded-md bg-green-50 flex items-center justify-center text-xs">🎯</span>
                Yoast SEO
              </h3>
              <YoastPanel
                postId={postId}
                yoastData={yoast.data}
                onUpdate={() => void yoast.refetch()}
              />
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-4">
                <span className="w-6 h-6 rounded-md bg-purple-50 flex items-center justify-center text-xs">📄</span>
                Lead / Excerpt
              </h3>
              <AcfLeadPanel
                postId={postId}
                acfData={acf.data}
                onUpdate={() => void acf.refetch()}
              />
            </div>
          </div>
        )}
      </div>

      <ReviewPreview
        newContent={currentContent}
        isOpen={reviewOpen}
        onClose={() => setReviewOpen(false)}
        onConfirm={handleSave}
        onDiscard={() => {
          setEditedContent(null);
          setReviewOpen(false);
        }}
      />

      <ContentPreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        html={renderedHtml}
        title={post.title.rendered}
        slug={post.slug}
        articleUrls={getArticleUrls(getActiveSite().id, 'en', post.slug, post.link)}
      />

      <DiffPreview
        oldContent={originalContent}
        newContent={currentContent}
        isOpen={diffOpen}
        onClose={() => setDiffOpen(false)}
        onConfirm={handleSave}
      />

      <SaveBar
        hasChanges={hasChanges}
        isSaving={updateContent.isPending}
        onSave={handleSave}
        onReview={() => setReviewOpen(true)}
        onReviewChanges={() => setDiffOpen(true)}
        onRevert={async () => {
          await revertToLastRevision(postId);
          setEditedContent(null);
          await queryClient.invalidateQueries({ queryKey: ['post-content', postId] });
          await queryClient.invalidateQueries({ queryKey: ['post', postId] });
        }}
        lastSaved={lastSaved}
      />
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-100">
      <span className="text-[10px] text-gray-400 font-medium">{label}</span>
      <span className="text-[11px] text-gray-600 font-semibold">{value}</span>
    </div>
  );
}
