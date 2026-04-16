import { Link } from 'react-router-dom';
import type { WpPostListItem } from '../../types/wordpress';

interface PostTableProps {
  posts: WpPostListItem[];
  isLoading: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  publish: 'bg-green-100 text-green-800',
  draft: 'bg-yellow-100 text-yellow-800',
  pending: 'bg-orange-100 text-orange-800',
  private: 'bg-purple-100 text-purple-800',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function PostTable({ posts, isLoading }: PostTableProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8">
        <div className="flex items-center justify-center gap-3 text-gray-500">
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          Loading posts...
        </div>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
        No posts found. Try adjusting your search filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm text-left">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500 border-b border-gray-200">
          <tr>
            <th className="px-4 py-3 font-medium">Title</th>
            <th className="px-4 py-3 font-medium">Slug</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium">Modified</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {posts.map((post) => (
            <tr key={post.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3">
                <Link
                  to={`/post/${post.id}`}
                  className="text-blue-600 hover:text-blue-800 font-medium hover:underline"
                  dangerouslySetInnerHTML={{ __html: post.title.rendered }}
                />
              </td>
              <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                {post.slug}
              </td>
              <td className="px-4 py-3">
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[post.status] ?? 'bg-gray-100 text-gray-800'}`}>
                  {post.status}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                {formatDate(post.date)}
              </td>
              <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                {formatDate(post.modified)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
