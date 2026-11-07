import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ channel: string; segment: string }> }
) {
  const { channel, segment } = await params;
  const segmentId = segment.replace(/\.ts$/, '');
  const upstreamUrl = `https://cdn6.cc.cd/api/${channel}/${segmentId}`;

  try {
    const res = await fetch(upstreamUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!res.ok) {
      return new NextResponse('Segment not found', { status: res.status });
    }

    const data = await res.arrayBuffer();
    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp2t',
        'Cache-Control': 'public, max-age=60',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error fetching segment';
    return new NextResponse(message, { status: 500 });
  }
}
