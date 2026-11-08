import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

let epgXmlCache = {
  xml: '',
  lastFetched: 0,
};

export async function GET() {
  const now = Date.now();
  if (now - epgXmlCache.lastFetched < 30 * 60 * 1000 && epgXmlCache.xml) {
    return new NextResponse(epgXmlCache.xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': 'inline; filename="singapore-epg.xml"',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=1800',
      },
    });
  }

  try {
    const res = await fetch(
      'https://raw.githubusercontent.com/dbghelp/mewatch-EPG/refs/heads/main/mewatch.xml',
      {
        next: { revalidate: 1800 },
      }
    );

    if (!res.ok) {
      if (epgXmlCache.xml) {
        return new NextResponse(epgXmlCache.xml, {
          headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      return new NextResponse('Failed to load upstream EPG', { status: 502 });
    }

    const xml = await res.text();
    epgXmlCache = {
      xml,
      lastFetched: now,
    };

    return new NextResponse(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': 'inline; filename="singapore-epg.xml"',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=1800',
      },
    });
  } catch (err: unknown) {
    if (epgXmlCache.xml) {
      return new NextResponse(epgXmlCache.xml, {
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
    const message = err instanceof Error ? err.message : 'Error fetching EPG XML';
    return new NextResponse(message, { status: 500 });
  }
}
