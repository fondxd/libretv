'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import Hls from 'hls.js';
import { Header } from '@/components/header';
import { SINGAPORE_CHANNELS, type SingaporeChannel } from '@/lib/singapore-channels';
import { cn } from '@/lib/utils';

export default function SingaporeStreamingPage() {
  const [channels] = useState<SingaporeChannel[]>(SINGAPORE_CHANNELS);
  const [currentChannel, setCurrentChannel] = useState<SingaporeChannel>(SINGAPORE_CHANNELS[0]);
  const [category, setCategory] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [epgData, setEpgData] = useState<Record<string, { title: string; desc: string; progress: number; timeFormatted: string }>>({});
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Fetch EPG data
  useEffect(() => {
    fetch('/api/singapore')
      .then((res) => res.json())
      .then((data) => {
        if (data.epg) setEpgData(data.epg);
      })
      .catch((err) => console.warn('EPG load error:', err));
  }, []);

  // Handle stream playback
  useEffect(() => {
    if (!currentChannel) return;
    setLoading(true);
    setError('');

    // Stop existing HLS
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (currentChannel.streamType === 'audio') {
      // Audio playback
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = '';
      }
      if (audioRef.current) {
        audioRef.current.src = currentChannel.url;
        audioRef.current.play().then(() => {
          setIsPlaying(true);
          setLoading(false);
        }).catch((err) => {
          console.warn('Audio play notice:', err);
          setLoading(false);
        });
      }
    } else {
      // Video playback
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      const videoEl = videoRef.current;
      if (!videoEl) return;

      const streamUrl = currentChannel.altHls || currentChannel.url;

      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
        });
        hlsRef.current = hls;
        hls.loadSource(streamUrl);
        hls.attachMedia(videoEl);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          videoEl.play().then(() => {
            setIsPlaying(true);
            setLoading(false);
          }).catch(() => {
            // Autoplay with sound may be blocked by browser; mute and retry
            videoEl.muted = true;
            setIsMuted(true);
            videoEl.play().catch(() => {});
            setLoading(false);
          });
        });
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            console.warn('HLS fatal error:', data);
            setError('Stream unavailable or requires local proxy. Try another channel.');
            setLoading(false);
          }
        });
      } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        // Native Safari HLS
        videoEl.src = streamUrl;
        videoEl.play().catch(() => {
          videoEl.muted = true;
          setIsMuted(true);
          videoEl.play().catch(() => {});
        });
        setLoading(false);
      } else {
        videoEl.src = streamUrl;
        videoEl.play().catch(() => {});
        setLoading(false);
      }
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [currentChannel]);

  const filteredChannels = useMemo(() => {
    return channels.filter((c) => {
      const matchCat = category === 'all' || c.category === category;
      const matchQuery =
        !search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.language.toLowerCase().includes(search.toLowerCase()) ||
        c.description.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchQuery;
    });
  }, [channels, category, search]);

  const currentEpg = currentChannel.epgId ? epgData[currentChannel.epgId] : undefined;

  return (
    <div className="min-h-screen flex flex-col bg-surface text-content">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-4 space-y-5">
        {/* Top Player Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Video / Audio Player Viewport */}
          <div className="lg:col-span-2 space-y-3">
            <div className="relative aspect-video bg-black rounded-xl overflow-hidden shadow-2xl flex items-center justify-center border border-line">
              {currentChannel.streamType === 'audio' ? (
                <div className="flex flex-col items-center justify-center p-6 text-center space-y-4">
                  <div className="w-24 h-24 rounded-2xl overflow-hidden shadow-lg border border-line bg-surface-raised flex items-center justify-center p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={currentChannel.logo} alt={currentChannel.name} className="w-full h-full object-contain" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">{currentChannel.name}</h3>
                    <p className="text-sm text-faint mt-1">Live Radio Stream (Crystal-clear AAC)</p>
                  </div>
                  {/* Animated Audio Equalizer Bars */}
                  <div className="flex items-center gap-1.5 h-8">
                    <span className="w-1.5 bg-accent rounded-full animate-bounce h-6" />
                    <span className="w-1.5 bg-accent rounded-full animate-bounce h-8" style={{ animationDelay: '0.15s' }} />
                    <span className="w-1.5 bg-accent rounded-full animate-bounce h-4" style={{ animationDelay: '0.3s' }} />
                    <span className="w-1.5 bg-accent rounded-full animate-bounce h-7" style={{ animationDelay: '0.45s' }} />
                    <span className="w-1.5 bg-accent rounded-full animate-bounce h-5" style={{ animationDelay: '0.2s' }} />
                  </div>
                  <audio ref={audioRef} controls className="w-full max-w-md mt-2" />
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    className="w-full h-full object-contain"
                    controls
                    playsInline
                    autoPlay
                  />
                  {loading && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                  {error && (
                    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-4 text-center">
                      <p className="text-danger text-sm mb-2">{error}</p>
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => setCurrentChannel({ ...currentChannel })}
                      >
                        Retry
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Now Playing Bar */}
            <div className="bg-surface-raised border border-line rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={currentChannel.logo}
                  alt={currentChannel.name}
                  className="w-12 h-12 object-contain rounded-lg p-1 bg-surface border border-line"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-content">{currentChannel.name}</h2>
                    <span className="tag text-xs bg-accent/20 text-accent font-medium">
                      {currentChannel.tag}
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
          </div>

          {/* Quick Info & Features */}
          <div className="bg-surface-raised border border-line rounded-xl p-4 flex flex-col space-y-3">
            <h3 className="font-semibold text-sm text-content flex items-center gap-2">
              <span>🇸🇬</span> Singapore Free-to-Air & FAST Channels
            </h3>
            <p className="text-xs text-muted leading-relaxed">
              Live broadcast feed including Mediacorp Channel 5, Channel 8, Channel U, Suria, Vasantham, CNA, FAST entertainment, and crystal-clear Singapore AAC radios.
            </p>
            <div className="p-3 bg-surface rounded-lg border border-line text-xs space-y-1 text-faint">
              <p>📺 <strong>Full Screen:</strong> Double click video or press F</p>
              <p>📱 <strong>Mobile & TV:</strong> Runs as full-screen PWA</p>
              <p>📻 <strong>Radio Stations:</strong> 24/7 background audio</p>
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
            const liveShow = channel.epgId && epgData[channel.epgId] ? epgData[channel.epgId].title : channel.tag;

            return (
              <div
                key={channel.id}
                role="button"
                tabIndex={0}
                onClick={() => setCurrentChannel(channel)}
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
