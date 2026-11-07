'use client';

import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/lib/store';
import {
  SEGMENT_COLORS,
  SEGMENT_LABELS,
  validateSegment,
  type SkipSegment,
  type SkipSegmentType,
} from '@/lib/skip-marks';
import { cn, formatTime } from '@/lib/utils';
import { useToast } from './toast';
import { Drawer } from './drawer';
import { Icon } from './icon';

/**
 * 播放页的「跳过标记」抽屉。
 *
 * 采集站不提供片头片尾元数据，边界只能由用户在看的时候标记一次，
 * 之后同剧各集与同名资源自动套用。片段按位置归类：opening（片头）、
 * middle（中段）、ending（片尾）。抽屉负责「记录/试跳/微调/删除」，
 * 真正的跳过判定在 player-shell.tsx，存储与校验在 lib/skip-marks.ts。
 *
 * 交互约定：
 * - 抽屉是非模态的：不遮光、不锁滚动、不挡点击。标记的前提是"看着画面记边界"，
 *   模态遮罩会把正在播的视频压暗并吃掉点击，反而没法边看边标；
 * - 手机上（<lg）退化成底部半屏抽屉，并把记录按钮放在 footer 常驻，避免盖住画面、
 *   也避免列表变长后要滚到底才能记一笔；
 * - 记录/试跳前先暂停：点击到读取之间视频还在走，容易偏 1–2 秒；
 * - 顶部常驻「当前 12:34 / 45:00」，试跳与微调都有参照；
 * - 中段两步态的起点由播放页持有（pendingStart），与 Shift+S/E 共用同一份状态；
 * - 全局「自动跳过片段」在这里只读展示（层级不同，避免和「本剧跳过」并排成两个 checkbox）。
 */

interface PlayerClock {
  currentTime: number;
  duration: number;
  seek(seconds: number): void;
  pause(): void;
  isPaused(): boolean;
}

const SEGMENT_TYPES: SkipSegmentType[] = ['opening', 'middle', 'ending'];

const round1 = (v: number) => Math.round(v * 10) / 10;

export function SkipMarkPanel({
  open,
  onClose,
  markKey,
  pendingStart,
  onPendingStart,
  getPlayerClock,
  mobileMaxHeight,
}: {
  open: boolean;
  onClose: () => void;
  /** 已归一化的标记键（watch 页按剧名计算） */
  markKey: string;
  /** 中段两步态起点（页面层持有） */
  pendingStart: number | null;
  onPendingStart: (start: number | null) => void;
  /** 读取播放器当前时间/时长/跳转；播放器未就绪时返回 null */
  getPlayerClock: () => PlayerClock | null;
  /**
   * 小屏抽屉的最大高度（px，由播放页按播放器底边算出）：
   * 视口矮、播放器占比大时靠它保证抽屉不压住画面；未传则用默认 60vh。
   */
  mobileMaxHeight?: number;
}) {
  const mark = useAppStore((s) => s.skipMarks[markKey]);
  const setSkipMark = useAppStore((s) => s.setSkipMark);
  const setSkipMarkEnabled = useAppStore((s) => s.setSkipMarkEnabled);
  const autoSkipSegments = useAppStore((s) => s.autoSkipSegments);
  const { toast } = useToast();

  const segments = (mark?.segments ?? []).slice().sort((a, b) => a.start - b.start);
  const enabled = mark ? mark.enabled !== false : false;

  // 当前进度：抽屉打开时每秒刷新一次；用 ref 拿最新的取数函数，避免每秒重置定时器
  const clockFnRef = useRef(getPlayerClock);
  clockFnRef.current = getPlayerClock;
  const [clock, setClock] = useState({ current: 0, duration: 0, paused: true });
  useEffect(() => {
    if (!open) return;
    const tick = () => {
      const c = clockFnRef.current();
      setClock({
        current: c?.currentTime ?? 0,
        duration: c?.duration ?? 0,
        paused: c ? c.isPaused() : true,
      });
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [open]);

  const write = (next: SkipSegment[]) => setSkipMark(markKey, next);

  // 记录/试跳前统一「先暂停再取时间」：暂停后 currentTime 才是用户看到的画面位置
  const pauseAndSnap = (): { t: number; duration: number } | null => {
    const c = getPlayerClock();
    if (!c) {
      toast('Player is not ready, please try again shortly', 'warning');
      return null;
    }
    if (!c.isPaused()) c.pause();
    setClock({ current: c.currentTime, duration: c.duration, paused: true });
    return { t: round1(c.currentTime), duration: c.duration };
  };

  /** 记录一条片段；成功返回 true（失败时保留两步态，用户可以改位置重试） */
  const tryRecord = (segment: SkipSegment, label: string, duration: number): boolean => {
    const error = validateSegment(segment, duration, segments);
    if (error) {
      toast(error, 'error');
      return false;
    }
    write([...segments, segment]);
    const effect = autoSkipSegments
      ? segment.type === 'ending'
        ? ', auto-completes episode after passing start'
        : ', will auto-skip on match'
      : segment.type === 'ending'
        ? ', shows "Skip Outro" button on match'
        : ', shows skip button on match';
    const at =
      segment.type === 'ending'
        ? formatTime(segment.start)
        : segment.type === 'middle'
          ? `${formatTime(segment.start)} → ${formatTime(segment.end)}`
          : formatTime(segment.end);
    toast(`Recorded ${label} ${at}${effect}`, 'success');
    return true;
  };

  const recordAt = (type: 'opening' | 'ending') => {
    const snap = pauseAndSnap();
    if (!snap) return;
    if (snap.t <= 0) {
      toast(type === 'opening' ? 'Please play to the end of the intro first' : 'Please play to the start of the outro first', 'warning');
      return;
    }
    if (type === 'opening') tryRecord({ type, start: 0, end: snap.t }, 'Intro End', snap.duration);
    else tryRecord({ type, start: snap.t, end: -1 }, 'Outro Start', snap.duration);
  };

  const markMiddleStart = () => {
    const snap = pauseAndSnap();
    if (!snap) return;
    if (snap.t <= 0) {
      toast('Please play to the start of the segment first', 'warning');
      return;
    }
    onPendingStart(snap.t);
    toast(`Paused and marked start ${formatTime(snap.t)}. Play to end and click "Mark End"`, 'info');
  };

  const markMiddleEnd = () => {
    if (pendingStart === null) return;
    const snap = pauseAndSnap();
    if (!snap) return;
    if (snap.t <= pendingStart) {
      toast('End time must be after start time', 'warning');
      return;
    }
    if (tryRecord({ type: 'middle', start: pendingStart, end: snap.t }, 'Recap/Ad Segment', snap.duration)) {
      onPendingStart(null);
    }
  };

  const remove = (index: number) => {
    const seg = segments[index];
    if (!seg) return;
    const wasDisabled = mark?.enabled === false;
    write(segments.filter((_, i) => i !== index));
    toast(`Deleted ${SEGMENT_LABELS[seg.type]} segment`, 'info', {
      action: {
        label: 'Undo',
        onClick: () => {
          setSkipMark(markKey, segments);
          if (wasDisabled) setSkipMarkEnabled(markKey, false);
        },
      },
    });
  };

  const nudge = (index: number, delta: number) => {
    const seg = segments[index];
    if (!seg) return;
    const changed: SkipSegment =
      seg.type === 'ending'
        ? { ...seg, start: round1(seg.start + delta) }
        : seg.type === 'opening'
          ? { ...seg, end: round1(seg.end + delta) }
          : { ...seg, start: round1(seg.start + delta), end: round1(seg.end + delta) };
    const clockNow = getPlayerClock();
    const others = segments.filter((_, i) => i !== index);
    const error = validateSegment(changed, clockNow?.duration ?? 0, others);
    if (error) {
      toast(error, 'error');
      return;
    }
    write(segments.map((s, i) => (i === index ? changed : s)));
  };

  /** 试跳：跳到后保持暂停，让用户先确认画面（终点落在片段末尾前 1s） */
  const jump = (seg: SkipSegment, to: 'start' | 'end') => {
    const c = getPlayerClock();
    if (!c) {
      toast('Player is not ready, please try again shortly', 'warning');
      return;
    }
    c.pause();
    c.seek(to === 'start' ? seg.start : Math.max(0, seg.end - 1));
    setClock({ current: to === 'start' ? seg.start : Math.max(0, seg.end - 1), duration: c.duration, paused: true });
  };

  /** 当前播放位置落在哪个片段里：列表里高亮出来，方便核对边界 */
  const currentKey = segments.find((s) => {
    if (clock.current < s.start) return false;
    if (s.type === 'ending') return true;
    return clock.current < s.end;
  });

  return (
    // 桌面端宽度收窄到 320px：播放页右侧剧集栏是 300px，抽屉正好盖住它而不压到视频；
    // 记录区放进 footer 常驻底部：手机上侧栏只占下半屏，滚到列表末尾再点按钮太别扭
    <Drawer
      open={open}
      onClose={onClose}
      title="Skip Markers"
      width="max-w-sm lg:max-w-[20rem]"
      modal={false}
      mobileSheet
      panelStyle={mobileMaxHeight ? { maxHeight: mobileMaxHeight } : undefined}
      footer={
        <div>
          <p className="mb-1.5 text-[11px] text-muted">Record (pauses on current frame)</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              className="btn-ghost btn-sm"
              title="Mark current frame as intro end"
              onClick={() => recordAt('opening')}
            >
              Mark Intro End
            </button>
            <button
              type="button"
              className="btn-ghost btn-sm"
              title="Mark current frame as outro start"
              onClick={() => recordAt('ending')}
            >
              Mark Outro Start
            </button>
            {pendingStart === null ? (
              <button type="button" className="btn-ghost btn-sm" onClick={markMiddleStart}>
                Mark Middle Start
              </button>
            ) : (
              <>
                <button type="button" className="btn-ghost btn-sm" onClick={markMiddleEnd}>
                  Mark Middle End (from {formatTime(pendingStart)})
                </button>
                <button type="button" className="btn-ghost btn-sm" title="Discard this start marker" onClick={() => onPendingStart(null)}>
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-muted">
            Current{' '}
            <span className="font-mono text-content">{formatTime(clock.current)}</span>
            <span className="text-muted"> / {formatTime(clock.duration)}</span>
            {clock.paused && <span className="ml-1 text-muted">· Paused</span>}
          </p>
          <p className="mt-1 text-[11px] text-muted">
            {segments.length} segment(s) marked · Applied across all episodes & mirrors
          </p>
        </div>
        <label
          className={cn(
            'flex shrink-0 items-center gap-1.5 text-xs',
            mark ? 'cursor-pointer text-muted hover:text-content' : 'cursor-not-allowed text-faint'
          )}
          title={mark ? 'Disable without deleting markers' : 'No markers configured yet'}
        >
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-accent"
            checked={enabled}
            disabled={!mark}
            onChange={(e) => setSkipMarkEnabled(markKey, e.target.checked)}
          />
          Enable for Series
        </label>
      </div>

      {segments.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-line px-3 py-3 text-xs leading-relaxed text-muted">
          No skip markers yet. Play to target position and use the buttons below, or use shortcuts:
          Shift+I (Intro End) / Shift+O (Outro Start) / Shift+S · Shift+E (Middle Segment).
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {segments.map((seg, i) => {
            const isCurrent = currentKey === seg;
            const sameTypeCount = segments.filter((s) => s.type === seg.type).length;
            const label =
              seg.type === 'middle' && sameTypeCount > 1
                ? `${SEGMENT_LABELS.middle} ${segments.slice(0, i).filter((s) => s.type === 'middle').length + 1}`
                : SEGMENT_LABELS[seg.type];
            return (
              <li
                key={`${seg.type}:${seg.start}`}
                className={cn(
                  'relative rounded-lg border px-2.5 py-2 pr-8 transition-colors',
                  isCurrent ? 'border-accent/60 bg-chip/60' : 'border-line/70'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 text-xs">
                    <span
                      aria-hidden
                      className="inline-block h-2 w-2 shrink-0 rounded-sm"
                      style={{ backgroundColor: SEGMENT_COLORS[seg.type] }}
                    />
                    <span className="text-muted">[{label}]</span>
                    <span className="font-mono text-muted">
                      {formatTime(seg.start)} → {seg.type === 'ending' ? 'End' : formatTime(seg.end)}
                    </span>
                  </span>
                  {isCurrent && <span className="shrink-0 text-[10px] text-accent">Active</span>}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    title="Seek to start to verify"
                    onClick={() => jump(seg, 'start')}
                  >
                    Start
                  </button>
                  {seg.type !== 'ending' && (
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      title="Seek 1s before end to verify"
                      onClick={() => jump(seg, 'end')}
                    >
                      End
                    </button>
                  )}
                  <button type="button" className="btn-ghost btn-sm" title="Nudge boundary -1s" onClick={() => nudge(i, -1)}>
                    -1s
                  </button>
                  <button type="button" className="btn-ghost btn-sm" title="Nudge boundary +1s" onClick={() => nudge(i, 1)}>
                    +1s
                  </button>
                </div>
                <button
                  type="button"
                  className="absolute right-0.5 top-0.5 rounded-md p-1.5 text-muted transition-colors hover:bg-hover hover:text-danger"
                  title="Delete (undoable in toast)"
                  aria-label={`Delete ${label} segment`}
                  onClick={() => remove(i)}
                >
                  <Icon name="close" className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* 全局开关：只读展示 */}
      <div className="mt-3 rounded-lg border border-line bg-surface px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted">Global · Auto Skip Segments</span>
          <span className={cn('text-xs font-medium', autoSkipSegments ? 'text-accent' : 'text-muted')}>
            {autoSkipSegments ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          {autoSkipSegments
            ? 'Intro and middle segments are skipped automatically; outro marks the end of the episode.'
            : 'Shows on-screen skip buttons without jumping automatically.'}
          Affects all videos. Configure in Settings → Preferences.
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        <span>Timeline markers:</span>
        {SEGMENT_TYPES.map((t) => (
          <span key={t} className="inline-flex items-center gap-1">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-sm"
              style={{ backgroundColor: SEGMENT_COLORS[t] }}
            />
            {SEGMENT_LABELS[t]}
          </span>
        ))}
        <span className="w-full">When skipped, an &quot;Undo&quot; prompt will appear at top of the player.</span>
      </div>
    </Drawer>
  );
}
