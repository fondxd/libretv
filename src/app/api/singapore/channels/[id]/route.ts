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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const baseUrl = getBaseUrl(req);

  const channel = SINGAPORE_CHANNELS.find(
    (c) => c.id.toLowerCase() === id.toLowerCase()
  );

  if (!channel) {
    return NextResponse.json(
      {
        success: false,
        error: `Channel '${id}' not found`,
      },
      { status: 404 }
    );
  }

  const enriched = {
    ...channel,
    altHls: channel.altHls
      ? channel.altHls.startsWith('/')
        ? `${baseUrl}${channel.altHls}`
        : channel.altHls
      : undefined,
    fallbackHls: channel.fallbackHls
      ? channel.fallbackHls.startsWith('/')
        ? `${baseUrl}${channel.fallbackHls}`
        : channel.fallbackHls
      : undefined,
  };

  return NextResponse.json(
    {
      success: true,
      channel: enriched,
    },
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=60',
      },
    }
  );
}
