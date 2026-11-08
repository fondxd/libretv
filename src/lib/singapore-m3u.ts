import { SINGAPORE_CHANNELS, type SingaporeChannel } from './singapore-channels';

export interface M3uOptions {
  mode?: 'universal' | 'kodi' | 'dash';
  category?: string;
  includeRadio?: boolean;
}

/**
 * Generate standard IPTV M3U / M3U8 playlist for Android TV & Mobile IPTV players
 * (TiviMate, OTT Navigator, IPTV Smarters, Kodi, VLC, etc.)
 */
export function generateSingaporeM3u(baseUrl: string, options: M3uOptions = {}): string {
  const { mode = 'universal', category, includeRadio = true } = options;
  const esc = (s: string) => (s || '').replace(/"/g, "'");

  const lines: string[] = [
    '#EXTM3U',
    `#PLAYLIST:Singapore Live TV & Radio`,
    `#EXT-X-TVG-URL:${baseUrl}/api/singapore/epg.xml`,
  ];

  let channels = SINGAPORE_CHANNELS;
  if (!includeRadio) {
    channels = channels.filter((c) => c.category !== 'radio');
  }
  if (category && category !== 'all') {
    channels = channels.filter((c) => c.category === category);
  }

  for (const c of channels) {
    const epgId = c.epgId || c.id;
    const group = c.categoryLabel || 'Singapore';
    const logo = c.logo || '';

    let streamUrl = c.url;

    if (mode === 'universal') {
      // In universal mode, prefer Alt HLS for Ch 5, Ch 8, Ch U so all Android TV players can play without DRM issues
      if (c.altHls) {
        streamUrl = c.altHls.startsWith('/') ? `${baseUrl}${c.altHls}` : c.altHls;
      } else {
        streamUrl = c.url;
      }
    } else if (mode === 'dash') {
      // Direct DASH MPD streams
      streamUrl = c.mpdUrl || c.url;
    } else if (mode === 'kodi') {
      streamUrl = c.mpdUrl || c.url;
    }

    if (streamUrl.startsWith('/')) {
      streamUrl = `${baseUrl}${streamUrl}`;
    }

    // Kodi / TiviMate ClearKey DRM properties
    if (c.clearKeys && c.streamType === 'mpd' && (mode === 'kodi' || mode === 'dash')) {
      const firstKid = Object.keys(c.clearKeys)[0];
      const key = c.clearKeys[firstKid];
      lines.push('#KODIPROP:inputstream.adaptive.manifest_type=mpd');
      lines.push('#KODIPROP:inputstream.adaptive.license_type=clearkey');
      lines.push(`#KODIPROP:inputstream.adaptive.license_key=${firstKid}:${key}`);
    }

    const attrs = [
      `tvg-id="${esc(epgId)}"`,
      `tvg-name="${esc(c.name)}"`,
      logo ? `tvg-logo="${esc(logo)}"` : '',
      `group-title="${esc(group)}"`,
    ]
      .filter(Boolean)
      .join(' ');

    lines.push(`#EXTINF:-1 ${attrs},${c.name}`);
    lines.push(streamUrl);
  }

  return lines.join('\n');
}
