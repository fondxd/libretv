'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Drawer } from './drawer';
import { ConfirmDialog } from './confirm-dialog';
import { Dropdown, type DropdownOption } from './dropdown';
import { Icon, type IconName } from './icon';
import { LiveSourceManager } from './live-source-manager';
import {
  HealthBadge,
  SearchInput,
  SectionTitle,
  SelectRow,
  TestBadge,
  ToggleRow,
  Switch,
  useSourceTests,
  type TestState,
} from './settings-shared';
import { loadCacheSettings, saveCacheSettings, getCacheSummary, clearVideoCache, type CacheSummary } from '@/lib/video-cache';
import { EmptyState, Spinner } from './states';
import { useSourceProbe } from './use-source-probe';
import { allLiveSources, isSourceDisabled, keyBelongsToSubscription, resolveSource, subKeyPrefix, useAppStore } from '@/lib/store';
import type { SourceConfig } from '@/lib/types';
import { useToast } from './toast';
import { formatRelativeTime, hostnameOf, validateSourceUrl, cn } from '@/lib/utils';
import { exportConfig, importConfig } from '@/lib/db';
import { PERSIST_KEY } from '@/lib/persist-storage';
import { copyToClipboard } from '@/lib/clipboard';
import { useAuth } from './auth';
import { api } from '@/lib/client-api';
import { AUTO_REFRESH_MAX_FAIL_STREAK, syncSourceSubscription } from '@/lib/subscription-sync';
import { describeParseStats } from '@/lib/tvbox-parser';

/**
 * 设置抽屉：顶部两级导航。
 * - 一级按性质分组：源管理 / 偏好设置 / 数据；
 * - 二级为该分组下的具体面板，每次只渲染一类内容，避免源很多时长距离滚动。
 * 选中位置记忆到 localStorage，再次打开回到上次所在面板。
 */

type PrimaryTab = 'sources' | 'prefs' | 'data';
type SecondaryTab = 'vod' | 'live' | 'subs' | 'playback' | 'image' | 'home' | 'io';

const PRIMARY_TABS: { id: PrimaryTab; label: string; icon: IconName }[] = [
  { id: 'sources', label: 'Sources', icon: 'link' },
  { id: 'prefs', label: 'Preferences', icon: 'gear' },
  { id: 'data', label: 'Data', icon: 'download' },
];

const SECONDARY_TABS: Record<PrimaryTab, { id: SecondaryTab; label: string }[]> = {
  sources: [
    { id: 'vod', label: 'Video APIs' },
    { id: 'live', label: 'Live Streams' },
    { id: 'subs', label: 'Subscriptions' },
  ],
  prefs: [
    { id: 'playback', label: 'Playback & Filter' },
    { id: 'image', label: 'Image Loading' },
    { id: 'home', label: 'Home & Content' },
  ],
  data: [{ id: 'io', label: 'Import / Export' }],
};

const TAB_STORAGE_KEY = 'libretv-settings-tab';

export function SourceManagerDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [primary, setPrimary] = useState<PrimaryTab>('sources');
  const [secondary, setSecondary] = useState<Record<PrimaryTab, SecondaryTab>>({
    sources: 'vod',
    prefs: 'playback',
    data: 'io',
  });

  // 挂载后读取上次位置（不在渲染期读 localStorage，避免 SSR/hydration 不一致）
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TAB_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        primary?: PrimaryTab;
        secondary?: Partial<Record<PrimaryTab, SecondaryTab>>;
      };
      // 旧版把「数据源订阅」放在「数据」下，现已迁至「源管理」：自动重定向到新位置
      const migratedSubs = saved.secondary?.data === 'subs';
      const targetPrimary = migratedSubs && saved.primary === 'data' ? 'sources' : saved.primary;
      if (targetPrimary && SECONDARY_TABS[targetPrimary]) setPrimary(targetPrimary);
      setSecondary((prev) => {
        const next = { ...prev };
        if (migratedSubs) next.sources = 'subs';
        for (const key of Object.keys(SECONDARY_TABS) as PrimaryTab[]) {
          const v = saved.secondary?.[key];
          if (v && SECONDARY_TABS[key].some((t) => t.id === v)) next[key] = v;
        }
        return next;
      });
    } catch {
      /* 本地记录损坏时忽略，回到默认面板 */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(TAB_STORAGE_KEY, JSON.stringify({ primary, secondary }));
    } catch {
      /* 隐私模式等无法写入时忽略 */
    }
  }, [primary, secondary]);

  const current = secondary[primary];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Settings"
      resetScrollKey={current}
      subheader={
        <div className="space-y-2">
          <TabRow tabs={PRIMARY_TABS} value={primary} onChange={setPrimary} variant="primary" ariaLabel="Settings category" />
          {SECONDARY_TABS[primary].length > 1 && (
            <TabRow
              tabs={SECONDARY_TABS[primary]}
              value={current}
              onChange={(id) => setSecondary((prev) => ({ ...prev, [primary]: id }))}
              variant="secondary"
              ariaLabel="Settings tab"
            />
          )}
        </div>
      }
    >
      {current === 'vod' && <VodSourcesPanel />}
      {current === 'live' && <LiveSourceManager />}
      {current === 'playback' && <PlaybackPanel />}
      {current === 'image' && <ImagePanel />}
      {current === 'home' && <HomePanel />}
      {current === 'subs' && <SourceSubscriptions />}
      {current === 'io' && <ConfigIoPanel />}
    </Drawer>
  );
}

/** 一级/二级导航条（role=tablist，左右方向键切换） */
function TabRow<T extends string>({
  tabs,
  value,
  onChange,
  variant,
  ariaLabel,
}: {
  tabs: { id: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (id: T) => void;
  variant: 'primary' | 'secondary';
  ariaLabel: string;
}) {
  const move = (dir: 1 | -1) => {
    const idx = tabs.findIndex((t) => t.id === value);
    onChange(tabs[(idx + dir + tabs.length) % tabs.length].id);
  };
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('flex w-full gap-1', variant === 'primary' && 'p-0.5 bg-chip rounded-lg')}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          move(1);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          move(-1);
        }
      }}
    >
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            className={cn(
              // 两级导航都等宽撑满一行（原先二级按内容宽度、超宽才横滚，与一级不一致）
              'flex-1 min-w-0 inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-md transition-colors',
              variant === 'primary'
                ? cn(
                    'px-2 py-1.5 text-xs',
                    active ? 'bg-surface-raised text-accent font-medium shadow-sm' : 'text-muted hover:text-content'
                  )
                : cn(
                    'px-2.5 py-1 text-xs',
                    active ? 'bg-accent/10 text-accent font-medium' : 'text-muted hover:text-content hover:bg-hover'
                  )
            )}
            onClick={() => onChange(t.id)}
          >
            {t.icon && <Icon name={t.icon} className="w-3.5 h-3.5" />}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// —— 点播源面板 ——

type VodFilter = 'all' | 'enabled' | 'disabled' | 'sub' | 'manual';

// 与直播源面板保持同一组筛选项与顺序：先状态（已启用 / 已停用），后来源（来自订阅 / 手动添加）
const VOD_FILTERS: { id: VodFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'enabled', label: 'Enabled' },
  { id: 'disabled', label: 'Disabled' },
  { id: 'sub', label: 'From Subscription' },
  { id: 'manual', label: 'Manual' },
];

function VodSourcesPanel() {
  const store = useAppStore();
  const { toast } = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<VodFilter>('all');
  const { tests, runTest } = useSourceTests();
  const { progress, probe, cancel, isProbing } = useSourceProbe();

  const envKeys = useMemo(() => new Set(store.envSources.map((s) => s.key)), [store.envSources]);
  const all = useMemo(() => [...store.envSources, ...store.customAPIs], [store.envSources, store.customAPIs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((s) => {
      const fromSub = s.key.startsWith('sub_');
      if (filter === 'enabled' && !(store.selectedKeys.includes(s.key) && !isSourceDisabled(store, s.key))) return false;
      if (filter === 'disabled' && !isSourceDisabled(store, s.key)) return false;
      if (filter === 'sub' && !fromSub) return false;
      if (filter === 'manual' && (fromSub || envKeys.has(s.key))) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || s.url.toLowerCase().includes(q);
    });
  }, [all, query, filter, store, envKeys]);

  const visibleKeys = filtered.map((s) => s.key);
  const allSelected = visibleKeys.length > 0 && visibleKeys.every((k) => store.selectedKeys.includes(k));

  const toggleAll = () => {
    if (allSelected) {
      store.setSelectedKeys(store.selectedKeys.filter((k) => !visibleKeys.includes(k)));
      return;
    }
    const eligible = filtered.filter((s) => !(s.isAdult && store.yellowFilter)).map((s) => s.key);
    const skipped = filtered.length - eligible.length;
    store.setSelectedKeys([...new Set([...store.selectedKeys, ...eligible])]);
    if (skipped > 0) toast(`Enabled ${eligible.length}; skipped ${skipped} adult sources`, 'info');
  };

  const runAll = async () => {
    if (isProbing) {
      cancel();
      return;
    }
    const result = await probe(filtered.map((s) => ({ key: s.key, url: s.url })));
    if (!result) return;
    toast(`Test completed: ${result.ok}/${result.total} available`, result.ok === result.total ? 'success' : 'info');
  };

  const restoreAll = () => {
    const keys = filtered.filter((s) => isSourceDisabled(store, s.key)).map((s) => s.key);
    if (keys.length === 0) return;
    keys.forEach((k) => useAppStore.getState().clearSourceHealth(k));
    toast(`Restored ${keys.length} sources`, 'success');
  };

  const empty = store.envSources.length === 0 && store.customAPIs.length === 0;

  return (
    <section>
      <SectionTitle
        title="Video APIs"
        hint={empty ? undefined : `Total: ${all.length} · Enabled: ${all.filter((s) => store.selectedKeys.includes(s.key)).length}`}
        extra={
          <button className="btn-primary btn-sm" onClick={() => setEditing('__new__')}>
            <Icon name="plus" className="w-3.5 h-3.5" />
            + Add API
          </button>
        }
      />

      <SourceForm
        visible={editing === '__new__'}
        onCancel={() => setEditing(null)}
        onSubmit={(data) => {
          store.addCustomApi(data);
          setEditing(null);
        }}
      />

      {empty && editing !== '__new__' ? (
        <EmptyState
          icon="link"
          title="No Video APIs Added"
          description="Add an Apple CMS API to start searching movies and shows, or import from Subscriptions."
          action={
            <button className="btn-primary btn-sm" onClick={() => setEditing('__new__')}>
              Add First Video API
            </button>
          }
        />
      ) : (
        <>
          <div className="space-y-2 mb-3">
            <SearchInput value={query} onChange={setQuery} placeholder="Search name or URL" />
            <div className="flex flex-wrap items-center gap-1">
              {VOD_FILTERS.map((f) => (
                <button
                  key={f.id}
                  className={cn(
                    'chip',
                    filter === f.id ? 'bg-accent/10 text-accent font-medium' : 'text-muted hover:text-content hover:bg-hover'
                  )}
                  onClick={() => setFilter(f.id)}
                  aria-pressed={filter === f.id}
                >
                  {f.label}
                </button>
              ))}
              <span className="ml-auto text-[11px] text-faint">Showing {filtered.length}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-ghost btn-sm" onClick={toggleAll} disabled={filtered.length === 0}>
                {allSelected ? 'Disable All' : 'Enable All'}
              </button>
              <button
                className="btn-ghost btn-sm"
                onClick={runAll}
                disabled={filtered.length === 0}
              >
                {isProbing ? 'Cancel Test' : 'Test All'}
              </button>
              {filter === 'disabled' && (
                <button className="btn-ghost btn-sm" onClick={restoreAll} disabled={filtered.length === 0}>
                  Restore All
                </button>
              )}
            </div>
            {progress && (
              <div className="flex items-center gap-2 text-[11px] text-muted">
                <div className="flex-1 h-1.5 bg-chip rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent transition-[width] duration-200"
                    style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                  />
                </div>
                <span className="tabular-nums shrink-0">
                  {progress.done}/{progress.total} · Available: {progress.ok}
                  {formatEta(progress.done, progress.total, progress.startedAt)}
                </span>
                <button className="btn-ghost btn-sm shrink-0" onClick={cancel}>
                  Cancel
                </button>
              </div>
            )}
          </div>

          {filtered.length === 0 ? (
            <EmptyState variant="plain" title="No matching sources found" />
          ) : (
            <ul className="space-y-2">
              {filtered.map((source) => (
                <VodSourceRow
                  key={source.key}
                  api={source}
                  isEnv={envKeys.has(source.key)}
                  editing={editing === source.key}
                  onEdit={setEditing}
                  onCancelEdit={() => setEditing(null)}
                  onUpdate={(data) => {
                    store.updateCustomApi(source.key, data);
                    setEditing(null);
                  }}
                  testState={tests[source.key]}
                  onTest={() =>
                    runTest(source.key, async () => {
                      const r = await api.testSource(source.url);
                      useAppStore.getState().recordSourceHealth([
                        { sourceKey: source.key, ok: r.ok, ms: r.ms, error: r.error, list: [] },
                      ]);
                      return r;
                    })
                  }
                />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function formatEta(done: number, total: number, startedAt: number): string {
  if (done <= 0 || done >= total) return '';
  const elapsed = Date.now() - startedAt;
  const remainSec = Math.max(0, Math.round((elapsed / done) * (total - done) / 1000));
  return remainSec > 0 ? ` · ~${remainSec}s` : '';
}

function VodSourceRow({
  api,
  isEnv,
  editing,
  onEdit,
  onCancelEdit,
  onUpdate,
  testState,
  onTest,
}: {
  api: SourceConfig;
  isEnv: boolean;
  editing: boolean;
  onEdit: (key: string) => void;
  onCancelEdit: () => void;
  onUpdate: (data: { name: string; url: string; detail?: string; isAdult?: boolean }) => void;
  testState?: TestState;
  onTest: () => void;
}) {
  const selected = useAppStore((s) => s.selectedKeys.includes(api.key));
  const yellowFilter = useAppStore((s) => s.yellowFilter);
  const toast = useToast().toast;
  const fromSubscription = api.key.startsWith('sub_');
  const adultBlocked = !!api.isAdult && yellowFilter;

  const remove = () => {
    const snapshot = useAppStore.getState().removeCustomApi(api.key);
    if (!snapshot) return;
    toast(`Removed "${api.name}"`, 'info', {
      action: {
        label: 'Undo',
        onClick: () => {
          const ok = useAppStore.getState().restoreCustomApi(snapshot);
          toast(ok ? 'Restored' : 'Restore failed', ok ? 'success' : 'warning');
        },
      },
    });
  };

  if (editing) {
    return (
      <li className="bg-card rounded-lg p-3">
        <SourceForm visible initial={api} onCancel={onCancelEdit} onSubmit={onUpdate} />
      </li>
    );
  }

  return (
    <li
      className={cn(
        'bg-card rounded-lg p-3 transition-colors hover:bg-hover/50',
        !selected && 'opacity-70'
      )}
    >
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          className="h-4 w-4 accent-accent shrink-0"
          checked={selected}
          onChange={() => useAppStore.getState().toggleSourceSelected(api.key)}
          disabled={adultBlocked}
          title={adultBlocked ? 'Adult content filter is enabled' : undefined}
          aria-label={`Select ${api.name}`}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-content truncate">
            {api.name}
            {api.isAdult && <span className="text-pink-400 text-xs ml-1">(18+)</span>}
            {isEnv && (
              <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-chip text-faint align-middle">
                Preset
              </span>
            )}
            {fromSubscription && (
              <span
                className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent align-middle"
                title="Managed by subscription"
              >
                Subscribed
              </span>
            )}
          </div>
          <div className="text-xs text-faint truncate">{api.url}</div>
        </div>
        <HealthBadge sourceKey={api.key} />
        <TestBadge
          state={testState}
          onTest={onTest}
          title="Test availability (latency & results)"
          badgeWhenOk={({ ms }) => `✓ ${ms}ms`}
        />
        {!isEnv &&
          (fromSubscription ? (
            <>
              <button
                className="rounded-md p-2 text-muted/30 cursor-not-allowed shrink-0"
                disabled
                aria-label="Subscription sources cannot be edited individually"
                title="Managed by subscription; will be overwritten on sync"
              >
                <Icon name="edit" className="w-4 h-4" />
              </button>
              <button
                className="rounded-md p-2 text-muted/30 cursor-not-allowed shrink-0"
                disabled
                aria-label="Subscription sources cannot be deleted individually"
                title="Managed by subscription; delete the subscription to remove"
              >
                <Icon name="trash" className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button
                className="rounded-md p-2 text-muted transition-colors hover:bg-hover hover:text-accent shrink-0"
                onClick={() => onEdit(api.key)}
                aria-label="Edit"
                title="Edit"
              >
                <Icon name="edit" className="w-4 h-4" />
              </button>
              <button
                className="rounded-md p-2 text-muted transition-colors hover:bg-hover hover:text-danger shrink-0"
                onClick={remove}
                aria-label="Delete"
                title="Remove"
              >
                <Icon name="trash" className="w-4 h-4" />
              </button>
            </>
          ))}
      </div>
    </li>
  );
}

// —— 偏好设置面板 ——

function PlaybackPanel() {
  const store = useAppStore();
  const { toast } = useToast();
  const [clearMarksOpen, setClearMarksOpen] = useState(false);
  const markCount = Object.keys(store.skipMarks).length;
  return (
    <section>
      <SectionTitle title="Playback & Filter" />
      <div className="space-y-3">
        <ToggleRow
          label="Ad Segment Filter"
          description="Filter out advertising video segments from playback"
          checked={store.adFilter}
          onChange={(v) => store.updateSettings({ adFilter: v })}
        />
        <ToggleRow
          label="Autoplay Next"
          description="Automatically play the next episode when current episode ends"
          checked={store.autoplayNext}
          onChange={(v) => store.updateSettings({ autoplayNext: v })}
        />
        <ToggleRow
          label="Auto-skip Segments"
          description="Automatically skip intro/outro markers during playback"
          checked={store.autoSkipSegments}
          onChange={(v) => store.updateSettings({ autoSkipSegments: v })}
        />
        <ToggleRow
          label="Volume Boost"
          description="Boost audio output up to ~1.8x using Web Audio gain stage (default off)"
          checked={store.volumeBoost}
          onChange={(v) => store.updateSettings({ volumeBoost: v })}
        />
      </div>

      {markCount > 0 && (
        <div className="flex items-center justify-between gap-3 pt-3 mt-3 border-t border-line">
          <div className="min-w-0">
            <div className="text-sm text-content">Skip Segment Markers</div>
            <div className="text-xs text-faint">{markCount} titles recorded. Managed in the player Skip Markers menu.</div>
          </div>
          <button className="btn-ghost btn-sm shrink-0" onClick={() => setClearMarksOpen(true)}>
            Clear All
          </button>
        </div>
      )}

      <ConfirmDialog
        open={clearMarksOpen}
        danger
        title="Clear all skip markers?"
        message={`Will delete skip markers for ${markCount} titles. You can re-mark them during playback.`}
        confirmLabel="Clear All"
        onCancel={() => setClearMarksOpen(false)}
        onConfirm={() => {
          store.clearAllSkipMarks();
          setClearMarksOpen(false);
          toast('Cleared all skip markers', 'success');
        }}
      />

      <VideoCachePanel />
    </section>
  );
}

/** 片段缓存：开启/关闭 + 用量展示 + 清理（数据在浏览器本地，独立于配置导出） */
function VideoCachePanel() {
  const [enabled, setEnabled] = useState(() => loadCacheSettings().enabled);
  const [summary, setSummary] = useState<CacheSummary>({ segments: 0, bytes: 0, episodes: 0 });
  const [clearing, setClearing] = useState(false);

  const refresh = useCallback(() => {
    void getCacheSummary().then(setSummary);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const formatBytes = (bytes: number): string => {
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  return (
    <div className="space-y-3 pt-3 mt-3 border-t border-line">
      <ToggleRow
        label="Local Segment Cache"
        description="Cache video segments to local browser storage to smooth playback and avoid buffering"
        checked={enabled}
        onChange={(v) => {
          const next = saveCacheSettings({ enabled: v });
          setEnabled(next.enabled);
        }}
      />
      <div className="flex items-center justify-between text-xs text-faint">
        <span>
          Cached {summary.segments} segments · {formatBytes(summary.bytes)} · {summary.episodes} episodes
        </span>
        <button
          type="button"
          className="px-2 py-1 rounded bg-chip text-content hover:bg-hover transition-colors disabled:opacity-50"
          disabled={clearing || summary.segments === 0}
          onClick={async () => {
            setClearing(true);
            await clearVideoCache();
            refresh();
            setClearing(false);
          }}
        >
          Clear Cache
        </button>
      </div>
    </div>
  );
}

function ImagePanel() {
  const store = useAppStore();
  const mode = store.imageProxyMode;
  const description: Record<'direct' | 'proxy' | 'custom', string> = {
    direct: 'Direct connection to source site; falls back to proxy if failed. Saves server bandwidth.',
    proxy: 'Proxied through server for stability. Recommended if covers fail to load.',
    custom: 'Forward cover images using your custom template.',
  };
  return (
    <section>
      <SectionTitle title="Image Loading" />
      <div className="space-y-2">
        <SelectRow
          label="Loading Mode"
          value={mode}
          description={description[mode]}
          onChange={(v) => store.updateSettings({ imageProxyMode: v as 'direct' | 'proxy' | 'custom' })}
          options={[
            { value: 'direct', label: 'Direct First', hint: 'Saves server bandwidth' },
            { value: 'proxy', label: 'Built-in Proxy', hint: 'Most reliable' },
            { value: 'custom', label: 'Custom', hint: 'Custom proxy template' },
          ]}
        />
        {mode === 'custom' && <CustomProxyInput />}
      </div>
    </section>
  );
}

function CustomProxyInput() {
  const value = useAppStore((s) => s.customImageProxy);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => updateSettings({ customImageProxy: draft }), 300);
    return () => clearTimeout(timer);
  }, [draft, value, updateSettings]);

  return (
    <input
      className="input w-full"
      aria-label="Custom image proxy template"
      placeholder="Proxy template, e.g. https://p.example.com/?url={url}"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
    />
  );
}

function HomePanel() {
  const store = useAppStore();
  return (
    <section>
      <SectionTitle title="Home & Content Filter" />
      <div className="space-y-3">
        <ToggleRow
          label="Adult Content Filter"
          description="Filter out adult and 18+ content categories"
          checked={store.yellowFilter}
          onChange={(v) => store.updateSettings({ yellowFilter: v })}
        />
        <ToggleRow
          label="Home Recommendations"
          description="Show trending movies and shows on home page"
          checked={store.doubanEnabled}
          onChange={(v) => store.updateSettings({ doubanEnabled: v })}
        />
        <SelectRow
          label="Recommendation Source"
          value={store.recommendSource}
          onChange={(v) => store.updateSettings({ recommendSource: v as 'douban' | 'bangumi' | 'hot-list' })}
          options={[
            { value: 'douban', label: 'Douban', hint: 'Trending movies & series' },
            { value: 'bangumi', label: 'Bangumi', hint: 'Daily anime releases' },
            { value: 'hot-list', label: 'Hot Charts', hint: 'Weekly charts & trending' },
          ]}
        />
      </div>
    </section>
  );
}

// —— 数据面板 ——

/**
 * 自动刷新周期选项。值统一用字符串（Dropdown 的 value 是 string），
 * `off` = 纯手动，保持这个功能对存量用户的默认无感。
 */
const REFRESH_OPTIONS: DropdownOption[] = [
  { value: 'off', label: 'Manual', hint: 'Sync only when clicking ⟳' },
  { value: '1', label: 'Daily', hint: 'Check on site open' },
  { value: '3', label: 'Every 3 days' },
  { value: '7', label: 'Every 7 days' },
  { value: '14', label: 'Every 14 days' },
  { value: '30', label: 'Every 30 days' },
];

function SourceSubscriptions() {
  const store = useAppStore();
  const { toast } = useToast();
  const [subUrl, setSubUrl] = useState('');
  const [syncing, setSyncing] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const sync = async (url: string) => {
    setSyncing((prev) => new Set(prev).add(url));
    try {
      const { vodCount, liveCount, stats } = await syncSourceSubscription(url);
      const detail = describeParseStats(stats, { includeSamples: false });
      const formatLabel =
        stats?.format === 'tvbox'
          ? ' (TVBox Config)'
          : stats?.format === 'source-catalog'
            ? ' (Source Catalog)'
            : '';
      toast(`Synced ${vodCount} Video APIs, ${liveCount} Live Streams${formatLabel}${detail ? `; ${detail}` : ''}`, 'success');
      setSubUrl('');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Subscription sync failed', 'error');
    } finally {
      setSyncing((prev) => {
        const next = new Set(prev);
        next.delete(url);
        return next;
      });
    }
  };

  const addAndSync = () => {
    const url = subUrl.trim();
    if (!validateSourceUrl(url)) {
      toast('Subscription URL must start with http:// or https://', 'warning');
      return;
    }
    void sync(url);
  };

  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<{
    url: string;
    provider: string;
    sources: number;
    liveSources: number;
  } | null>(null);

  const publish = async () => {
    const seen = new Set<string>();
    const sources = store.selectedKeys
      .map((key) => resolveSource(store, key))
      .filter((s): s is SourceConfig => !!s && validateSourceUrl(s.url) && !isSourceDisabled(store, s.key))
      .filter((s) => {
        const key = s.url.replace(/\/+$/, '');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(({ name, url }) => ({ name, url }));

    const liveSeen = new Set<string>();
    const liveSources = allLiveSources(store)
      .filter((s) => store.liveSelectedUrls.includes(s.url))
      .filter((s) => {
        if (liveSeen.has(s.url)) return false;
        liveSeen.add(s.url);
        return true;
      })
      .map(({ name, url, epg }) => ({ name: name || hostnameOf(url), url, epg }));

    if (sources.length === 0 && liveSources.length === 0) {
      toast('No enabled sources to publish', 'warning');
      return;
    }

    setPublishing(true);
    try {
      const result = await api.publishSourceList({ name: 'LibreTV-SourceList', sources, liveSources });
      setPublished(result);
      toast(`Published ${result.sources} Video APIs, ${result.liveSources} Live Streams to ${result.provider}`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Publish failed', 'error');
    } finally {
      setPublishing(false);
    }
  };

  const copyPublished = () => {
    if (!published) return;
    copyToClipboard(published.url).then((ok) =>
      ok ? toast('Subscription link copied', 'success') : toast('Copy failed, please copy manually', 'warning'),
    );
  };

  const exportSources = () => {
    const all = [...store.envSources, ...store.customAPIs];
    const seen = new Set<string>();
    const sources = all
      .filter((s) => {
        const u = s.url.replace(/\/+$/, '');
        if (seen.has(u)) return false;
        seen.add(u);
        return true;
      })
      .map(({ name, url, detail, isAdult }) => ({ name, url, detail, isAdult }));

    const liveSeen = new Set<string>();
    const liveSources = [...store.liveEnvSources, ...store.liveSubscriptions]
      .filter((s) => {
        if (liveSeen.has(s.url)) return false;
        liveSeen.add(s.url);
        return true;
      })
      .map(({ name, url, epg }) => ({ name: name || hostnameOf(url), url, epg }));

    const payload = { name: 'LibreTV-SourceList', version: 2, exportedAt: Date.now(), sources, liveSources };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `LibreTV-SourceList_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`Exported ${sources.length} Video APIs and ${liveSources.length} Live Streams`, 'success');
  };

  const deleteImpact = (url: string) => {
    const prefix = subKeyPrefix(url);
    return {
      vod: store.customAPIs.filter((a) => keyBelongsToSubscription(a.key, prefix)).length,
      live: store.liveSubscriptions.filter((s) => s.fromSubscriptions.includes(url)).length,
    };
  };

  return (
    <section>
      <SectionTitle
        title="Subscriptions & Sharing"
        extra={
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              className="btn-ghost btn-sm"
              onClick={exportSources}
              disabled={
                store.customAPIs.length + store.envSources.length + store.liveSubscriptions.length + store.liveEnvSources.length ===
                0
              }
            >
              Export Sources
            </button>
            <button
              className="btn-ghost btn-sm"
              onClick={() => void publish()}
              disabled={publishing}
              title="Upload enabled sources to a public pastebin for easy sharing and subscribing"
            >
              {publishing ? 'Publishing…' : 'Publish as Link'}
            </button>
          </div>
        }
      />

      {published && (
        <div className="mb-3 rounded-lg border border-line bg-chip/60 p-2.5">
          <div className="flex items-center gap-1.5">
            <input
              readOnly
              value={published.url}
              className="input flex-1 min-w-0 !py-1.5 text-xs"
              aria-label="Published subscription URL"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button className="btn-ghost btn-sm shrink-0" onClick={copyPublished}>
              Copy
            </button>
            <button
              className="btn-ghost btn-sm shrink-0"
              onClick={() => {
                setSubUrl(published.url);
                void sync(published.url);
              }}
            >
              Subscribe Now
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-faint leading-relaxed">
            Published to {published.provider} ({published.sources} Video APIs, {published.liveSources} Live Streams). Link is public.
          </p>
        </div>
      )}

      <div className="flex gap-2 mb-2">
        <input
          className="input flex-1 min-w-0"
          placeholder="Subscription URL (LibreTV or TVBox JSON format)"
          value={subUrl}
          onChange={(e) => setSubUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addAndSync();
          }}
        />
        <button
          className="btn-primary btn-sm shrink-0"
          disabled={!subUrl.trim() || syncing.size > 0}
          onClick={addAndSync}
        >
          {syncing.size > 0 ? 'Syncing…' : 'Subscribe'}
        </button>
      </div>
      {store.subscriptions.length === 0 ? (
        <p className="text-xs text-faint">
          Subscriptions allow one-click import of Video APIs and Live Streams. Supports LibreTV SourceList and TVBox formats.
        </p>
      ) : (
        <ul className="space-y-2">
          {store.subscriptions.map((sub) => {
            const vodCount = store.customAPIs.filter((a) => keyBelongsToSubscription(a.key, subKeyPrefix(sub.url))).length;
            const liveCount = store.liveSubscriptions.filter((s) => s.fromSubscriptions.includes(sub.url)).length;
            const isSyncing = syncing.has(sub.url);
            const paused = Boolean(
              sub.refreshDays && (sub.failStreak ?? 0) >= AUTO_REFRESH_MAX_FAIL_STREAK
            );
            const nextAt =
              sub.refreshDays && sub.lastSync ? sub.lastSync + sub.refreshDays * 86_400_000 : undefined;
            const remainingMs = nextAt ? nextAt - Date.now() : 0;
            return (
              <li
                key={sub.url}
                className={cn(
                  'bg-card rounded-lg p-3 transition-colors hover:bg-hover/50',
                  sub.enabled === false && 'opacity-70'
                )}
              >
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-content truncate">{sub.name || hostnameOf(sub.url)}</div>
                    <div className="text-xs text-faint truncate">
                      {sub.url}
                      {sub.lastSync && ` · Synced ${formatRelativeTime(sub.lastSync)}`}
                    </div>
                    <div className="mt-1 flex items-center gap-1 flex-wrap">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent">VOD {vodCount}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent">Live {liveCount}</span>
                      {sub.enabled === false && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/15 text-warning">Disabled</span>
                      )}
                      {sub.lastStatus === 'error' ? (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded bg-danger/15 text-danger"
                          title={sub.lastError}
                        >
                          Sync failed
                        </span>
                      ) : sub.lastStatus === 'ok' && sub.lastCounts ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/15 text-success">
                          Imported {sub.lastCounts.vod} VOD / {sub.lastCounts.live} Live
                        </span>
                      ) : null}
                    </div>
                    {sub.lastStatus === 'error' && sub.lastError && (
                      <p className="text-[11px] text-danger mt-1 break-all">{sub.lastError}</p>
                    )}
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap text-[11px] text-faint">
                      <Icon name="clock" className="w-3 h-3 shrink-0" />
                      <span>Auto-refresh</span>
                      <Dropdown
                        value={sub.refreshDays ? String(sub.refreshDays) : 'off'}
                        onChange={(v) =>
                          store.setSubscriptionRefreshDays(sub.url, v === 'off' ? undefined : Number(v))
                        }
                        options={REFRESH_OPTIONS}
                        ariaLabel="Auto-refresh interval"
                        className="[&>button]:!py-0.5 [&>button]:!pl-2 [&>button]:!pr-1.5 [&>button]:text-[11px]"
                      />
                      {paused ? (
                        <span className="text-warning">
                          Paused: {sub.failStreak} errors. Manual sync will resume.
                        </span>
                      ) : remainingMs > 0 ? (
                        <span>In ~{Math.max(1, Math.ceil(remainingMs / 86_400_000))} days</span>
                      ) : sub.refreshDays ? (
                        <span>On next site visit</span>
                      ) : null}
                    </div>
                  </div>
                  <Switch
                    checked={sub.enabled !== false}
                    onChange={(v) => store.setSubscriptionEnabled(sub.url, v)}
                    label={sub.enabled === false ? 'Enable subscription' : 'Disable subscription'}
                    title={
                      sub.enabled === false
                        ? 'Currently disabled, click to enable'
                        : 'Disable subscription'
                    }
                  />
                  <button
                    className="rounded-md p-2 shrink-0 text-muted transition-colors hover:bg-hover hover:text-accent disabled:opacity-40"
                    disabled={isSyncing}
                    onClick={() => sync(sub.url)}
                    aria-label="Sync now"
                    title="Sync now"
                  >
                    {isSyncing ? (
                      <Spinner size="sm" />
                    ) : (
                      <Icon name="refresh" className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    className="rounded-md p-2 shrink-0 text-muted transition-colors hover:bg-hover hover:text-danger"
                    onClick={() => setPendingDelete(sub.url)}
                    aria-label="Delete subscription"
                    title="Delete subscription"
                  >
                    <Icon name="trash" className="w-4 h-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        danger
        title="Delete subscription?"
        message={
          pendingDelete
            ? (() => {
                const impact = deleteImpact(pendingDelete);
                const parts: string[] = [];
                if (impact.vod > 0) parts.push(`${impact.vod} Video APIs`);
                if (impact.live > 0) parts.push(`${impact.live} Live Streams`);
                return parts.length > 0
                  ? `Will also delete ${parts.join(' and ')} imported by this subscription.`
                  : 'This subscription currently has no imported sources.';
              })()
            : undefined
        }
        confirmLabel="Delete Subscription"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const url = pendingDelete;
          if (url) useAppStore.getState().removeSubscription(url);
          setPendingDelete(null);
          toast('Subscription deleted', 'success');
        }}
      />
    </section>
  );
}

function ConfigIoPanel() {
  const { toast } = useToast();
  const { verified, openLogin } = useAuth();
  const [pending, setPending] = useState<{ file: File; summary: string } | null>(null);

  const doExport = async () => {
    if (verified === false) {
      openLogin();
      return;
    }
    try {
      const json = await exportConfig();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `LibreTV-Settings_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Configuration exported', 'success');
    } catch {
      toast('Export failed', 'error');
    }
  };

  const pickImport = async (file: File) => {
    try {
      const summary = summarizeConfig(await file.text());
      setPending({ file, summary });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Import failed', 'error');
    }
  };

  const confirmImport = async () => {
    if (!pending) return;
    try {
      await importConfig(await pending.file.text());
      setPending(null);
      toast('Configuration imported successfully, reloading...', 'success');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Import failed', 'error');
    }
  };

  return (
    <section>
      <SectionTitle title="Backup & Restore" hint="Export or import configuration including sources, subscriptions, and preferences" />
      <div className="flex gap-2">
        <button className="btn-ghost flex-1 text-xs" onClick={doExport}>
          Export Backup
        </button>
        <label className="btn-ghost flex-1 text-xs cursor-pointer">
          Restore Backup
          <input
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void pickImport(f);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      <ConfirmDialog
        open={pending !== null}
        danger
        title="Restore backup and overwrite current settings?"
        message={pending ? `${pending.summary}. Page will reload immediately, overwriting existing settings.` : undefined}
        confirmLabel="Restore & Overwrite"
        onCancel={() => setPending(null)}
        onConfirm={confirmImport}
      />
    </section>
  );
}

function summarizeConfig(text: string): string {
  let cfg: { name?: string; data?: Record<string, unknown> };
  try {
    cfg = JSON.parse(text) as { name?: string; data?: Record<string, unknown> };
  } catch {
    throw new Error('File is not valid JSON');
  }
  if (cfg.name !== 'LibreTV-Settings') throw new Error('Not a valid LibreTV settings file');

  const parts: string[] = [];
  const settingsRaw = cfg.data?.[PERSIST_KEY];
  if (typeof settingsRaw === 'string') {
    try {
      const state = (JSON.parse(settingsRaw) as { state?: Record<string, unknown> }).state ?? {};
      const vod = Array.isArray(state.customAPIs) ? state.customAPIs.length : 0;
      const live = Array.isArray(state.liveSubscriptions) ? state.liveSubscriptions.length : 0;
      const subs = Array.isArray(state.subscriptions) ? state.subscriptions.length : 0;
      parts.push(`${vod} Video APIs`, `${live} Live Streams`, `${subs} Subscriptions`);
    } catch {
      // ignore
    }
  }
  const historyRaw = cfg.data?.['viewingHistory'];
  if (typeof historyRaw === 'string') {
    try {
      const h = JSON.parse(historyRaw);
      if (Array.isArray(h)) parts.push(`${h.length} watch history entries`);
    } catch {
      // ignore
    }
  }
  return parts.length > 0 ? `This file contains ${parts.join(', ')}` : 'This file contains no importable data';
}

function SourceForm({
  visible,
  initial,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  initial?: { key: string; name: string; url: string; detail?: string; isAdult?: boolean };
  onCancel: () => void;
  onSubmit: (data: { name: string; url: string; detail?: string; isAdult?: boolean }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [detail, setDetail] = useState(initial?.detail ?? '');
  const [isAdult, setIsAdult] = useState(initial?.isAdult ?? false);
  const { toast } = useToast();

  useEffect(() => {
    if (visible) {
      setName(initial?.name ?? '');
      setUrl(initial?.url ?? '');
      setDetail(initial?.detail ?? '');
      setIsAdult(initial?.isAdult ?? false);
    }
  }, [visible, initial]);

  if (!visible) return null;

  const submit = () => {
    const n = name.trim();
    const u = url.trim().replace(/\/+$/, '');
    if (!n || !u) {
      toast('Please enter API name and URL', 'warning');
      return;
    }
    if (!validateSourceUrl(u)) {
      toast('API URL must start with http:// or https://', 'warning');
      return;
    }
    onSubmit({ name: n, url: u, detail: detail.trim() || undefined, isAdult });
  };

  return (
    <div className="space-y-2 border border-line rounded-lg p-3 bg-chip mb-2">
      <input
        className="input w-full"
        aria-label="Source Name"
        placeholder="Source Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="input w-full"
        aria-label="API URL"
        placeholder="API URL, e.g. https://example.com/api.php/provide/vod"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <input
        className="input w-full"
        aria-label="Detail URL (Optional)"
        placeholder="Detail URL (Optional), e.g. https://example.com"
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
      />
      <label className="flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-pink-500"
          checked={isAdult}
          onChange={(e) => setIsAdult(e.target.checked)}
        />
        Mark as adult (18+) content source
      </label>
      <div className="flex gap-2 justify-end">
        <button className="btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn-primary btn-sm" onClick={submit}>
          {initial ? 'Update' : 'Add'}
        </button>
      </div>
    </div>
  );
}
