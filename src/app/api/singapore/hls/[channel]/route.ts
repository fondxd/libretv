import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ channel: string }> }
) {
  const { channel } = await params;
  const upstreamUrl = `https://cdn6.cc.cd/163189/${channel}`;

  try {
    const res = await fetch(upstreamUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return new NextResponse('Channel stream not found', { status: res.status });
    }

    const body = await res.text();
    // Rewrite /api/:channel/:segment to /api/singapore/segment/:channel/:segment.ts
    const rewritten = body.replace(
      new RegExp(`/api/${channel}/(\\d+)`, 'g'),
      `/api/singapore/segment/${channel}/$1.ts`
    );

    return new NextResponse(rewritten, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error fetching playlist';
    return new NextResponse(message, { status: 500 });
  }
}
