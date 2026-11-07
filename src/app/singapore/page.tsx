'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import Script from 'next/script';
import Hls from 'hls.js';
import { Header } from '@/components/header';
import { SINGAPORE_CHANNELS, type SingaporeChannel } from '@/lib/singapore-channels';
import { cn } from '@/lib/utils';

export default function SingaporeStreamingPage() {
  const [channels] = useState<SingaporeChannel[]>(SINGAPORE_CHANNELS);
  const [currentChannel, setCurrentChannel] = useState<SingaporeChannel>(SINGAPORE_CHANNELS[0]);
  const [activeSource, setActiveSource] = useState<string>('default');
  const [category, setCategory] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [epgData, setEpgData] = useState<
    Record<string, { title: string; desc: string; progress: number; timeFormatted: string }>
  >({});
  const [shakaReady, setShakaReady] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playerWrapperRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const shakaRef = useRef<any>(null);

  // Check if Shaka Player was already loaded (e.g. client route transitions)
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).shaka) {
      setShakaReady(true);
    }
  }, []);

  // Fetch Live EPG schedule
  useEffect(() => {
    fetch('/api/singapore')
      .then((res) => res.json())
      .then((data) => {
        if (data.epg) setEpgData(data.epg);
      })
      .catch((err) => console.warn('EPG load warning:', err));

    const interval = setInterval(() => {
      fetch('/api/singapore')
        .then((res) => res.json())
        .then((data) => {
          if (data.epg) setEpgData(data.epg);
        })
        .catch(() => {});
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  // Calculate available playback sources for current channel
  const availableSources = useMemo(() => {
    if (!currentChannel || currentChannel.streamType === 'audio') return [];

    const sources: { id: string; label: string }[] = [];

    if (currentChannel.streamType === 'mpd' || currentChannel.mpdUrl) {
      sources.push({
        id: 'mpd',
        label: currentChannel.clearKeys ? '🛡️ 1080p HD (ClearKey)' : '⚡ 1080p HD',
      });
    }

    if (currentChannel.altHls) {
      sources.push({ id: 'altHls', label: '📺 Alt HLS (Mobile & TV)' });
    }

    if (currentChannel.streamType === 'hls' || currentChannel.id === 'cna') {
      sources.push({ id: 'default', label: '⚡ Direct CloudFront HLS' });
    }

    if (currentChannel.youtubeId) {
      sources.push({ id: 'youtube', label: '▶️ YouTube Live' });
    }

    return sources;
  }, [currentChannel]);

  // Cleanly stop existing playback engines
  const stopEngines = useCallback(async () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
    }
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (shakaRef.current) {
      try {
        await shakaRef.current.unload();
      } catch {
        // ignore unload errors
      }
    }
  }, []);

  // Safe playback trigger with muted fallback if browser blocks sound
  const safePlay = useCallback(async (videoEl: HTMLVideoElement) => {
    try {
      await videoEl.play();
      setIsPlaying(true);
      setLoading(false);
    } catch {
      // Browser blocked unmuted autoplay, mute and retry
      videoEl.muted = true;
      setIsMuted(true);
      try {
        await videoEl.play();
        setIsPlaying(true);
      } catch (retryErr) {
        console.warn('Playback retry error:', retryErr);
      }
      setLoading(false);
    }
  }, []);

  // Play HLS stream via Hls.js or native Safari
  const playHls = useCallback(
    (streamUrl: string, videoEl: HTMLVideoElement) => {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 30,
        });
        hlsRef.current = hls;
        hls.loadSource(streamUrl);
        hls.attachMedia(videoEl);

        hls.once(Hls.Events.MANIFEST_PARSED, () => {
          safePlay(videoEl);
        });

        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            console.warn('HLS fatal error:', data.type);
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              hls.startLoad();
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError();
            } else {
              setError('Stream is currently unavailable. Please try another channel.');
              setLoading(false);
            }
          }
        });
      } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        videoEl.src = streamUrl;
        safePlay(videoEl);
      } else {
        videoEl.src = streamUrl;
        safePlay(videoEl);
      }
    },
    [safePlay]
  );

  // Play MPEG-DASH MPD with optional ClearKey DRM
  const playMpd = useCallback(
    async (channel: SingaporeChannel, videoEl: HTMLVideoElement) => {
      const shaka = (window as any).shaka;
      if (!shaka) {
        throw new Error('Shaka player not loaded yet');
      }

      shaka.polyfill.installAll();
      if (!shaka.Player.isBrowserSupported()) {
        // Fallback for browsers that don't support DASH (e.g. iOS Safari)
        if (channel.altHls) {
          playHls(channel.altHls, videoEl);
          return;
        }
        throw new Error('MPEG-DASH is not supported on this browser');
      }

      if (!shakaRef.current) {
        const player = new shaka.Player(videoEl);
        player.addEventListener('error', (event: any) => {
          console.warn('Shaka Player error:', event.detail);
        });
        shakaRef.current = player;
      }

      const player = shakaRef.current;

      // Configure ClearKey DRM and streaming buffers
      player.configure({
        drm: {
          clearKeys: channel.clearKeys || {},
        },
        streaming: {
          bufferingGoal: 8,
          rebufferingGoal: 2,
        },
      });

      const mpdUrl = channel.mpdUrl || channel.url;
      await player.load(mpdUrl);
      await safePlay(videoEl);
    },
    [playHls, safePlay]
  );

  // Main playback controller
  useEffect(() => {
    if (!currentChannel) return;

    let isCancelled = false;
    setLoading(true);
    setError('');

    const runStream = async () => {
      await stopEngines();
      if (isCancelled) return;

      // 1. Radio / Audio channel
      if (currentChannel.streamType === 'audio') {
        const audioEl = audioRef.current;
        if (audioEl) {
          audioEl.src = currentChannel.url;
          audioEl
            .play()
            .then(() => {
              if (!isCancelled) {
                setIsPlaying(true);
                setLoading(false);
              }
            })
            .catch(() => {
              if (!isCancelled) setLoading(false);
            });
        }
        return;
      }

      // 2. YouTube Live fallback
      if (activeSource === 'youtube' && currentChannel.youtubeId) {
        setLoading(false);
        setIsPlaying(true);
        return;
      }

      const videoEl = videoRef.current;
      if (!videoEl) return;

      // 3. Alt HLS requested or primary
      if (activeSource === 'altHls' && currentChannel.altHls) {
        playHls(currentChannel.altHls, videoEl);
        return;
      }

      // 4. Default / MPD
      const preferMpd =
        activeSource === 'mpd' ||
        (activeSource === 'default' && currentChannel.streamType === 'mpd');

      if (preferMpd) {
        if (!shakaReady && typeof window !== 'undefined' && !(window as any).shaka) {
          // If Shaka hasn't finished loading yet and Alt HLS exists, play Alt HLS first
          if (currentChannel.altHls) {
            playHls(currentChannel.altHls, videoEl);
            return;
          }
          // Otherwise wait for script load
          return;
        }

        try {
          await playMpd(currentChannel, videoEl);
        } catch (err: any) {
          console.warn('MPD playback failed, falling back:', err);
          if (isCancelled) return;
          if (currentChannel.altHls) {
            setActiveSource('altHls');
            playHls(currentChannel.altHls, videoEl);
          } else if (currentChannel.youtubeId) {
            setActiveSource('youtube');
          } else {
            setError(
              err.message || 'Stream playback error. Please try another channel or source.'
            );
            setLoading(false);
          }
        }
        return;
      }

      // 5. Default HLS (e.g. CNA direct CloudFront)
      const targetUrl = currentChannel.altHls || currentChannel.url;
      playHls(targetUrl, videoEl);
    };

    runStream();

    return () => {
      isCancelled = true;
    };
  }, [currentChannel, activeSource, shakaReady, stopEngines, playHls, playMpd]);

  // Clean up Shaka Player on unmount
  useEffect(() => {
    return () => {
      if (shakaRef.current) {
        try {
          shakaRef.current.destroy();
        } catch {}
        shakaRef.current = null;
      }
    };
  }, []);

  // Channel switcher helper: resets activeSource to optimal default
  const handleSelectChannel = (channel: SingaporeChannel) => {
    setCurrentChannel(channel);
    if (channel.streamType === 'audio') {
      setActiveSource('default');
    } else if (channel.streamType === 'mpd') {
      setActiveSource('mpd');
    } else {
      setActiveSource('default');
    }
  };

  // Keyboard navigation & controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

      if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        if (videoRef.current) {
          if (videoRef.current.paused) {
            videoRef.current.play();
            setIsPlaying(true);
          } else {
            videoRef.current.pause();
            setIsPlaying(false);
          }
        }
      } else if (e.key === 'f') {
        e.preventDefault();
        if (!document.fullscreenElement) {
          playerWrapperRef.current?.requestFullscreen?.();
        } else {
          document.exitFullscreen?.();
        }
      } else if (e.key === 'm') {
        e.preventDefault();
        if (videoRef.current) {
          videoRef.current.muted = !videoRef.current.muted;
          setIsMuted(videoRef.current.muted);
        }
      } else if (e.key === '[' || e.key === ']') {
        e.preventDefault();
        const currentIndex = channels.findIndex((c) => c.id === currentChannel.id);
        const nextIndex =
          e.key === ']'
            ? (currentIndex + 1) % channels.length
            : (currentIndex - 1 + channels.length) % channels.length;
        handleSelectChannel(channels[nextIndex]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [channels, currentChannel]);

  // Filter channels by category and search
  const filteredChannels = useMemo(() => {
    const q = search.trim().toLowerCase();
    return channels.filter((c) => {
      const matchCat = category === 'all' || c.category === category;
      const matchQuery =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.language.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q);
      return matchCat && matchQuery;
    });
  }, [channels, category, search]);

  const currentEpg = currentChannel.epgId ? epgData[currentChannel.epgId] : undefined;

  return (
    <div className="min-h-screen flex flex-col bg-surface text-content">
      {/* Load Shaka Player Compiled Bundle */}
      <Script
        src="/libs/shaka-player.compiled.js"
        strategy="afterInteractive"
        onLoad={() => {
          setShakaReady(true);
        }}
      />

      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-4 space-y-5">
        {/* Top Player Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Video / Audio Player Viewport */}
          <div className="lg:col-span-2 space-y-3">
            <div
              ref={playerWrapperRef}
              className="relative aspect-video bg-black rounded-xl overflow-hidden shadow-2xl flex items-center justify-center border border-line group"
            >
              {currentChannel.streamType === 'audio' ? (
                /* Live Radio Audio Mode */
                <div className="flex flex-col items-center justify-center p-6 text-center space-y-4">
                  <div className="w-24 h-24 rounded-2xl overflow-hidden shadow-lg border border-line bg-surface-raised flex items-center justify-center p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={currentChannel.logo}
                      alt={currentChannel.name}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">{currentChannel.name}</h3>
                    <p className="text-sm text-faint mt-1">Live Singapore Radio (AAC HD Audio)</p>
                  </div>
                  {/* Equalizer animation */}
                  <div className="flex items-center gap-1.5 h-8">
                    <span className="w-1.5 bg-accent rounded-full animate-bounce h-6" />
                    <span
                      className="w-1.5 bg-accent rounded-full animate-bounce h-8"
                      style={{ animationDelay: '0.15s' }}
                    />
                    <span
                      className="w-1.5 bg-accent rounded-full animate-bounce h-4"
                      style={{ animationDelay: '0.3s' }}
                    />
                    <span
                      className="w-1.5 bg-accent rounded-full animate-bounce h-7"
                      style={{ animationDelay: '0.45s' }}
                    />
                    <span
                      className="w-1.5 bg-accent rounded-full animate-bounce h-5"
                      style={{ animationDelay: '0.2s' }}
                    />
                  </div>
                  <audio ref={audioRef} controls className="w-full max-w-md mt-2" />
                </div>
              ) : activeSource === 'youtube' && currentChannel.youtubeId ? (
                /* YouTube Live Fallback */
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/live_stream?channel=${currentChannel.youtubeId}&autoplay=1`}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              ) : (
                /* Video Player */
                <>
                  <video
                    ref={videoRef}
                    className="w-full h-full object-contain"
                    controls
                    playsInline
                    autoPlay
                    onVolumeChange={() => {
                      if (videoRef.current) {
                        setIsMuted(videoRef.current.muted);
                      }
                    }}
                  />

                  {/* Unmute Overlay if sound was blocked by browser policy */}
                  {isMuted && (
                    <button
                      onClick={() => {
                        if (videoRef.current) {
                          videoRef.current.muted = false;
                          setIsMuted(false);
                        }
                      }}
                      className="absolute top-3 right-3 px-3 py-1.5 bg-black/80 hover:bg-black text-white text-xs font-medium rounded-full border border-line flex items-center gap-1.5 shadow-lg backdrop-blur z-20 transition-transform hover:scale-105"
                    >
                      <span>🔊</span>
                      <span>Click to Unmute</span>
                    </button>
                  )}

                  {/* Loading Spinner */}
                  {loading && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2 z-10">
                      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                      <p className="text-xs text-faint">Buffering live broadcast...</p>
                    </div>
                  )}

                  {/* Error Overlay with Fallback Options */}
                  {error && (
                    <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center p-6 text-center z-10 space-y-3">
                      <p className="text-danger text-sm max-w-md">{error}</p>
                      <div className="flex items-center gap-2">
                        {currentChannel.altHls && activeSource !== 'altHls' && (
                          <button
                            className="btn-primary btn-sm"
                            onClick={() => setActiveSource('altHls')}
                          >
                            Switch to Alt HLS
                          </button>
                        )}
                        {currentChannel.youtubeId && activeSource !== 'youtube' && (
                          <button
                            className="btn-secondary btn-sm"
                            onClick={() => setActiveSource('youtube')}
                          >
                            Watch on YouTube Live
                          </button>
                        )}
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => handleSelectChannel({ ...currentChannel })}
                        >
                          Retry
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Now Playing Bar & Source Switcher */}
            <div className="bg-surface-raised border border-line rounded-xl p-4 space-y-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={currentChannel.logo}
                    alt={currentChannel.name}
                    className="w-12 h-12 object-contain rounded-lg p-1 bg-surface border border-line"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-content">
                        {currentChannel.name}
                      </h2>
                      <span className="tag text-xs bg-accent/20 text-accent font-medium">
                        {activeSource === 'altHls' ? 'Alt HLS' : currentChannel.tag}
                      </span>
                    </div>
                    <p className="text-xs text-faint line-clamp-1 mt-0.5">
                      {currentEpg ? currentEpg.title : currentChannel.description}
                    </p>
                  </div>
                </div>

                {currentEpg && (
                  <div className="w-full sm:w-64 space-y-1">
                    <div className="flex justify-between text-xs text-faint">
                      <span>{currentEpg.timeFormatted}</span>
                      <span>{currentEpg.progress}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-line rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent transition-all duration-300"
                        style={{ width: `${currentEpg.progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Source Switcher Pills */}
              {availableSources.length > 1 && (
                <div className="pt-2 border-t border-line/60 flex items-center gap-2 overflow-x-auto scrollbar-none">
                  <span className="text-xs text-faint whitespace-nowrap">Source Stream:</span>
                  {availableSources.map((src) => {
                    const isSelected = activeSource === src.id;
                    return (
                      <button
                        key={src.id}
                        onClick={() => setActiveSource(src.id)}
                        className={cn(
                          'px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                          isSelected
                            ? 'bg-accent text-accent-contrast shadow-sm'
                            : 'bg-surface text-muted hover:text-content hover:bg-hover border border-line'
                        )}
                      >
                        {src.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Quick Info & Tips */}
          <div className="bg-surface-raised border border-line rounded-xl p-4 flex flex-col space-y-3">
            <h3 className="font-semibold text-sm text-content flex items-center gap-2">
              <span>🇸🇬</span> Singapore Free-to-Air & FAST Channels
            </h3>
            <p className="text-xs text-muted leading-relaxed">
              Live broadcast feeds including Mediacorp Channel 5, Channel 8, Channel U, Suria,
              Vasantham, CNA, FAST 24/7 entertainment, and crystal-clear Singapore AAC radio
              stations.
            </p>
            <div className="p-3 bg-surface rounded-lg border border-line text-xs space-y-1.5 text-faint">
              <p>
                📺 <strong>Full Screen:</strong> Press <kbd className="px-1 py-0.5 bg-surface-raised rounded border border-line">F</kbd> or double-click video
              </p>
              <p>
                ⏭️ <strong>Switch Channels:</strong> Press <kbd className="px-1 py-0.5 bg-surface-raised rounded border border-line">[</kbd> or <kbd className="px-1 py-0.5 bg-surface-raised rounded border border-line">]</kbd>
              </p>
              <p>
                🔇 <strong>Mute / Unmute:</strong> Press <kbd className="px-1 py-0.5 bg-surface-raised rounded border border-line">M</kbd>
              </p>
              <p>
                📱 <strong>Mobile & TV:</strong> Runs as full-screen PWA on all devices
              </p>
              <p>
                📻 <strong>Radio:</strong> 24/7 background audio without screen lock
              </p>
            </div>
          </div>
        </div>

        {/* Categories & Search Filter */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
          {/* Category Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: 'all', label: 'All Channels' },
              { id: 'fta', label: '🇸🇬 Free-to-Air' },
              { id: 'entertainment', label: '🎬 Entertainment' },
              { id: 'music', label: '🎵 Music' },
              { id: 'sports', label: '⚽ Sports' },
              { id: 'kids', label: '🧸 Kids' },
              { id: 'radio', label: '📻 Live Radio' },
            ].map((tab) => (
              <button
                key={tab.id}
                className={cn(
                  'px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
                  category === tab.id
                    ? 'bg-accent text-accent-contrast shadow-sm'
                    : 'bg-surface-raised text-muted hover:text-content hover:bg-hover border border-line'
                )}
                onClick={() => setCategory(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="w-full sm:w-64">
            <input
              type="text"
              placeholder="Search Singapore channels..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input w-full h-8 text-xs"
            />
          </div>
        </div>

        {/* Channel Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 pb-8">
          {filteredChannels.map((channel) => {
            const isActive = currentChannel.id === channel.id;
            const liveShow =
              channel.epgId && epgData[channel.epgId]
                ? epgData[channel.epgId].title
                : channel.tag;

            return (
              <div
                key={channel.id}
                role="button"
                tabIndex={0}
                onClick={() => handleSelectChannel(channel)}
                className={cn(
                  'card flex flex-col items-center text-center p-3 cursor-pointer transition-all duration-200 group border',
                  isActive
                    ? 'border-accent bg-accent/5 ring-1 ring-accent'
                    : 'border-line hover:border-accent/40 hover:bg-hover'
                )}
              >
                <div className="w-14 h-14 rounded-xl bg-surface p-1 flex items-center justify-center mb-2 overflow-hidden border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={channel.logo}
                    alt={channel.name}
                    className="w-full h-full object-contain transition-transform group-hover:scale-105"
                    loading="lazy"
                  />
                </div>
                <h4 className="text-xs font-semibold text-content line-clamp-1">{channel.name}</h4>
                <p className="text-[11px] text-faint line-clamp-1 mt-0.5">{liveShow}</p>
                <span className="mt-2 tag text-[10px] bg-line/60 text-muted px-1.5 py-0.5 rounded">
                  {channel.language}
                </span>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
