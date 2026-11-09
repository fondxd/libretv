'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/header';
import { RecommendSection } from '@/components/douban-section';
import { DetailModal } from '@/components/detail-modal';
import { AggregatedCard, aggregateResults } from '@/components/video-card';
import { useAppStore, resolveSource, isInDisabledSubscription, isSourceDisabled } from '@/lib/store';
import { api } from '@/lib/client-api';
import type { SearchResultItem, SourceSearchOutcome } from '@/lib/types';
import { SearchHistoryDropdown, useSearchHistory } from '@/components/search-history';
import { cn, formatDisableTtl, validateSourceUrl } from '@/lib/utils';
import { useToast } from '@/components/toast';
import { EmptyState } from '@/components/states';
import { Icon } from '@/components/icon';
import { SiteFooter } from '@/components/site-footer';
import { Pagination } from '@/components/pagination';

/**
 * 首页：搜索（URL ?s= 驱动，可后退/分享）+ 豆瓣推荐。
 * 搜索状态由 React Query 管理，失败源在结果区顶部以非阻塞方式展示。
 */
const DEFAULT_PAGE_SIZE = 36;
type SearchSortMode = 'default' | 'date_desc' | 'year_desc' | 'year_asc' | 'name_asc' | 'name_desc' | 'sources_desc';

export default function HomePage() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const urlQuery = searchParams.get('s') || '';
  const urlPage = parseInt(searchParams.get('p') || '1', 10);
  const currentPage = Math.max(1, isNaN(urlPage) ? 1 : urlPage);
  const resultsRef = useRef<HTMLElement>(null);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [sortBy, setSortBy] = useState<SearchSortMode>('default');
  const [selectedYear, setSelectedYear] = useState<string>('all');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('libretv_page_size');
      if (saved) {
        const n = parseInt(saved, 10);
        if (n > 0) setPageSize(n);
      }
    } catch {}
  }, []);

  // 精确订阅所需字段（对齐 live 页的做法）：搜索流式期间逐源写健康度、
  // 打开设置抽屉/历史面板等无关 store 变化，都不应触发首页整树重渲染
  const customAPIs = useAppStore((s) => s.customAPIs);
  const envSources = useAppStore((s) => s.envSources);
  const selectedKeys = useAppStore((s) => s.selectedKeys);
  const yellowFilter = useAppStore((s) => s.yellowFilter);
  const sourceHealth = useAppStore((s) => s.sourceHealth);
  const subscriptions = useAppStore((s) => s.subscriptions);
  const [input, setInput] = useState(urlQuery);
  const [detailItem, setDetailItem] = useState<SearchResultItem | null>(null);
  /** 流式搜索中已结算的源（data 就绪前用于增量渲染） */
  const [streamedOutcomes, setStreamedOutcomes] = useState<SourceSearchOutcome[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // URL 驱动搜索：?s= 变化时回填输入框
  useEffect(() => {
    if (urlQuery) setInput(urlQuery);
  }, [urlQuery]);

  // 源名回显：失败/停用提示里显示友好名称而非裸 key
  const sourceName = (key: string) =>
    customAPIs.find((a) => a.key === key)?.name ??
    envSources.find((a) => a.key === key)?.name ??
    key;

  const selectedSources = useMemo(() => {
    // selectedKeys 可能含历史残留的重复 key：按 key 去重，避免同源重复搜索
    const seen = new Set<string>();
    return selectedKeys
      .map((key) => resolveSource({ customAPIs, envSources }, key))
      .filter((s): s is NonNullable<typeof s> => {
        if (!s || !validateSourceUrl(s.url) || seen.has(s.key)) return false;
        seen.add(s.key);
        return true;
      })
      // 自动停用期内的源不参与搜索（到期自动恢复）
      .filter((s) => !isSourceDisabled({ sourceHealth }, s.key))
      // 所属订阅被整体停用的源同样跳过（无损：各源勾选状态保留，重新启用即恢复）
      .filter((s) => !isInDisabledSubscription({ subscriptions }, s.key));
  }, [customAPIs, envSources, selectedKeys, sourceHealth, subscriptions]);
  const disabledSources = useMemo(
    () => selectedKeys.filter((key) => isSourceDisabled({ sourceHealth }, key)),
    [selectedKeys, sourceHealth]
  );
  // 来自已关闭订阅的源：勾选状态还在，但本次搜索用不到，必须明确告知
  const offSubscriptionSources = useMemo(
    () =>
      selectedKeys.filter(
        (key) => !isSourceDisabled({ sourceHealth }, key) && isInDisabledSubscription({ subscriptions }, key)
      ),
    [selectedKeys, sourceHealth, subscriptions]
  );

  const searchQuery = useQuery({
    queryKey: ['search', urlQuery, selectedKeys, yellowFilter],
    // 与 runSearch 的截断规则保持一致：顶栏搜索 / 手动构造长链接不会绕过上限
    queryFn: ({ signal }) => {
      setStreamedOutcomes([]);
      return api.search(urlQuery.slice(0, 100), selectedSources, yellowFilter, {
        signal,
        // 逐源结算即更新：结果边搜边渲染，同时滚动健康度
        onSource: (outcome) => {
          setStreamedOutcomes((prev) => [...prev, outcome]);
          for (const ev of useAppStore.getState().recordSourceHealth([outcome])) {
            toast(
              ev.permanent
                ? `"${sourceName(ev.key)}" failed multiple times and has been paused. You can re-enable it in Settings.`
                : `"${sourceName(ev.key)}" consecutive timeouts/failures, paused for ${formatDisableTtl(ev.ttlMs ?? 0)}`,
              'warning'
            );
          }
        },
      });
    },
    enabled: Boolean(urlQuery) && selectedSources.length > 0,
    staleTime: 300_000,
  });

  const searchHistory = useSearchHistory(input);

  const runSearch = (q: string) => {
    const query = q.trim().slice(0, 100);
    if (!query) {
      toast('Please enter a search term', 'info');
      inputRef.current?.focus();
      return;
    }
    if (selectedSources.length === 0) {
      toast('Please add and enable at least one video source in Settings', 'warning');
      return;
    }
    setSelectedYear('all');
    router.push(`/?s=${encodeURIComponent(query)}&p=1`, { scroll: false });
    searchHistory.record(query);
  };

  const pickHistory = (text: string) => {
    setInput(text);
    searchHistory.close();
    runSearch(text);
  };

  const isSearching = Boolean(urlQuery) && searchQuery.isFetching && !searchQuery.data;
  // 聚合数据未就绪时，用已结算源的结果增量渲染（健康源不再等坏源超时）
  const streamedList = useMemo(
    () => streamedOutcomes.flatMap((o) => o.list),
    [streamedOutcomes]
  );
  const list = useMemo(
    () => searchQuery.data?.list ?? (isSearching ? streamedList : []),
    [searchQuery.data, isSearching, streamedList]
  );
  const failures =
    searchQuery.data?.failures ??
    streamedOutcomes
      .filter((o) => !o.ok)
      .map((o) => ({ sourceKey: o.sourceKey, error: o.error || 'Request failed', timedOut: o.timedOut }));
  // 跨源同名聚合：同名影片合并为一张卡片，展开后可选择具体来源
  const rawGroups = useMemo(() => aggregateResults(list), [list]);

  // 可供筛选的上映年份列表（从搜索结果中动态提取并去重排序）
  const availableYears = useMemo(() => {
    const set = new Set<string>();
    for (const g of rawGroups) {
      if (g.year && /^\d{4}$/.test(g.year.trim())) {
        set.add(g.year.trim());
      }
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [rawGroups]);

  // 各年份影片计数
  const yearCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const g of rawGroups) {
      if (g.year && /^\d{4}$/.test(g.year.trim())) {
        const y = g.year.trim();
        counts[y] = (counts[y] || 0) + 1;
      }
    }
    return counts;
  }, [rawGroups]);

  // 按所选年份筛选
  const filteredByYear = useMemo(() => {
    if (selectedYear === 'all') return rawGroups;
    return rawGroups.filter((g) => g.year === selectedYear);
  }, [rawGroups, selectedYear]);

  // 排序：默认、最新添加/更新时间、最新年份、最早年份、剧名A-Z、最多资源数
  const groups = useMemo(() => {
    if (sortBy === 'default') return filteredByYear;
    const copy = [...filteredByYear];
    switch (sortBy) {
      case 'date_desc':
        return copy.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      case 'year_desc':
        return copy.sort((a, b) => {
          const ya = parseInt(a.year || '0', 10) || 0;
          const yb = parseInt(b.year || '0', 10) || 0;
          return yb - ya;
        });
      case 'year_asc':
        return copy.sort((a, b) => {
          const ya = parseInt(a.year || '9999', 10) || 9999;
          const yb = parseInt(b.year || '9999', 10) || 9999;
          return ya - yb;
        });
      case 'name_asc':
        return copy.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      case 'name_desc':
        return copy.sort((a, b) => b.name.localeCompare(a.name, undefined, { sensitivity: 'base' }));
      case 'sources_desc':
        return copy.sort((a, b) => b.items.length - a.items.length);
      default:
        return copy;
    }
  }, [filteredByYear, sortBy]);

  const totalPages = Math.max(1, Math.ceil(groups.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  const pagedGroups = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return groups.slice(start, start + pageSize);
  }, [groups, safePage, pageSize]);

  const handlePageChange = (newPage: number) => {
    router.push(`/?s=${encodeURIComponent(urlQuery)}&p=${newPage}`, { scroll: false });
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    try {
      localStorage.setItem('libretv_page_size', String(newSize));
    } catch {}
    router.push(`/?s=${encodeURIComponent(urlQuery)}&p=1`, { scroll: false });
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="relative flex-1 max-w-6xl w-full mx-auto px-4 py-6">
        {/* 首屏氛围渐变 */}
        {!urlQuery && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[420px] -z-10"
            style={{
              background:
                'radial-gradient(60% 60% at 50% 0%, rgba(35,173,229,0.10) 0%, rgba(35,173,229,0.03) 45%, transparent 75%)',
            }}
          />
        )}

        {/* 搜索区 */}
        <section className={cn('flex flex-col items-center', urlQuery ? 'mb-6' : 'mt-8 mb-8')}>
          {!urlQuery && (
            <header className="text-center mb-6">
              <h1 className="text-4xl sm:text-5xl font-bold brand-gradient">LibreTV</h1>
            </header>
          )}
          {urlQuery && <h1 className="sr-only">LibreTV Video Search</h1>}
          {/* 定位容器比胶囊宽一圈：浮层按它的宽度对齐，接缝处不会与胶囊边框错位 1px */}
          <div ref={searchHistory.containerRef} className="relative w-full max-w-2xl">
            <form
              className="w-full"
              onSubmit={(e) => {
                e.preventDefault();
                runSearch(input);
              }}
            >
              {/* 输入框与搜索按钮合并为一个胶囊：内部无边框，焦点态由容器统一表达；
                  下拉展开时改为「上圆下直」并隐去底边，与下方浮层拼成同一个面板 */}
              <div
                className={cn(
                  // 12px 圆角矩形（非胶囊）：收起态与展开态共用同一组上圆角，
                  // 展开时输入框这部分形状完全不发生变化，上下圆角也与下拉保持一致；
                  // 右侧与上下不留内边距，由搜索按钮拉伸填满、与搜索框边缘贴合
                  'flex items-stretch min-h-12 pl-4 border',
                  'transition-[background-color,border-color,border-radius] duration-200',
                  searchHistory.visible
                    ? // 展开时：外框（含上圆角）沿用输入框的聚焦样式不变，只把底边改为内部分隔线，
                      // 使输入区在展开状态下仍是边界清晰的独立输入框，而非与列表糊成一片
                      'rounded-t-xl rounded-b-none border-accent border-b-line bg-surface-raised'
                    : 'rounded-xl border-line bg-chip focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/40'
                )}
              >
                <input
                  ref={inputRef}
                  className="flex-1 min-w-0 pr-2 bg-transparent text-sm text-content placeholder:text-faint focus:outline-none"
                  placeholder="Search movies, TV shows, anime..."
                  value={input}
                  maxLength={100}
                  onChange={(e) => {
                    setInput(e.target.value);
                    searchHistory.resetActive();
                  }}
                  onFocus={searchHistory.onFocus}
                  onKeyDown={(e) => searchHistory.onKeyDown(e, pickHistory)}
                  role="combobox"
                  aria-label="Search movies, TV shows..."
                  aria-expanded={searchHistory.visible}
                  aria-controls="home-search-history"
                  aria-autocomplete="list"
                  aria-activedescendant={
                    searchHistory.visible && searchHistory.activeIndex >= 0
                      ? `home-search-history-${searchHistory.activeIndex}`
                      : undefined
                  }
                />
                {input && (
                  <button
                    type="button"
                    className="shrink-0 self-center mr-1 p-1.5 rounded-full text-faint hover:text-content hover:bg-hover transition-colors"
                    onClick={() => {
                      setInput('');
                      searchHistory.resetActive();
                      inputRef.current?.focus();
                    }}
                    aria-label="Clear"
                  >
                    <Icon name="close" className="w-4 h-4" />
                  </button>
                )}
                {/* 主操作按钮：贴合搜索框右端——右侧圆角跟随容器、左侧直角，展开时右下角
                    跟着容器一起改直角；按压改用亮度反馈（缩放会让贴合边缘露出缝隙） */}
                <button
                  type="submit"
                  className={cn(
                    'btn-primary shrink-0 px-4 font-medium transition-[background-color,filter] active:brightness-90',
                    '!rounded-l-none',
                    searchHistory.visible ? '!rounded-tr-xl !rounded-br-none' : '!rounded-r-xl'
                  )}
                >
                  <Icon name="search" className="w-4 h-4" />
                  Search
                </button>
              </div>
            </form>

            {/* 最近搜索：与输入框无缝拼接；浮层不占文档流，出现/消失不会顶动下方内容 */}
            {searchHistory.visible && (
              <SearchHistoryDropdown
                id="home-search-history"
                matches={searchHistory.matches}
                activeIndex={searchHistory.activeIndex}
                onPick={pickHistory}
                onRemove={searchHistory.remove}
                onClearAll={searchHistory.clearAll}
              />
            )}
          </div>
        </section>

        {/* Quick Hub Navigation: Movies, Singapore TV, Live IPTV */}
        <section aria-label="Content Navigation" className="mb-6 flex items-center justify-center gap-2.5 flex-wrap">
          <Link
            href="/"
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-accent text-accent-contrast shadow-sm flex items-center gap-1.5 transition-transform hover:scale-105"
          >
            <span>🎬</span>
            <span>All Movies & Series</span>
          </Link>
          <Link
            href="/singapore"
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-surface-raised hover:bg-hover text-content border border-line flex items-center gap-1.5 transition-all hover:scale-105"
          >
            <span>🇸🇬</span>
            <span>Singapore Live TV & Radio</span>
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse ml-0.5" />
          </Link>
          <Link
            href="/live"
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-surface-raised hover:bg-hover text-content border border-line flex items-center gap-1.5 transition-all hover:scale-105"
          >
            <span>📺</span>
            <span>Global Live IPTV</span>
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse ml-0.5" />
          </Link>
        </section>

        {/* 搜索结果 */}
        {urlQuery && (
          <section ref={resultsRef} aria-label="Search Results" className="mb-10 scroll-mt-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <h2 className="text-sm text-muted">
                Search results for &quot;<span className="text-content font-medium">{urlQuery}</span>&quot;
                {isSearching ? (
                  <span className="text-faint">
                    &nbsp;({streamedOutcomes.length}/{selectedSources.length} sources ready…)
                  </span>
                ) : (
                  searchQuery.data && (
                    <span className="text-faint">
                      &nbsp;({groups.length} titles · {list.length} results{failures.length > 0 && `, ${failures.length} sources failed`})
                    </span>
                  )
                )}
              </h2>
              {groups.length > 0 && (
                <div className="text-xs text-faint flex items-center gap-2">
                  <span>Page <strong className="text-content">{safePage}</strong> of <strong className="text-content">{totalPages}</strong></span>
                  <span className="hidden sm:inline text-line">|</span>
                  <span className="hidden sm:inline">{groups.length} total videos</span>
                </div>
              )}
            </div>

            {/* 年份筛选与排序控制栏 */}
            {rawGroups.length > 0 && (
              <div className="space-y-2 mb-3.5">
                {/* 上映年份筛选栏 */}
                {availableYears.length > 0 && (
                  <div className="flex items-center gap-2 p-2 bg-surface-raised border border-line rounded-xl text-xs overflow-x-auto scrollbar-thin">
                    <div className="flex items-center gap-1.5 text-faint shrink-0 pl-1">
                      <span>📆</span>
                      <span className="font-medium text-muted">Release Year:</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedYear('all');
                          handlePageChange(1);
                        }}
                        className={cn(
                          'px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors',
                          selectedYear === 'all'
                            ? 'bg-accent text-accent-contrast shadow-sm'
                            : 'bg-chip text-muted hover:text-content hover:bg-hover'
                        )}
                      >
                        All Years ({rawGroups.length})
                      </button>
                      {availableYears.map((yr) => {
                        const count = yearCounts[yr] || 0;
                        return (
                          <button
                            key={yr}
                            type="button"
                            onClick={() => {
                              setSelectedYear(yr);
                              handlePageChange(1);
                            }}
                            className={cn(
                              'px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors',
                              selectedYear === yr
                                ? 'bg-accent text-accent-contrast shadow-sm'
                                : 'bg-chip text-muted hover:text-content hover:bg-hover'
                            )}
                          >
                            {yr} <span className="opacity-75 text-[10px]">({count})</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 结果排序栏 */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 p-2 bg-surface-raised border border-line rounded-xl">
                  <div className="flex items-center gap-1.5 text-xs text-faint">
                    <span>↕️</span>
                    <span className="font-medium text-muted">Sort By:</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      { id: 'default', label: 'Default' },
                      { id: 'date_desc', label: '🕒 Date Added' },
                      { id: 'year_desc', label: '📅 Newest Year' },
                      { id: 'year_asc', label: '⏳ Oldest Year' },
                      { id: 'name_asc', label: '🔤 Title A-Z' },
                      { id: 'sources_desc', label: '⚡ Most Sources' },
                    ].map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setSortBy(s.id as SearchSortMode);
                          handlePageChange(1);
                        }}
                        className={cn(
                          'px-2.5 py-1 text-xs rounded-lg font-medium transition-colors',
                          sortBy === s.id
                            ? 'bg-accent text-accent-contrast shadow-sm'
                            : 'bg-chip text-muted hover:text-content hover:bg-hover'
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {failures.length > 0 && (
              <div className="mb-3 text-xs bg-chip rounded-lg px-3 py-2 flex flex-wrap gap-x-3 gap-y-1">
                <span className="text-faint">{isSearching ? 'Unresponsive sources:' : 'Sources that failed:'}</span>
                {failures.map((f) => (
                  <span key={f.sourceKey} className={f.timedOut ? 'text-warning' : 'text-faint'}>
                    {f.timedOut ? '⏱' : '✗'} {sourceName(f.sourceKey)}
                    {f.timedOut ? ' Timeout' : ''}
                  </span>
                ))}
              </div>
            )}

            {disabledSources.length > 0 && (
              <div className="mb-3 text-xs text-faint bg-chip rounded-lg px-3 py-2">
                {disabledSources.length} source(s) paused due to consecutive timeouts/failures (temporary pauses auto-recover; permanent pauses require manual restore in Settings): {disabledSources.map((key) => sourceName(key)).join(', ')}
              </div>
            )}

            {offSubscriptionSources.length > 0 && (
              <div className="mb-3 text-xs text-faint bg-chip rounded-lg px-3 py-2">
                {offSubscriptionSources.length} source(s) belong to disabled subscriptions and were omitted (re-enable in Settings → Subscriptions): {offSubscriptionSources.map((key) => sourceName(key)).join(', ')}
              </div>
            )}

            {selectedSources.length === 0 ? (
              <NoSourceGuide hasSources={customAPIs.length > 0 || envSources.length > 0} />
            ) : list.length > 0 ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 items-start">
                  {pagedGroups.map((group) => (
                    <AggregatedCard
                      key={group.key}
                      group={group}
                      sources={selectedSources}
                      onOpen={(item) => setDetailItem(item)}
                    />
                  ))}
                </div>
                <Pagination
                  currentPage={safePage}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  totalItems={groups.length}
                  pageSizeOptions={[24, 36, 48, 60, 96]}
                  onPageChange={handlePageChange}
                  onPageSizeChange={handlePageSizeChange}
                  className="mt-6 border-t border-line"
                />
              </>
            ) : isSearching ? (
              <ResultsSkeleton />
            ) : (
              <EmptyState
                icon="search"
                title="No Results Found"
                description="Please try other keywords or check your video sources"
                className="!py-16"
              />
            )}
          </section>
        )}

        {/* 首页推荐（有搜索时隐藏） */}
        {!urlQuery && (
          <RecommendSection
            onPick={(title) => {
              setInput(title);
              runSearch(title);
            }}
          />
        )}
      </main>

      <SiteFooter />

      <DetailModal item={detailItem} onClose={() => setDetailItem(null)} />
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        // 结构对齐真实结果卡（左侧缩略图 + 右侧文字块），避免占位与真实卡片形状不符
        <div key={i} className="card flex h-28 overflow-hidden">
          <div className="w-[105px] sm:w-[120px] shrink-0 bg-chip animate-pulse" />
          <div className="flex-1 p-2.5 space-y-2">
            <div className="h-4 w-3/4 rounded bg-chip animate-pulse" />
            <div className="h-3 w-1/2 rounded bg-chip animate-pulse" />
            <div className="h-3 w-full rounded bg-chip animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 无点播源 / 未勾选点播源时的引导（替代旧版首屏静默空白） */
function NoSourceGuide({ hasSources = false }: { hasSources?: boolean }) {
  return (
    <div className="border border-dashed border-line rounded-xl p-10 text-center max-w-lg mx-auto">
      <h3 className="text-content font-medium mb-2">{hasSources ? 'No Sources Selected' : 'Add a Video Source to Begin'}</h3>
      <p className="text-sm text-muted leading-relaxed">
        {hasSources ? (
          <>Click 'Settings' at the top right, enable your video sources, and search again.</>
        ) : (
          <>
            Click 'Settings' at the top right, go to 'Source Management', and enable video sources or subscriptions.
          </>
        )}
      </p>
    </div>
  );
}
