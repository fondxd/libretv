'use client';

import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client-api';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { DoubanItem } from '@/lib/types';
import { DoubanCard } from './video-card';

const MOVIE_TAGS: { label: string; query: string }[] = [
  { label: 'Popular', query: '热门' },
  { label: 'Latest', query: '最新' },
  { label: 'Classics', query: '经典' },
  { label: 'Top Rated', query: '豆瓣高分' },
  { label: 'Hidden Gems', query: '冷门佳片' },
  { label: 'Chinese', query: '华语' },
  { label: 'Western', query: '欧美' },
  { label: 'Korean', query: '韩国' },
  { label: 'Japanese', query: '日本' },
  { label: 'Anime', query: '日本动画' },
];

const TV_TAGS: { label: string; query: string }[] = [
  { label: 'Popular', query: '热门' },
  { label: 'US Drama', query: '美剧' },
  { label: 'UK Drama', query: '英剧' },
  { label: 'K-Drama', query: '韩剧' },
  { label: 'J-Drama', query: '日剧' },
  { label: 'C-Drama', query: '国产剧' },
  { label: 'HK Drama', query: '港剧' },
  { label: 'Anime', query: '日本动画' },
  { label: 'Variety', query: '综艺' },
  { label: 'Documentary', query: '纪录片' },
];

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function RecommendSection({ onPick }: { onPick: (title: string) => void }) {
  const doubanEnabled = useAppStore((s) => s.doubanEnabled);
  const recommendSource = useAppStore((s) => s.recommendSource);

  if (!doubanEnabled) return null;
  if (recommendSource === 'bangumi') return <BangumiView onPick={onPick} />;
  if (recommendSource === 'hot-list') return <HotListView onPick={onPick} />;
  return <DoubanView onPick={onPick} />;
}

function DoubanView({ onPick }: { onPick: (title: string) => void }) {
  const [type, setType] = useState<'movie' | 'tv'>('movie');
  const [selectedTag, setSelectedTag] = useState('Popular');
  const [page, setPage] = useState(1);
  const pageSize = 40;
  const sectionRef = useRef<HTMLElement>(null);

  const tags = type === 'movie' ? MOVIE_TAGS : TV_TAGS;
  const currentTagQuery = tags.find((t) => t.label === selectedTag)?.query ?? '热门';

  const query = useQuery({
    queryKey: ['douban', type, currentTagQuery, page],
    queryFn: ({ signal }) => api.douban(type, currentTagQuery, (page - 1) * pageSize, pageSize, signal),
  });

  const [sortMode, setSortMode] = useState<'default' | 'rating_desc' | 'name_asc'>('default');

  const items = query.data?.items ?? [];

  const sortedItems = useMemo(() => {
    if (sortMode === 'default') return items;
    const copy = [...items];
    if (sortMode === 'rating_desc') {
      return copy.sort((a, b) => (parseFloat(b.rating || '0') || 0) - (parseFloat(a.rating || '0') || 0));
    }
    if (sortMode === 'name_asc') {
      return copy.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN', { sensitivity: 'base' }));
    }
    return copy;
  }, [items, sortMode]);

  const switchType = (t: 'movie' | 'tv') => {
    if (t === type) return;
    setType(t);
    setSelectedTag('Popular');
    setPage(1);
  };

  const switchTag = (label: string) => {
    if (label === selectedTag) return;
    setSelectedTag(label);
    setPage(1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section ref={sectionRef} aria-label="Featured Recommendations">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="flex bg-chip rounded-lg p-0.5">
            <TypeButton active={type === 'movie'} onClick={() => switchType('movie')}>
              Movies
            </TypeButton>
            <TypeButton active={type === 'tv'} onClick={() => switchType('tv')}>
              TV Series
            </TypeButton>
          </div>
        </div>
        <span className="text-xs text-faint">Page {page}</span>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {tags.map((t) => (
          <button
            key={t.label}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs transition-colors',
              t.label === selectedTag ? 'bg-accent text-accent-contrast font-medium' : 'bg-chip text-muted hover:text-content hover:bg-hover'
            )}
            onClick={() => switchTag(t.label)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Home Movie Sorting Bar */}
      {items.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3 px-3 py-1.5 bg-surface-raised border border-line rounded-lg text-xs">
          <div className="flex items-center gap-1.5 text-faint">
            <span>↕️</span>
            <span className="font-medium text-muted">Sort:</span>
          </div>
          <div className="flex items-center gap-1.5">
            {[
              { id: 'default', label: 'Recommended' },
              { id: 'rating_desc', label: '★ Highest Rating' },
              { id: 'name_asc', label: '🔤 Title A-Z' },
            ].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSortMode(s.id as any)}
                className={cn(
                  'px-2 py-0.5 rounded text-xs font-medium transition-colors',
                  sortMode === s.id
                    ? 'bg-accent text-accent-contrast shadow-sm'
                    : 'bg-chip text-muted hover:text-content hover:bg-hover'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {query.isError ? (
        <p className="text-center text-sm text-faint py-8">Failed to load recommendations. Please try again later or disable in Settings.</p>
      ) : query.isLoading ? (
        <GridSkeleton />
      ) : items.length === 0 ? (
        <p className="text-center text-sm text-faint py-8">No recommendations available in this category</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {sortedItems.map((item) => (
              <DoubanCard key={item.id} item={item} onClick={() => onPick(item.title)} />
            ))}
          </div>

          {/* Douban Pagination Controls */}
          <div className="flex items-center justify-between gap-3 mt-6 pt-3 border-t border-line text-xs">
            <span className="text-faint">
              Page <strong className="text-content">{page}</strong> · Showing <strong className="text-content">{items.length}</strong> titles
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1 || query.isFetching}
                onClick={() => handlePageChange(page - 1)}
                className="btn-ghost btn-sm disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ‹ Previous
              </button>
              <span className="px-2.5 py-1 rounded-md bg-chip text-content font-bold border border-line">
                {page}
              </span>
              <button
                type="button"
                disabled={items.length < pageSize || query.isFetching}
                onClick={() => handlePageChange(page + 1)}
                className="btn-ghost btn-sm disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next ›
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function BangumiView({ onPick }: { onPick: (title: string) => void }) {
  const [weekday, setWeekday] = useState<number | 'all'>('all');

  const query = useQuery({
    queryKey: ['bangumi-calendar'],
    queryFn: ({ signal }) => api.bangumiCalendar(signal),
  });

  let items: DoubanItem[] = [];
  if (query.data) {
    items = weekday === 'all'
      ? query.data.days.flatMap((d) => d.items)
      : (query.data.days.find((d) => d.weekday === weekday)?.items ?? []);
  }

  return (
    <section aria-label="Anime Schedule">
      <div className="flex flex-wrap gap-1.5 mb-4">
        <ChipButton active={weekday === 'all'} onClick={() => setWeekday('all')}>
          All
        </ChipButton>
        {WEEKDAYS.map((name, i) => (
          <ChipButton key={name} active={weekday === i + 1} onClick={() => setWeekday(i + 1)}>
            {name}
          </ChipButton>
        ))}
      </div>

      {query.isError ? (
        <p className="text-center text-sm text-faint py-8">Failed to load recommendations. Please try again later or disable in Settings.</p>
      ) : query.isLoading ? (
        <GridSkeleton />
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
          {items.map((item) => (
            <DoubanCard key={item.id} item={item} onClick={() => onPick(item.title)} />
          ))}
        </div>
      )}
    </section>
  );
}

const HOT_LISTS = [
  { id: 'douban_movie_weekly', label: 'Weekly Movies' },
  { id: 'douban_tv_chinese', label: 'Weekly C-Drama' },
  { id: 'douban_tv_global', label: 'Weekly Global Drama' },
  { id: 'douban_show_chinese', label: 'Chinese Variety' },
  { id: 'douban_show_global', label: 'Global Variety' },
  { id: 'baidu_teleplay', label: 'Trending Shows' },
];

function HotListView({ onPick }: { onPick: (title: string) => void }) {
  const [listId, setListId] = useState(HOT_LISTS[0].id);
  const [sortMode, setSortMode] = useState<'default' | 'rating_desc' | 'year_desc' | 'year_asc' | 'name_asc'>('default');
  const [selectedYear, setSelectedYear] = useState<string>('all');

  const query = useQuery({
    queryKey: ['hot-list', listId],
    queryFn: ({ signal }) => api.hotList(listId, signal),
  });

  const items = query.data?.items ?? [];

  const availableYears = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (item.year && /^\d{4}$/.test(item.year.trim())) {
        set.add(item.year.trim());
      }
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [items]);

  const filteredItems = useMemo(() => {
    if (selectedYear === 'all') return items;
    return items.filter((item) => item.year === selectedYear);
  }, [items, selectedYear]);

  const sortedItems = useMemo(() => {
    if (sortMode === 'default') return filteredItems;
    const copy = [...filteredItems];
    if (sortMode === 'rating_desc') {
      return copy.sort((a, b) => (parseFloat(b.rating || '0') || 0) - (parseFloat(a.rating || '0') || 0));
    }
    if (sortMode === 'year_desc') {
      return copy.sort((a, b) => (parseInt(b.year || '0', 10) || 0) - (parseInt(a.year || '0', 10) || 0));
    }
    if (sortMode === 'year_asc') {
      return copy.sort((a, b) => (parseInt(a.year || '9999', 10) || 9999) - (parseInt(b.year || '9999', 10) || 9999));
    }
    if (sortMode === 'name_asc') {
      return copy.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN', { sensitivity: 'base' }));
    }
    return copy;
  }, [filteredItems, sortMode]);

  return (
    <section aria-label="Trending Charts">
      <div className="flex flex-wrap gap-1.5 mb-3">
        {HOT_LISTS.map((l) => (
          <ChipButton
            key={l.id}
            active={listId === l.id}
            onClick={() => {
              setListId(l.id);
              setSelectedYear('all');
            }}
          >
            {l.label}
          </ChipButton>
        ))}
      </div>

      {/* Year Filter for Trending Charts */}
      {availableYears.length > 0 && (
        <div className="flex items-center gap-1.5 mb-2.5 overflow-x-auto scrollbar-thin text-xs">
          <span className="text-faint text-[11px] shrink-0 font-medium">Release Year:</span>
          <button
            type="button"
            onClick={() => setSelectedYear('all')}
            className={cn(
              'px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors',
              selectedYear === 'all'
                ? 'bg-accent text-accent-contrast shadow-sm'
                : 'bg-chip text-muted hover:text-content hover:bg-hover'
            )}
          >
            All
          </button>
          {availableYears.map((yr) => (
            <button
              key={yr}
              type="button"
              onClick={() => setSelectedYear(yr)}
              className={cn(
                'px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors',
                selectedYear === yr
                  ? 'bg-accent text-accent-contrast shadow-sm'
                  : 'bg-chip text-muted hover:text-content hover:bg-hover'
              )}
            >
              {yr}
            </button>
          ))}
        </div>
      )}

      {/* Home Movie Sorting Bar */}
      {items.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3 px-3 py-1.5 bg-surface-raised border border-line rounded-lg text-xs">
          <div className="flex items-center gap-1.5 text-faint">
            <span>↕️</span>
            <span className="font-medium text-muted">Sort:</span>
          </div>
          <div className="flex items-center gap-1.5">
            {[
              { id: 'default', label: 'Trending Rank' },
              { id: 'rating_desc', label: '★ Highest Rating' },
              { id: 'year_desc', label: '📅 Newest Year' },
              { id: 'year_asc', label: '⏳ Oldest Year' },
              { id: 'name_asc', label: '🔤 Title A-Z' },
            ].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSortMode(s.id as any)}
                className={cn(
                  'px-2 py-0.5 rounded text-xs font-medium transition-colors',
                  sortMode === s.id
                    ? 'bg-accent text-accent-contrast shadow-sm'
                    : 'bg-chip text-muted hover:text-content hover:bg-hover'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {query.isError ? (
        <p className="text-center text-sm text-faint py-8">Failed to load recommendations. Please try again later or disable in Settings.</p>
      ) : query.isLoading ? (
        <GridSkeleton />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {sortedItems.map((item) => (
            <DoubanCard key={item.id} item={item} onClick={() => onPick(item.title)} />
          ))}
        </div>
      )}
    </section>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
      {Array.from({ length: 16 }).map((_, i) => (
        <div key={i}>
          <div className="aspect-[2/3] rounded-lg bg-chip animate-pulse" />
          <div className="h-3 mt-2 rounded bg-chip animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function ChipButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className={cn(
        'px-2.5 py-1 rounded-full text-xs transition-colors',
        active ? 'bg-accent text-on-accent' : 'bg-chip text-muted hover:text-content hover:bg-hover'
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function TypeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className={cn('px-3.5 py-1.5 rounded-md text-sm transition-colors', active ? 'bg-accent text-on-accent' : 'text-muted hover:text-content')}
      onClick={onClick}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}
