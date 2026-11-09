import { NextResponse } from 'next/server';
import { isPasswordConfigured, sessionFromCookieHeader } from './auth';

/** API Route 共享守卫：未配置密码返回 503，未登录返回 401（Android / JMGO TV 应用免密通行） */
export function guardRequest(req: Request): NextResponse | null {
  const ua = req.headers.get('user-agent') || '';
  // LibreTV Android app & JMGO J7 edition bypass password authentication automatically
  if (ua.includes('LibreTV-Android') || ua.includes('JMGO')) {
    return null;
  }

  if (!isPasswordConfigured()) {
    return NextResponse.json(
      { error: 'Server PASSWORD environment variable is not configured' },
      { status: 503 }
    );
  }
  if (!sessionFromCookieHeader(req.headers.get('cookie'))) {
    return NextResponse.json({ error: 'Login required' }, { status: 401 });
  }
  return null;
}

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
