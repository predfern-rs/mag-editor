import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listPosts } from '../../api/posts';
import { listLanguages } from '../../api/languages';
import type { Language } from '../../api/languages';
import type { WpPostListItem } from '../../types/wordpress';

interface PostSidebarProps {
  selectedPostId: number | null;
  onSelectPost: (postId: number) => void;
}

export function PostSidebar({ selectedPostId, onSelectPost }: PostSidebarProps) {
  const [lang, setLang] = useState('en');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data: languages } = useQuery({
    queryKey: ['languages'],
    queryFn: listLanguages,
    staleTime: 10 * 60 * 1000,
  });

  const { data: posts, isLoading } = useQuery({
    queryKey: ['posts', { lang, search, page, per_page: 50 }],
    queryFn: () =>
      listPosts({
        lang,
        search: search || undefined,
        per_page: 50,
        page,
        status: 'publish',
      }),
    staleTime: 30 * 1000,
  });

  const [searchInput, setSearchInput] = useState('');
  useMemo(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const activeLang = (languages ?? []).find((l: Language) => l.slug === lang);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Articles</h2>
      </div>

      {/* Language pills */}
      <div className="px-3 pb-3">
        <div className="flex flex-wrap gap-1">
          {(languages ?? []).map((l: Language) => (
            <button
              key={l.slug}
              onClick={() => { setLang(l.slug); setPage(1); }}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
                lang === l.slug
                  ? 'bg-blue-500 text-white shadow-sm'
                  : l.count === 0
                    ? 'bg-gray-50 text-gray-300'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              title={`${l.name} (${l.count} posts)`}
            >
              {l.slug.toUpperCase()}
              <span className={`${lang === l.slug ? 'text-blue-100' : 'text-gray-400'}`}>
                {l.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pb-3">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => { setSearchInput(e.target.value); setPage(1); }}
            placeholder={`Search ${activeLang?.name ?? ''} posts...`}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-3 py-2 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:bg-white transition-all"
          />
        </div>
      </div>

      {/* Post list */}
      <div className="flex-1 overflow-y-auto px-2">
        {isLoading ? (
          <div className="space-y-2 p-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-gray-100 rounded w-3/4 mb-1" />
                <div className="h-3 bg-gray-50 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : !posts?.length ? (
          <div className="p-6 text-center">
            <div className="text-2xl mb-2">📭</div>
            <p className="text-xs text-gray-400">No posts found</p>
          </div>
        ) : (
          <ul className="space-y-0.5 pb-2">
            {posts.map((post: WpPostListItem) => (
              <li key={post.id}>
                <button
                  onClick={() => onSelectPost(post.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-all ${
                    selectedPostId === post.id
                      ? 'bg-blue-50 ring-1 ring-blue-200'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div
                    className={`text-[13px] leading-snug line-clamp-2 ${
                      selectedPostId === post.id ? 'text-blue-700 font-semibold' : 'text-gray-700 font-medium'
                    }`}
                    dangerouslySetInnerHTML={{ __html: post.title.rendered }}
                  />
                  <div className="text-[10px] text-gray-400 mt-1 truncate font-mono">
                    /{post.slug}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Pagination */}
      {posts && posts.length >= 50 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 text-[11px] font-medium rounded-md bg-gray-100 hover:bg-gray-200 disabled:opacity-30 transition-colors"
          >
            ← Prev
          </button>
          <span className="text-[10px] text-gray-400">Page {page}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 text-[11px] font-medium rounded-md bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
