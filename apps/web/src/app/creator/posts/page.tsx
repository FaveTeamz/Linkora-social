'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

interface PostPerformance {
  id: string;
  title: string;
  tips: number;
  likes: number;
  views: number;
  revenue: number;
}

type SortKey = 'tips' | 'likes' | 'views' | 'revenue';
type SortDirection = 'asc' | 'desc';

const POSTS: PostPerformance[] = [
  { id: '1', title: 'Getting started with onchain publishing', tips: 1240, likes: 312, views: 8420, revenue: 124.0 },
  { id: '2', title: 'Designing for the creator economy', tips: 860, likes: 198, views: 5310, revenue: 86.0 },
  { id: '3', title: 'A field guide to community building', tips: 2150, likes: 540, views: 12980, revenue: 215.0 },
  { id: '4', title: 'Notes on sustainable monetization', tips: 430, likes: 87, views: 3120, revenue: 43.0 },
  { id: '5', title: 'Behind the scenes: my writing workflow', tips: 1580, likes: 421, views: 9640, revenue: 158.0 },
];

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'tips', label: 'Tips' },
  { key: 'likes', label: 'Likes' },
  { key: 'views', label: 'Views' },
  { key: 'revenue', label: 'Revenue' },
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export default function CreatorPostsPage() {
  const [sortKey, setSortKey] = useState<SortKey>('tips');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const sortedPosts = useMemo(() => {
    const copy = [...POSTS];
    copy.sort((a, b) => {
      const diff = a[sortKey] - b[sortKey];
      return sortDirection === 'asc' ? diff : -diff;
    });
    return copy;
  }, [sortKey, sortDirection]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Post performance</h1>
        <p className="mt-1 text-sm text-gray-500">
          A post-by-post breakdown of tips, likes, views, and earned revenue.
        </p>
      </header>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-medium text-gray-600">
                Post
              </th>
              {COLUMNS.map((column) => {
                const isActive = column.key === sortKey;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    className="px-4 py-3 text-right font-medium text-gray-600"
                    aria-sort={
                      isActive ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'
                    }
                  >
                    <button
                      type="button"
                      onClick={() => handleSort(column.key)}
                      className="inline-flex items-center gap-1 hover:text-gray-900"
                    >
                      {column.label}
                      <span aria-hidden="true" className="text-xs">
                        {isActive ? (sortDirection === 'asc' ? '\u25B2' : '\u25BC') : '\u2195'}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {sortedPosts.map((post) => (
              <tr key={post.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-left">
                  <Link
                    href={`/posts/${post.id}`}
                    className="font-medium text-gray-900 hover:underline"
                  >
                    {post.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-right text-gray-700">{formatNumber(post.tips)}</td>
                <td className="px-4 py-3 text-right text-gray-700">{formatNumber(post.likes)}</td>
                <td className="px-4 py-3 text-right text-gray-700">{formatNumber(post.views)}</td>
                <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(post.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
