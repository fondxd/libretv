import { NextRequest, NextResponse } from 'next/server';
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
  const category = sp.get('category');

  let channels = SINGAPORE_CHANNELS;
  if (category && category !== 'all') {
    channels = channels.filter((c) => c.category === category);
  }

  // Enrich with full absolute URLs for mobile & Android apps
  const enrichedChannels = channels.map((c) => ({
    ...c,
    altHls: c.altHls
      ? c.altHls.startsWith('/')
        ? `${baseUrl}${c.altHls}`
        : c.altHls
      : undefined,
    fallbackHls: c.fallbackHls
      ? c.fallbackHls.startsWith('/')
        ? `${baseUrl}${c.fallbackHls}`
        : c.fallbackHls
      : undefined,
  }));

  return NextResponse.json(
    {
      success: true,
      count: enrichedChannels.length,
      endpoints: {
        playlist_m3u: `${baseUrl}/api/singapore/playlist.m3u`,
        epg_xml: `${baseUrl}/api/singapore/epg.xml`,
        epg_json: `${baseUrl}/api/singapore/epg`,
        channels_json: `${baseUrl}/api/singapore/channels`,
      },
      channels: enrichedChannels,
    },
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=60',
      },
    }
  );
}
