'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client-api';
import type { SourceConfig, SearchResultItem } from '@/lib/types';
import { buildWatchUrl, cn } from '@/lib/utils';
import { useAppStore, resolveSource } from '@/lib/store';
import { qualityKey, qualityLabel } from '@/lib/quality';
import { useToast } from './toast';
import { Icon } from './icon';
import { SmartImage } from './smart-image';
import { EmptyState, LoadingState } from './states';
import { useFocusTrap } from './use-focus-trap';
import { QualityBadge } from './quality-badge';
import { useQualityProbe } from './use-quality-probe';

/**
 * 换源面板：跨源按标题搜索 → 匹配同名/同前缀资源 → 并发测速（详情接口耗时）→ 按速度排序展示。
 * 切换时保留当前集数索引（旧版 switchToResource 逻辑的去 DOM 化重写）。
 */

interface Candidate {
  source: SourceConfig;
  result: SearchResultItem;
  ms?: number;
  ok?: boolean;
  episodes?: number;
  /** 测速失败原因：失败源点开后至少能知道是超时、还是源站直接拒绝 */
  error?: string;
}

/** 候选条目的稳定标识：选中态必须绑它，绑数组下标会在测速结果重排后指错源 */
const candidateKey = (c: Candidate) => `${c.source.key}_${c.result.vodId}`;

const isCurrentCandidate = (c: Candidate, sourceKey: string, vodId: string) =>
  c.source.key === sourceKey && String(c.result.vodId) === String(vodId);

export function SwitchSourceModal({
  currentTitle,
  currentSourceKey,
  currentVodId,
  currentIndex,
  onClose,
}: {
  currentTitle: string;
  currentSourceKey: string;
  currentVodId: string;
  currentIndex: number;
  onClose: () => void;
}) {
  const store = useAppStore();
  const router = useRouter();
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [phase, setPhase] = useState<'searching' | 'testing' | 'done'>('searching');
  /** 封面加载失败记录（按卡片 key）；失败后降级为占位图标，避免破图 */
  const [imgFailed, setImgFailed] = useState<Record<string, boolean>>({});
  /** 当前选中的候选：存稳定 key 而不是下标，测速重排后仍然指向同一个源 */
  const [selectedKey, setSelectedKey] = useState('');
  /** 正在单独重测的候选 key：失败源给一次重试机会，失败原因不能只是死路 */
  const [retestingKey, setRetestingKey] = useState('');
  /** 重测的在途请求：换片重搜/关闭面板时中止，避免卸载后 setState */
  const retestAbortRef = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);
  /** Tab 栏左右是否还有内容：没有渐隐提示，用户不知道右边还藏着源 */
  const [tabEdges, setTabEdges] = useState({ left: false, right: false });

  // 打开时把焦点移入弹窗、Tab 圈闭在弹窗内、关闭后归还焦点
  useFocusTrap(true, panelRef);

  const sources = useMemo(() => {
    // selectedKeys 可能含历史残留的重复 key：按 key 去重，避免同源重复搜索/测速与 React key 撞车
    const seen = new Set<string>();
    return store.selectedKeys
      .map((key) => resolveSource(store, key))
      .filter((s): s is SourceConfig => {
        if (!s || seen.has(s.key)) return false;
        seen.add(s.key);
        return true;
      });
  }, [store]);

  useEffect(() => {
    // 弹窗打开期间锁定背景滚动；Esc 关闭（与其它弹窗一致）
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  useEffect(() => {
    // 关闭弹窗时中止在途请求：否则 N 个源的搜索 + N 个详情测速会继续占用网络与后端
    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      // 1) 并行搜索所有选中源
      setPhase('searching');
      try {
        const { list } = await api.search(currentTitle, sources, store.yellowFilter, { signal: controller.signal });
        if (cancelled) return;

        // 匹配口径：优先完全同名，其次名称以标题开头（兼容「小偷 HD」「小偷[电影解说]」这类修饰名）。
        // 都没有则不展示该源——不再兜底取搜索第一条，避免把搜到的其他影片（如搜「小偷」
        // 命中的《宝贝 小偷与大盗》）误当成换源目标。
        const title = currentTitle.trim();
        const matched: Candidate[] = [];
        for (const s of sources) {
          const hits = list.filter((r) => r.sourceKey === s.key);
          const exact =
            hits.find((r) => (r.name || '').trim() === title) ??
            hits.find((r) => (r.name || '').trim().startsWith(title));
          if (exact) matched.push({ source: s, result: exact });
        }

        // 2) 并发测速（详情接口耗时）并获取集数
        setPhase('testing');
        await Promise.all(
          matched.map(async (c) => {
            const r = await api.detailSpeed(c.result.vodId, c.source, controller.signal);
            if (cancelled) return;
            c.ok = r.ok;
            c.ms = r.ms;
            c.episodes = r.detail?.episodes.length ?? 0;
            c.error = r.ok ? undefined : r.error;
          })
        );
        if (cancelled) return;
        setCandidates(matched);
        setPhase('done');
      } catch (err) {
        // 主动中止不算失败，不提示
        const aborted = err instanceof DOMException && err.name === 'AbortError';
        if (!cancelled && !aborted) {
          toast(err instanceof Error ? err.message : 'Switch source search failed', 'error');
          setPhase('done');
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      retestAbortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTitle, store.yellowFilter]);

  const { qualities, probing, progress, probe, retry } = useQualityProbe(sources);

  useEffect(() => {
    if (phase !== 'done') return;
    const targets = candidates.filter((c) => c.ok).map((c) => c.result);
    if (targets.length > 0) probe(targets);
  }, [phase, candidates, probe]);

  const sorted = useMemo(() => [...candidates].sort((a, b) => {
    const aCurrent = isCurrentCandidate(a, currentSourceKey, currentVodId);
    const bCurrent = isCurrentCandidate(b, currentSourceKey, currentVodId);
    if (aCurrent !== bCurrent) return aCurrent ? -1 : 1;
    const msA = a.ok ? a.ms ?? 99_999 : 99_999;
    const msB = b.ok ? b.ms ?? 99_999 : 99_999;
    return msA - msB;
  }), [candidates, currentSourceKey, currentVodId]);

  const selected =
    sorted.find((c) => candidateKey(c) === selectedKey) ??
    sorted.find((c) => !isCurrentCandidate(c, currentSourceKey, currentVodId) && c.ok) ??
    sorted[0];
  const selectedCandidateKey = selected ? candidateKey(selected) : '';

  useEffect(() => {
    const el = tabBarRef.current;
    if (!el) return;
    const update = () =>
      setTabEdges({
        left: el.scrollLeft > 4,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
      });
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [sorted.length]);

  useEffect(() => {
    const bar = tabBarRef.current;
    if (!bar) return;
    const active = bar.querySelector<HTMLElement>('[data-active="true"]');
    if (!active) return;
    bar.scrollTo({ left: active.offsetLeft - (bar.clientWidth - active.clientWidth) / 2, behavior: 'smooth' });
  }, [selectedCandidateKey]);

  const retest = async (c: Candidate) => {
    const key = candidateKey(c);
    setRetestingKey(key);
    retestAbortRef.current?.abort();
    const controller = new AbortController();
    retestAbortRef.current = controller;
    try {
      const r = await api.detailSpeed(c.result.vodId, c.source, controller.signal);
      if (controller.signal.aborted) return;
      setCandidates((prev) =>
        prev.map((x) =>
          candidateKey(x) === key
            ? { ...x, ok: r.ok, ms: r.ms, episodes: r.detail?.episodes.length ?? 0, error: r.ok ? undefined : r.error }
            : x
        )
      );
      if (r.ok) retry([c.result]);
    } finally {
      if (retestAbortRef.current === controller) {
        retestAbortRef.current = null;
        setRetestingKey('');
      }
    }
  };

  const switchTo = (c: Candidate) => {
    if (!c.episodes) {
      toast('No available episodes for this source', 'warning');
      return;
    }
    const targetIndex = currentIndex < c.episodes ? currentIndex : 0;
    onClose();
    router.push(
      buildWatchUrl({
        sourceKey: c.source.key,
        vodId: c.result.vodId,
        index: targetIndex,
        title: c.result.name || currentTitle,
        sourceUrl: c.source.url,
        detail: c.source.detail,
      })
    );
  };

  return (
    <div
      className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center bg-black/80 sm:py-10 sm:px-4 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="bg-surface-raised rounded-t-2xl sm:rounded-xl w-full max-w-3xl shadow-2xl p-5 pb-[calc(1.25rem_+_env(safe-area-inset-bottom))] sm:pb-5 max-h-[92vh] sm:max-h-[85vh] flex flex-col overflow-hidden animate-slide-up outline-none"
        role="dialog"
        aria-modal="true"
        aria-label={`Switch Source: ${currentTitle}`}
      >
        <div className="sm:hidden mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-line" aria-hidden />
        <div className="shrink-0 mb-4 flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-content truncate" title={currentTitle}>
              {currentTitle}
            </h2>
            <p className="text-xs text-faint">
              {phase === 'searching'
                ? 'Searching sources...'
                : phase === 'testing'
                  ? 'Testing speed...'
                  : `${sorted.length} sources · ${sorted.filter((c) => c.ok).length} available`}
            </p>
            {phase === 'done' && progress.total > 0 && (
              <p className="text-xs text-faint tabular-nums mt-0.5">
                {progress.done < progress.total
                  ? `Probing quality ${progress.done}/${progress.total}`
                  : progress.known > 0
                    ? `Quality detected ${progress.known}/${progress.total}`
                    : 'No quality info available'}
              </p>
            )}
          </div>
          <button className="p-1.5 rounded-md text-muted hover:text-content hover:bg-hover" onClick={onClose} aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
        {phase !== 'done' ? (
          <LoadingState label={phase === 'searching' ? 'Searching sources...' : 'Testing speeds...'} />
        ) : sorted.length === 0 ? (
          <EmptyState variant="plain" title="No matching titles found in other sources" />
        ) : (
          <>
            <div className="relative">
              <div
                ref={tabBarRef}
                className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin"
                role="tablist"
                aria-label="Select playback source"
              >
                {sorted.map((c) => {
                  const isCurrent = isCurrentCandidate(c, currentSourceKey, currentVodId);
                  const key = candidateKey(c);
                  const active = selected === c;
                  const qLabel = qualityLabel(qualities[qualityKey(c.source.key, c.result.vodId)]?.height);
                  return (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      data-active={active}
                      aria-selected={active}
                      className={cn(
                        'shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
                        active ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-chip text-muted hover:bg-hover'
                      )}
                      onClick={() => setSelectedKey(key)}
                    >
                      <span className="max-w-[8rem] truncate font-medium">{c.source.name}</span>
                      {isCurrent && <span className="text-[10px] opacity-80">Current</span>}
                      {qLabel && <span className="text-[10px] tabular-nums opacity-70">{qLabel}</span>}
                      {c.ok ? (
                        <span
                          className={cn(
                            'w-1.5 h-1.5 rounded-full shrink-0',
                            (c.ms ?? 0) > 2000 ? 'bg-warning-solid' : 'bg-success-solid'
                          )}
                          title={`${c.ms}ms`}
                        />
                      ) : (
                        <span className="text-[10px] text-danger">Failed</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {tabEdges.left && (
                <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-surface-raised to-transparent" />
              )}
              {tabEdges.right && (
                <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-surface-raised to-transparent" />
              )}
            </div>

            {selected && (() => {
              const c = selected;
              const isCurrent = isCurrentCandidate(c, currentSourceKey, currentVodId);
              const key = candidateKey(c);
              const coverFailed = imgFailed[key] ?? false;
              const qKey = qualityKey(c.source.key, c.result.vodId);
              return (
                <div className="mt-3 flex items-start gap-3 p-3 bg-card rounded-lg">
                  <div className="shrink-0 w-20 aspect-[2/3] rounded-md overflow-hidden bg-chip">
                    {c.result.pic && !coverFailed ? (
                      <SmartImage
                        url={c.result.pic}
                        mode={store.imageProxyMode}
                        customProxy={store.customImageProxy}
                        alt={c.result.name}
                        className="w-full h-full object-cover"
                        onExhausted={() => setImgFailed((prev) => ({ ...prev, [key]: true }))}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-faint">
                        <Icon name="link" className="w-5 h-5" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <h3 className="text-sm font-semibold text-content truncate" title={c.source.name}>
                        {c.source.name}
                      </h3>
                      <QualityBadge entry={qualities[qKey]} loading={probing[qKey]} onRetry={() => retry([c.result])} />
                      {isCurrent && (
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent">Playing</span>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:max-w-[16rem]">
                      <div className="rounded-md bg-chip px-2 py-1.5">
                        <div className="text-[10px] text-faint">Speed</div>
                        <div
                          className={cn(
                            'text-xs font-medium tabular-nums',
                            !c.ok ? 'text-danger' : (c.ms ?? 0) > 2000 ? 'text-warning' : 'text-success'
                          )}
                        >
                          {c.ok ? `${c.ms}ms` : 'Unavailable'}
                        </div>
                      </div>
                      <div className="rounded-md bg-chip px-2 py-1.5">
                        <div className="text-[10px] text-faint">Episodes</div>
                        <div className="text-xs font-medium text-content">
                          {c.episodes ? `${c.episodes} Ep` : 'None'}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      {isCurrent ? (
                        <span className="text-xs text-accent">Currently playing</span>
                      ) : (
                        <>
                          <button type="button" className="btn-primary btn-sm" disabled={!c.episodes} onClick={() => switchTo(c)}>
                            Switch to this Source
                          </button>
                          {!c.ok && !!c.episodes && <span className="text-xs text-warning">Speed test failed, but can still try playing</span>}
                        </>
                      )}
                      {!c.ok && (
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          disabled={retestingKey === key}
                          onClick={() => void retest(c)}
                        >
                          {retestingKey === key ? 'Retesting...' : 'Retest Speed'}
                        </button>
                      )}
                    </div>
                    {!c.ok && c.error && (
                      <p className="mt-1 text-[11px] text-faint line-clamp-1" title={c.error}>
                        {c.error}
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}
          </>
        )}
        </div>
      </div>
    </div>
  );
}
