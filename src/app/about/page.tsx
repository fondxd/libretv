'use client';

import { Header } from '@/components/header';
import { SiteFooter } from '@/components/site-footer';

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-10 space-y-8">
        <section>
          <h1 className="text-xl font-bold text-content mb-3">About LibreTV</h1>
          <p className="text-sm text-muted leading-relaxed">
            LibreTV is a free online video search and streaming platform. Simply search for any title across aggregated streaming sources.
            No registration required, no embedded ads, and no video files stored on servers. All content is streamed from third-party public APIs.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-content mb-2.5">Keyboard Shortcuts</h2>
          <ul className="text-sm text-muted space-y-1.5 list-disc list-inside">
            <li><code className="text-accent">Space</code> Play / Pause</li>
            <li><code className="text-accent">←</code> / <code className="text-accent">→</code> Rewind / Fast-forward 5s</li>
            <li><code className="text-accent">↑</code> / <code className="text-accent">↓</code> Volume Up / Down</li>
            <li><code className="text-accent">F</code> Toggle Fullscreen</li>
            <li><code className="text-accent">Alt + ←/→</code> Previous / Next Episode</li>
            <li>Long press video on mobile for 3x speed</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-content mb-2.5">Privacy & Data</h2>
          <p className="text-sm text-muted leading-relaxed">
            Your search history and playback progress are stored solely within your device browser (IndexedDB) and are never uploaded to the server.
            Search requests are proxied server-side so third-party sources cannot inspect your client IP address.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-content mb-2.5">Disclaimer</h2>
          <p className="text-sm text-faint leading-relaxed">
            This project does not store or produce any media content; it only aggregates and plays streams from public third-party APIs.
            Please respect intellectual property rights. Legal compliance rests with respective data sources.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
