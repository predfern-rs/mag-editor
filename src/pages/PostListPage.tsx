import { useState } from 'react';
import type { PostSearchParams } from '../types/wordpress';
import { usePostList } from '../hooks/usePostList';
import { useCategories } from '../hooks/useCategories';
import { PostSearchBar } from '../components/posts/PostSearchBar';
import { PostTable } from '../components/posts/PostTable';

export function PostListPage() {
  const [searchParams, setSearchParams] = useState<PostSearchParams>({
    status: 'publish',
    per_page: 30,
  });

  const { data: posts, isLoading, error } = usePostList(searchParams);
  const { data: categories } = useCategories();

  function handleSearch(params: {
    search: string;
    status: string;
    lang: string;
    categoryId: string;
  }) {
    setSearchParams({
      search: params.search || undefined,
      status: params.status || undefined,
      lang: params.lang || undefined,
      category: params.categoryId ? Number(params.categoryId) : undefined,
      per_page: 30,
    });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Posts</h1>

      <PostSearchBar
        onSearch={handleSearch}
        categories={categories ?? []}
      />

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <p className="font-medium">Error loading posts</p>
          <p className="text-sm mt-1">{error instanceof Error ? error.message : 'Unknown error'}</p>
        </div>
      ) : (
        <PostTable posts={posts ?? []} isLoading={isLoading} />
      )}
    </div>
  );
}
