import { useState, useEffect } from 'react';
import type { YoastMeta } from '../../types/wordpress';
import { useUpdateYoast } from '../../hooks/useYoast';

interface YoastPostData {
  id: number;
  title: { rendered: string; raw: string };
  slug: string;
  meta: Record<string, unknown>;
  yoast_head_json?: Record<string, unknown>;
}

interface YoastPanelProps {
  postId: number;
  yoastData: YoastPostData | undefined;
  onUpdate: () => void;
}

export function YoastPanel({ postId, yoastData, onUpdate }: YoastPanelProps) {
  const updateYoast = useUpdateYoast(postId);

  const meta = yoastData?.meta as Partial<YoastMeta> | undefined;

  const [seoTitle, setSeoTitle] = useState('');
  const [metaDesc, setMetaDesc] = useState('');
  const [focusKw, setFocusKw] = useState('');
  const [canonical, setCanonical] = useState('');

  useEffect(() => {
    if (meta) {
      setSeoTitle(meta._yoast_wpseo_title ?? '');
      setMetaDesc(meta._yoast_wpseo_metadesc ?? '');
      setFocusKw(meta._yoast_wpseo_focuskw ?? '');
      setCanonical(meta._yoast_wpseo_canonical ?? '');
    }
  }, [meta]);

  function handleSave() {
    updateYoast.mutate(
      {
        _yoast_wpseo_title: seoTitle,
        _yoast_wpseo_metadesc: metaDesc,
        _yoast_wpseo_focuskw: focusKw,
        _yoast_wpseo_canonical: canonical,
      },
      { onSuccess: onUpdate },
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-800">Yoast SEO</h3>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          SEO Title
          <span className={`ml-1 ${seoTitle.length > 60 ? 'text-red-500' : 'text-gray-400'}`}>
            ({seoTitle.length}/60)
          </span>
        </label>
        <input
          type="text"
          value={seoTitle}
          onChange={(e) => setSeoTitle(e.target.value)}
          className="w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Meta Description
          <span
            className={`ml-1 ${
              metaDesc.length < 150 || metaDesc.length > 160 ? 'text-yellow-600' : 'text-green-600'
            }`}
          >
            ({metaDesc.length}/160)
          </span>
        </label>
        <textarea
          value={metaDesc}
          onChange={(e) => setMetaDesc(e.target.value)}
          rows={3}
          className="w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-y"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Focus Keyphrase</label>
        <input
          type="text"
          value={focusKw}
          onChange={(e) => setFocusKw(e.target.value)}
          className="w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Canonical URL</label>
        <input
          type="text"
          value={canonical}
          onChange={(e) => setCanonical(e.target.value)}
          placeholder="Leave empty for default"
          className="w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <button
        onClick={handleSave}
        disabled={updateYoast.isPending}
        className="w-full px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {updateYoast.isPending ? 'Saving...' : 'Save SEO'}
      </button>

      {updateYoast.isError && (
        <p className="text-xs text-red-600">
          Error: {updateYoast.error instanceof Error ? updateYoast.error.message : 'Save failed'}
        </p>
      )}
    </div>
  );
}
