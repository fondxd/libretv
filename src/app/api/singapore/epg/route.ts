import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

let epgCache = {
  data: {} as Record<
    string,
    { title: string; desc: string; icon: string; progress: number; timeFormatted: string }
  >,
  lastFetched: 0,
};

async function fetchEPG() {
  const now = Date.now();
  if (now - epgCache.lastFetched < 15 * 60 * 1000 && Object.keys(epgCache.data).length > 0) {
    return epgCache.data;
  }

  try {
    const res = await fetch(
      'https://raw.githubusercontent.com/dbghelp/mewatch-EPG/refs/heads/main/mewatch.xml',
      {
        next: { revalidate: 900 },
      }
    );
    if (!res.ok) return epgCache.data;
    const rawXml = await res.text();

    const parseTime = (str: string) => {
      if (!str) return 0;
      const y = parseInt(str.substring(0, 4));
      const m = parseInt(str.substring(4, 6)) - 1;
      const d = parseInt(str.substring(6, 8));
      const h = parseInt(str.substring(8, 10));
      const min = parseInt(str.substring(10, 12));
      const s = parseInt(str.substring(12, 14));
      return Date.UTC(y, m, d, h, min, s);
    };

    const currentTime = Date.now();
    const regex =
      /<programme channel="([^"]+)" start="([^"]+)" stop="([^"]+)">\s*<title>([\s\S]*?)<\/title>(?:\s*<desc>([\s\S]*?)<\/desc>)?(?:\s*<icon src="([^"]+)" \/>)?/g;
    let match;
    const programs: Record<
      string,
      { title: string; desc: string; icon: string; progress: number; timeFormatted: string }
    > = {};

    while ((match = regex.exec(rawXml)) !== null) {
      const channelId = match[1];
      const startTime = parseTime(match[2]);
      const stopTime = parseTime(match[3]);
      const title = (match[4] || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
      const desc = (match[5] || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
      const icon = match[6] || '';

      if (currentTime >= startTime && currentTime <= stopTime) {
        const totalDuration = stopTime - startTime;
        const elapsed = currentTime - startTime;
        const progress = Math.min(
          100,
          Math.max(0, Math.round((elapsed / totalDuration) * 100))
        );

        programs[channelId] = {
          title,
          desc,
          icon,
          progress,
          timeFormatted: `${new Date(startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(stopTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        };
      }
    }

    epgCache.data = programs;
    epgCache.lastFetched = now;
    return programs;
  } catch (err) {
    console.error('Failed to parse EPG JSON:', err);
    return epgCache.data;
  }
}

export async function GET() {
  const epg = await fetchEPG();
  return NextResponse.json(
    {
      success: true,
      count: Object.keys(epg).length,
      epg,
    },
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=60',
      },
    }
  );
}
