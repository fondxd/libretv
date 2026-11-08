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

  // Android TV / API Modal
  const [showApiModal, setShowApiModal] = useState<boolean>(false);
  const [copiedField, setCopiedField] = useState<string>('');
  const [apiOrigin, setApiOrigin] = useState<string>('https://libretv-stream.onrender.com');
  const [activeApiTab, setActiveApiTab] = useState<'tivimate' | 'vlc' | 'dev'>('tivimate');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playerWrapperRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const shakaRef = useRef<any>(null);

  // Set window origin on client
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setApiOrigin(window.location.origin);
      if ((window as any).shaka) {
        setShakaReady(true);
      }
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
          if (currentChannel.altHls) {
            playHls(currentChannel.altHls, videoEl);
            return;
          }
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

  // Copy helper
  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(''), 2000);
    });
  };

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

  const m3uUrl = `${apiOrigin}/api/singapore/playlist.m3u`;
  const epgXmlUrl = `${apiOrigin}/api/singapore/epg.xml`;
  const jsonApiUrl = `${apiOrigin}/api/singapore/channels`;

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

          {/* Quick Info & Tips + Android TV Setup */}
          <div className="bg-surface-raised border border-line rounded-xl p-4 flex flex-col space-y-3">
            <h3 className="font-semibold text-sm text-content flex items-center gap-2">
              <span>🇸🇬</span> Singapore Free-to-Air & FAST Channels
            </h3>
            <p className="text-xs text-muted leading-relaxed">
              Live broadcast feeds including Mediacorp Channel 5, Channel 8, Channel U, Suria,
              Vasantham, CNA, FAST 24/7 entertainment, and crystal-clear Singapore AAC radio
              stations.
            </p>

            {/* Android TV & Mobile Setup Callout */}
            <div className="p-3 bg-accent/10 border border-accent/30 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-accent flex items-center gap-1.5">
                  <span>📱</span> Android TV & Mobile API
                </span>
                <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded font-mono">
                  M3U / EPG
                </span>
              </div>
              <p className="text-[11px] text-muted leading-normal">
                Use TiviMate, OTT Navigator, IPTV Smarters, Kodi, or VLC on your Android TV or phone.
              </p>
              <button
                onClick={() => setShowApiModal(true)}
                className="btn-primary w-full text-xs py-1.5 flex items-center justify-center gap-1.5"
              >
                <span>📺</span>
                <span>Get Android TV & API Setup</span>
              </button>
            </div>

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

          {/* Search Box & Quick API Button */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="text"
              placeholder="Search Singapore channels..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input w-full sm:w-60 h-8 text-xs"
            />
            <button
              onClick={() => setShowApiModal(true)}
              className="btn-secondary h-8 px-2.5 text-xs whitespace-nowrap flex items-center gap-1 border-line"
              title="Android TV & API Setup"
            >
              <span>📺</span>
              <span className="hidden sm:inline">IPTV API</span>
            </button>
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

      {/* Android TV & IPTV API Integration Modal */}
      {showApiModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-raised border border-line rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-content flex items-center gap-2">
                  <span>📺</span> Android TV & Mobile IPTV Integration
                </h2>
                <p className="text-xs text-muted mt-1">
                  Connect Singapore Live TV & Radio directly into your Android TV or Android IPTV player.
                </p>
              </div>
              <button
                onClick={() => setShowApiModal(false)}
                className="text-muted hover:text-content p-1.5 rounded-lg hover:bg-hover text-sm"
              >
                ✕
              </button>
            </div>

            {/* Endpoints Quick Copy Grid */}
            <div className="space-y-3">
              {/* M3U Playlist */}
              <div className="p-3 bg-surface rounded-xl border border-line space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-content flex items-center gap-1.5">
                    <span className="text-accent">●</span> M3U Playlist URL (TiviMate, Kodi, VLC, OTT)
                  </span>
                  <button
                    onClick={() => copyToClipboard(m3uUrl, 'm3u')}
                    className="btn-primary btn-sm text-[11px] py-0.5 px-2.5 h-6"
                  >
                    {copiedField === 'm3u' ? 'Copied! ✓' : 'Copy URL'}
                  </button>
                </div>
                <p className="text-[11px] font-mono text-faint break-all bg-surface-raised p-2 rounded border border-line select-all">
                  {m3uUrl}
                </p>
              </div>

              {/* XMLTV EPG */}
              <div className="p-3 bg-surface rounded-xl border border-line space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-content flex items-center gap-1.5">
                    <span className="text-accent">●</span> XMLTV EPG URL (Electronic TV Guide)
                  </span>
                  <button
                    onClick={() => copyToClipboard(epgXmlUrl, 'epg')}
                    className="btn-secondary btn-sm text-[11px] py-0.5 px-2.5 h-6"
                  >
                    {copiedField === 'epg' ? 'Copied! ✓' : 'Copy URL'}
                  </button>
                </div>
                <p className="text-[11px] font-mono text-faint break-all bg-surface-raised p-2 rounded border border-line select-all">
                  {epgXmlUrl}
                </p>
              </div>

              {/* JSON REST API */}
              <div className="p-3 bg-surface rounded-xl border border-line space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-content flex items-center gap-1.5">
                    <span className="text-accent">●</span> JSON REST API (Android App Devs / Custom Code)
                  </span>
                  <button
                    onClick={() => copyToClipboard(jsonApiUrl, 'json')}
                    className="btn-secondary btn-sm text-[11px] py-0.5 px-2.5 h-6"
                  >
                    {copiedField === 'json' ? 'Copied! ✓' : 'Copy URL'}
                  </button>
                </div>
                <p className="text-[11px] font-mono text-faint break-all bg-surface-raised p-2 rounded border border-line select-all">
                  {jsonApiUrl}
                </p>
              </div>
            </div>

            {/* Instruction Tabs */}
            <div className="space-y-3 pt-2 border-t border-line">
              <div className="flex items-center gap-2">
                {[
                  { id: 'tivimate', label: 'TiviMate (Android TV)' },
                  { id: 'vlc', label: 'VLC / OTT Navigator' },
                  { id: 'dev', label: 'Android Developer (ExoPlayer)' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveApiTab(tab.id as any)}
                    className={cn(
                      'px-3 py-1 text-xs rounded-lg font-medium transition-colors',
                      activeApiTab === tab.id
                        ? 'bg-accent text-accent-contrast shadow-sm'
                        : 'bg-surface text-muted hover:text-content border border-line'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab Contents */}
              <div className="p-3 bg-surface rounded-xl border border-line text-xs text-muted leading-relaxed space-y-2">
                {activeApiTab === 'tivimate' && (
                  <div className="space-y-1.5">
                    <p className="font-semibold text-content">How to setup on TiviMate on Android TV:</p>
                    <ol className="list-decimal list-inside space-y-1 pl-1 text-[11px]">
                      <li>Open <strong>TiviMate</strong> on your Android TV device.</li>
                      <li>Go to <strong>Settings</strong> → <strong>Playlists</strong> → <strong>Add playlist</strong>.</li>
                      <li>Select <strong>M3U playlist</strong> → enter the M3U URL above.</li>
                      <li>In <strong>TV guide (EPG)</strong>, enter the XMLTV EPG URL above.</li>
                      <li>Click <strong>Done</strong>. Channels will appear with logos and program schedule!</li>
                    </ol>
                  </div>
                )}

                {activeApiTab === 'vlc' && (
                  <div className="space-y-1.5">
                    <p className="font-semibold text-content">How to stream in VLC or OTT Navigator:</p>
                    <ol className="list-decimal list-inside space-y-1 pl-1 text-[11px]">
                      <li>Open <strong>VLC for Android</strong> on your phone or Android TV.</li>
                      <li>Tap the <strong>More</strong> tab at the bottom → <strong>New stream</strong>.</li>
                      <li>Paste the M3U Playlist URL and press enter.</li>
                      <li>All channels (Free-to-Air, FAST movies, and Radio) will load into your playlist immediately.</li>
                    </ol>
                  </div>
                )}

                {activeApiTab === 'dev' && (
                  <div className="space-y-2">
                    <p className="font-semibold text-content">How to use in Kotlin / Android ExoPlayer:</p>
                    <pre className="p-2.5 bg-black/60 rounded border border-line text-[11px] font-mono text-faint overflow-x-auto">
{`// 1. Fetch channel list:
val url = URL("${jsonApiUrl}")
val json = url.readText()

// 2. Play stream in ExoPlayer (HLS or Alt HLS):
val player = ExoPlayer.Builder(context).build()
val mediaItem = MediaItem.Builder()
    .setUri("${apiOrigin}/api/singapore/hls/ch8")
    .setMimeType(MimeTypes.APPLICATION_M3U8)
    .build()

player.setMediaItem(mediaItem)
player.prepare()
player.play()`}
                    </pre>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Close */}
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowApiModal(false)}
                className="btn-primary btn-sm px-4"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
