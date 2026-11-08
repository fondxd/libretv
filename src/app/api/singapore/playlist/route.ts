import { NextRequest, NextResponse } from 'next/server';
import { generateSingaporeM3u } from '@/lib/singapore-m3u';
import { SINGAPORE_CHANNELS } from '@/lib/singapore-channels';

export const runtime = 'nodejs';

function getBaseUrl(req: Request): string {
  const host =
    req.headers.get('x-forwarded-host') ||
    req.headers.get('host') ||
    'libretv-stream.onrender.com';
  const proto =
    req.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export async function GET(req: NextRequest) {
  const baseUrl = getBaseUrl(req);
  const sp = req.nextUrl.searchParams;
  const format = sp.get('format') || 'm3u';
  const mode = (sp.get('mode') as 'universal' | 'kodi' | 'dash') || 'universal';
  const category = sp.get('category') || undefined;
  const includeRadio = sp.get('radio') !== '0';

  if (format === 'json') {
    return NextResponse.json({
      success: true,
      playlistUrl: `${baseUrl}/api/singapore/playlist.m3u`,
      epgUrl: `${baseUrl}/api/singapore/epg.xml`,
      channels: SINGAPORE_CHANNELS,
    });
  }

  const m3uText = generateSingaporeM3u(baseUrl, {
    mode,
    category,
    includeRadio,
  });

  return new NextResponse(m3uText, {
    status: 200,
    headers: {
      'Content-Type': 'audio/x-mpegurl; charset=utf-8',
      'Content-Disposition': 'inline; filename="singapore-tv.m3u"',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
