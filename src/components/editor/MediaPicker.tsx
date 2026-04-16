import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { WP_BASE_URL, WP_AUTH_TOKEN } from '../../config';

interface MediaItem {
  id: number;
  title: { rendered: string };
  source_url: string;
  media_details?: {
    sizes?: Record<string, { source_url: string; width: number; height: number }>;
  };
}

async function fetchMedia(search: string, page: number): Promise<MediaItem[]> {
  const params = new URLSearchParams({
    per_page: '20',
    page: String(page),
    media_type: 'image',
    _fields: 'id,title,source_url,media_details',
  });
  if (search) params.set('search', search);

  const res = await fetch(`${WP_BASE_URL}/wp-json/wp/v2/media?${params}`, {
    headers: { Authorization: `Basic ${WP_AUTH_TOKEN}` },
  });
  if (!res.ok) return [];
  return res.json();
}

async function fetchMediaById(id: number): Promise<MediaItem | null> {
  if (!id || id <= 0) return null;
  const res = await fetch(
    `${WP_BASE_URL}/wp-json/wp/v2/media/${id}?_fields=id,title,source_url,media_details`,
    { headers: { Authorization: `Basic ${WP_AUTH_TOKEN}` } },
  );
  if (!res.ok) return null;
  return res.json();
}

function getThumbnailUrl(item: MediaItem): string {
  const sizes = item.media_details?.sizes;
  if (sizes) {
    if (sizes['post-thumbnail']) return sizes['post-thumbnail'].source_url;
    if (sizes['medium_large']) return sizes['medium_large'].source_url;
  }
  return item.source_url;
}

/** Shows a thumbnail preview for a media ID */
export function MediaPreview({ mediaId }: { mediaId: number }) {
  const { data: media } = useQuery({
    queryKey: ['media', mediaId],
    queryFn: () => fetchMediaById(mediaId),
    enabled: mediaId > 0,
    staleTime: 5 * 60 * 1000,
  });

  if (!media) {
    return (
      <div className="w-full h-full min-h-[3rem] bg-gray-100 rounded flex items-center justify-center text-[9px] text-gray-400">
        ID: {mediaId}
      </div>
    );
  }

  return (
    <div className="relative group w-full h-full">
      <img
        src={getThumbnailUrl(media)}
        alt={media.title.rendered || ''}
        className="w-full h-full object-cover rounded"
      />
      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] px-1 py-0.5 rounded-b truncate opacity-0 group-hover:opacity-100 transition-opacity">
        {media.title.rendered || `#${media.id}`}
      </div>
    </div>
  );
}

/** Full media picker modal for selecting a replacement image */
interface MediaPickerProps {
  isOpen: boolean;
  currentMediaId: number;
  onSelect: (mediaId: number) => void;
  onClose: () => void;
}

export function MediaPicker({ isOpen, currentMediaId, onSelect, onClose }: MediaPickerProps) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data: items, isLoading } = useQuery({
    queryKey: ['media-search', search, page],
    queryFn: () => fetchMedia(search, page),
    enabled: isOpen,
    staleTime: 30_000,
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="text-sm font-bold text-gray-800">Select Image</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-gray-100">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search images..."
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            autoFocus
          />
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="text-center py-8 text-sm text-gray-400">Loading...</div>
          ) : !items?.length ? (
            <div className="text-center py-8 text-sm text-gray-400">No images found</div>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                  className={`relative rounded-lg overflow-hidden border-2 transition-all hover:shadow-md ${
                    item.id === currentMediaId
                      ? 'border-blue-500 ring-2 ring-blue-200'
                      : 'border-transparent hover:border-blue-300'
                  }`}
                >
                  <img
                    src={getThumbnailUrl(item)}
                    alt={item.title.rendered}
                    className="w-full h-28 object-cover"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] px-1.5 py-0.5 truncate">
                    {item.title.rendered || `#${item.id}`}
                  </div>
                  {item.id === currentMediaId && (
                    <div className="absolute top-1 right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs">
                      ✓
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 text-xs font-medium rounded-md bg-gray-100 hover:bg-gray-200 disabled:opacity-30"
          >
            ← Prev
          </button>
          <span className="text-xs text-gray-400">Page {page}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={!items || items.length < 20}
            className="px-3 py-1 text-xs font-medium rounded-md bg-gray-100 hover:bg-gray-200 disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
