export interface SingaporeChannel {
  id: string;
  name: string;
  epgId?: string;
  category: 'fta' | 'entertainment' | 'music' | 'sports' | 'kids' | 'radio';
  categoryLabel: string;
  language: string;
  streamType: 'hls' | 'mpd' | 'audio';
  url: string;
  altHls?: string;
  fallbackHls?: string;
  mpdUrl?: string;
  clearKeys?: Record<string, string>;
  youtubeId?: string;
  mewatchUrl?: string;
  logo: string;
  tag: string;
  description: string;
}

export const SINGAPORE_CHANNELS: SingaporeChannel[] = [
  // --- Free-To-Air (Mediacorp) ---
  {
    id: 'cna',
    name: 'CNA (Channel NewsAsia)',
    epgId: '97072',
    category: 'fta',
    categoryLabel: 'Free-to-Air',
    language: 'English',
    streamType: 'hls',
    url: 'https://d2e1asnsl7br7b.cloudfront.net/7782e205e72f43aeb4a48ec97f66ebbe/index.m3u8',
    altHls: 'https://d2e1asnsl7br7b.cloudfront.net/7782e205e72f43aeb4a48ec97f66ebbe/index.m3u8',
    mpdUrl: 'https://tglmp03.akamaized.net/out/v1/f97b5eedb5ec4b4ea770859bd4e9d28e/manifest.mpd',
    clearKeys: { 'bef2c7c91c7841d3bce5338fe469d302': 'f2bf28552449a758c950e84bddc6f150' },
    youtubeId: 'UC83jt4dlz1Gjl58fzQ5kkGg',
    mewatchUrl: 'https://www.mewatch.sg/channels/cna/97072',
    logo: 'https://prod98.togglestatic.com/shain/v1/dataservice/ResizeImage/$value?Format=\'png\'&Quality=85&ImageId=\'6318766\'&EntityType=\'Item\'&EntityId=\'97072\'&Width=193&Height=249',
    tag: 'Direct HLS',
    description: 'Singapore\'s premier 24-hour Asian news, breaking stories, and business insights.'
  },
  {
    id: 'ch5',
    name: 'Channel 5',
    epgId: '97098',
    category: 'fta',
    categoryLabel: 'Free-to-Air',
    language: 'English',
    streamType: 'mpd',
    url: 'https://mwmpos02.akamaized.net/out/v1/8e5c0396bfbc4a668fac323649dc6aa1/manifest.mpd',
    clearKeys: { '9c7b6aaca62d4dc59567656b371eaa21': '253951f121461cbb6b8aac526438b368' },
    altHls: '/api/singapore/hls/ch5',
    fallbackHls: '/api/singapore/hls/ch5',
    mewatchUrl: 'https://www.mewatch.sg/channels/channel-5/97098',
    logo: 'https://prod98.togglestatic.com/shain/v1/dataservice/ResizeImage/$value?Format=\'png\'&Quality=85&ImageId=\'6318760\'&EntityType=\'Item\'&EntityId=\'97098\'&Width=356&Height=250',
    tag: '1080p HD',
    description: 'English entertainment, dramas, local current affairs & blockbuster films.'
  },
  {
    id: 'ch8',
    name: 'Channel 8 (八频道)',
    epgId: '97104',
    category: 'fta',
    categoryLabel: 'Free-to-Air',
    language: 'Chinese',
    streamType: 'mpd',
    url: 'https://tglmp01.akamaized.net/out/v1/6043d36e1ffb4b52a959fb71b4bbcd31/manifest.mpd',
    clearKeys: { '560e2a97335148708010f6abc6e01ff9': '004327cdad8609155073663a7e404df6' },
    altHls: '/api/singapore/hls/ch8',
    fallbackHls: '/api/singapore/hls/ch8',
    mewatchUrl: 'https://www.mewatch.sg/channels/channel-8/97104',
    logo: 'https://prod98.togglestatic.com/shain/v1/dataservice/ResizeImage/$value?Format=\'png\'&Quality=85&ImageId=\'6318750\'&EntityType=\'Item\'&EntityId=\'97104\'&Width=369&Height=250',
    tag: '1080p HD',
    description: 'Leading 24-hour Chinese channel for dramas, news, variety shows & cultural specials.'
  },
  {
    id: 'chu',
    name: 'Channel U (U频道)',
    epgId: '97129',
    category: 'fta',
    categoryLabel: 'Free-to-Air',
    language: 'Chinese',
    streamType: 'mpd',
    url: 'https://tglmp04.akamaized.net/out/v1/0ba219dbd030477784e4a8104bd9e827/manifest.mpd',
    clearKeys: { '3769532992d643028eedc46cdde65929': '03d5b8832a997377a032bc04c6d18add' },
    altHls: '/api/singapore/hls/chu',
    fallbackHls: '/api/singapore/hls/chu',
    mewatchUrl: 'https://www.mewatch.sg/channels/channel-u/97129',
    logo: 'https://prod98.togglestatic.com/shain/v1/dataservice/ResizeImage/$value?Format=\'png\'&Quality=85&ImageId=\'6318764\'&EntityType=\'Item\'&EntityId=\'97129\'&Width=396&Height=250',
    tag: '1080p HD',
    description: 'Youth-oriented Chinese drama, Asian regional series, and lifestyle content.'
  },
  {
    id: 'suria',
    name: 'Suria',
    epgId: '97084',
    category: 'fta',
    categoryLabel: 'Free-to-Air',
    language: 'Malay',
    streamType: 'mpd',
    url: 'https://tglmp02.akamaized.net/out/v1/0fa7dd7d7b6447478f26db79ea7c5779/manifest.mpd',
    clearKeys: { 'ee8f2493cd55453d917222c1a85212fd': '07f5c76b976657fbdcc2085861f649bd' },
    mewatchUrl: 'https://www.mewatch.sg/channels/suria/97084',
    logo: 'https://prod98.togglestatic.com/shain/v1/dataservice/ResizeImage/$value?Format=\'png\'&Quality=85&ImageId=\'6318748\'&EntityType=\'Item\'&EntityId=\'97084\'&Width=636&Height=250',
    tag: '1080p HD',
    description: 'The heartbeat of Malay entertainment, dramas, music, culture, and news.'
  },
  {
    id: 'vasantham',
    name: 'Vasantham',
    epgId: '97096',
    category: 'fta',
    categoryLabel: 'Free-to-Air',
    language: 'Tamil',
    streamType: 'mpd',
    url: 'https://tglmp01.akamaized.net/out/v1/8605c1013e3148aa809c296dd76c3fa5/manifest.mpd',
    clearKeys: { 'fb3e1afa8ae545f5a99d40baefd8a8d8': '6432f742cd17eb5aedc3d68a3a61079c' },
    mewatchUrl: 'https://www.mewatch.sg/channels/vasantham/97096',
    logo: 'https://prod98.togglestatic.com/shain/v1/dataservice/ResizeImage/$value?Format=\'png\'&Quality=85&ImageId=\'6318746\'&EntityType=\'Item\'&EntityId=\'97096\'&Width=885&Height=250',
    tag: '1080p HD',
    description: 'Singapore\'s Indian channel featuring Tamil dramas, music, movies, and celebrations.'
  },
  {
    id: 'mewatch-live1',
    name: 'meWATCH LIVE 1',
    epgId: '97073',
    category: 'fta',
    categoryLabel: 'Free-to-Air',
    language: 'English',
    streamType: 'mpd',
    url: 'https://tglmp04.akamaized.net/out/v1/b38b8a6306714a8e91ae7674291a4a94/manifest.mpd',
    logo: 'https://prod98.togglestatic.com/shain/v1/dataservice/ResizeImage/$value?Format=\'png\'&Quality=85&ImageId=\'6318742\'&EntityType=\'Item\'&EntityId=\'97073\'&Width=488&Height=249',
    tag: 'Special Events',
    description: 'Pop-up live coverage of national ceremonies, sporting events, and special broadcasts.'
  },
  {
    id: 'mewatch-live2',
    name: 'meWATCH LIVE 2',
    epgId: '97078',
    category: 'fta',
    categoryLabel: 'Free-to-Air',
    language: 'English',
    streamType: 'mpd',
    url: 'https://tglmp01.akamaized.net/out/v1/0d0353783cea43e68540829a2f8f70ef/manifest.mpd',
    logo: 'https://prod98.togglestatic.com/shain/v1/dataservice/ResizeImage/$value?Format=\'png\'&Quality=85&ImageId=\'6318742\'&EntityType=\'Item\'&EntityId=\'97078\'&Width=488&Height=249',
    tag: 'Special Events',
    description: 'Live sports overflow and special programming.'
  },

  // --- Entertainment & Movies ---
  {
    id: 'cna-originals',
    name: 'CNA Originals',
    category: 'entertainment',
    categoryLabel: 'Entertainment',
    language: 'English',
    streamType: 'hls',
    url: 'https://amg01082-cna-amg01082c1-rlaxx-us-11304.playouts.now.amagi.tv/playlist.m3u8',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/CNA_new_logo.svg/500px-CNA_new_logo.svg.png',
    tag: 'Documentary',
    description: 'Award-winning investigative documentaries, cultural explorations & human interest stories.'
  },
  {
    id: 'hollywood-movies',
    name: 'Action Hollywood Movies',
    epgId: '556894',
    category: 'entertainment',
    categoryLabel: 'Entertainment',
    language: 'English',
    streamType: 'mpd',
    url: 'https://tglmp04.akamaized.net/out/v1/6757703a338e4a11812c1dc3cdd43546/manifest.mpd',
    logo: 'https://prod98.togglestatic.com/shain/v1/dataservice/ResizeImage/$value?Format=\'png\'&Quality=85&ImageId=\'9358842\'&EntityType=\'Item\'&EntityId=\'556894\'&Width=304&Height=250',
    tag: '24/7 Movies',
    description: 'Non-stop martial arts, adrenaline stunts, and Hollywood action hits.'
  },
  {
    id: 'masterchef',
    name: 'MasterChef',
    epgId: '558278',
    category: 'entertainment',
    categoryLabel: 'Entertainment',
    language: 'English',
    streamType: 'mpd',
    url: 'https://tglmp03.akamaized.net/out/v1/5623928a97774b698b3404a843a827d6/manifest.mpd',
    logo: 'https://prod98.togglestatic.com/shain/v1/dataservice/ResizeImage/$value?Format=\'png\'&Quality=85&ImageId=\'10089891\'&EntityType=\'Item\'&EntityId=\'558278\'&Width=62&Height=59',
    tag: 'Cooking 24/7',
    description: 'Continuous culinary competitions, mystery boxes, and pressure tests.'
  },
  {
    id: 'deal-or-no-deal',
    name: 'Deal or No Deal',
    epgId: '570813',
    category: 'entertainment',
    categoryLabel: 'Entertainment',
    language: 'English',
    streamType: 'mpd',
    url: 'https://tglmp01.akamaized.net/out/v1/25c1054ebfb94befbad706ae57b3e5fd/manifest.mpd',
    logo: 'https://prod98.togglestatic.com/shain/v1/dataservice/ResizeImage/$value?Format=\'png\'&Quality=85&ImageId=\'10089317\'&EntityType=\'Item\'&EntityId=\'570813\'&Width=127&Height=59',
    tag: 'Game Show',
    description: 'High-stakes briefcase selection, banker negotiations, and nerve-wracking wins.'
  },
  {
    id: 'fear-factor',
    name: 'Fear Factor',
    epgId: '558258',
    category: 'entertainment',
    categoryLabel: 'Entertainment',
    language: 'English',
    streamType: 'mpd',
    url: 'https://tglmp04.akamaized.net/out/v1/692b0d40df6549be8158350dc8a8a120/manifest.mpd',
    logo: 'https://prod98.togglestatic.com/shain/v1/dataservice/ResizeImage/$value?Format=\'png\'&Quality=85&ImageId=\'10089337\'&EntityType=\'Item\'&EntityId=\'558258\'&Width=150&Height=59',
    tag: 'Extreme Stunts',
    description: 'Extreme physical and mental stunts pushing daring contestants to their limits.'
  },
  {
    id: 'river-monsters',
    name: 'River Monsters',
    epgId: '558241',
    category: 'entertainment',
    categoryLabel: 'Entertainment',
    language: 'English',
    streamType: 'mpd',
    url: 'https://tglmp02.akamaized.net/out/v1/bfc935c481794151afce58d9f764627e/manifest.mpd',
    logo: 'https://prod98.togglestatic.com/shain/v1/dataservice/ResizeImage/$value?Format=\'png\'&Quality=85&ImageId=\'10089297\'&EntityType=\'Item\'&EntityId=\'558241\'&Width=150&Height=59',
    tag: 'Wildlife',
    description: 'Jeremy Wade travels the globe uncovering mysterious aquatic predators.'
  },
  {
    id: 'drama-hebat',
    name: 'Drama Hebat',
    epgId: '558271',
    category: 'entertainment',
    categoryLabel: 'Entertainment',
    language: 'Malay',
    streamType: 'mpd',
    url: 'https://tglmp02.akamaized.net/out/v1/f8119e31a0804f178a7d1f566d16600a/manifest.mpd',
    logo: 'https://prod98.togglestatic.com/shain/v1/dataservice/ResizeImage/$value?Format=\'png\'&Quality=85&ImageId=\'14326803\'&EntityType=\'Item\'&EntityId=\'558271\'&Width=350&Height=250',
    tag: 'Malay Drama',
    description: '24/7 gripping Malay drama series, romance, and family epics.'
  },
  {
    id: 'filem-mantap',
    name: 'Filem Mantap',
    epgId: '558254',
    category: 'entertainment',
    categoryLabel: 'Entertainment',
    language: 'Malay',
    streamType: 'mpd',
    url: 'https://tglmp01.akamaized.net/out/v1/35baec6f2f1f47f89dde431d388d91ee/manifest.mpd',
    logo: 'https://prod98.togglestatic.com/shain/v1/dataservice/ResizeImage/$value?Format=\'png\'&Quality=85&ImageId=\'11316574\'&EntityType=\'Item\'&EntityId=\'558254\'&Width=350&Height=250',
    tag: 'Malay Movies',
    description: 'Curated blockbuster Malay cinema, comedies, and drama features.'
  },
  {
    id: 'vijay-takkar',
    name: 'Vijay Takkar',
    epgId: '558279',
    category: 'entertainment',
    categoryLabel: 'Entertainment',
    language: 'Tamil',
    streamType: 'mpd',
    url: 'https://tglmp01.akamaized.net/out/v1/c1071012b73f4f189b202e1529e8f802/manifest.mpd',
    logo: 'https://prod98.togglestatic.com/shain/v1/dataservice/ResizeImage/$value?Format=\'png\'&Quality=85&ImageId=\'13200785\'&EntityType=\'Item\'&EntityId=\'558279\'&Width=157&Height=250',
    tag: 'Tamil Hits',
    description: 'Tamil entertainment channel featuring reality shows, comedy, and music.'
  },

  // --- Music Channels ---
  {
    id: 'thats-80s',
    name: 'That\'s 80s',
    epgId: '773721',
    category: 'music',
    categoryLabel: 'Music',
    language: 'Music',
    streamType: 'mpd',
    url: 'https://tglmp02.akamaized.net/out/v1/14873c294e324266884858b6ed436380/manifest.mpd',
    logo: 'https://prod98.togglestatic.com/shain/v1/dataservice/ResizeImage/$value?Format=\'png\'&Quality=85&ImageId=\'13362956\'&EntityType=\'Item\'&EntityId=\'773721\'&Width=264&Height=250',
    tag: '80s Rewind',
    description: 'Iconic 1980s music videos, synth-pop, new wave, and timeless chartbusters.'
  },
  {
    id: 'thats-70s',
    name: 'That\'s 70s',
    epgId: '773723',
    category: 'music',
    categoryLabel: 'Music',
    language: 'Music',
    streamType: 'mpd',
    url: 'https://tglmp02.akamaized.net/out/v1/d2156f18b3c34252b14c044ec9ca8f38/manifest.mpd',
    logo: 'https://prod98.togglestatic.com/shain/v1/dataservice/ResizeImage/$value?Format=\'png\'&Quality=85&ImageId=\'13362982\'&EntityType=\'Item\'&EntityId=\'773723\'&Width=205&Height=250',
    tag: '70s Classics',
    description: 'Disco, groove, soft rock, and unforgettable hits from the golden 1970s.'
  },
  {
    id: 'thats-rock',
    name: 'That\'s Rock',
    epgId: '773722',
    category: 'music',
    categoryLabel: 'Music',
    language: 'Music',
    streamType: 'mpd',
    url: 'https://tglmp01.akamaized.net/out/v1/6dd50c19c7fc4875a9e76739750112a3/manifest.mpd',
    logo: 'https://prod98.togglestatic.com/shain/v1/dataservice/ResizeImage/$value?Format=\'png\'&Quality=85&ImageId=\'13362968\'&EntityType=\'Item\'&EntityId=\'773722\'&Width=304&Height=250',
    tag: 'Pure Rock',
    description: 'Arena rock anthems, guitar solos, grunge, and electric high-voltage energy.'
  },

  // --- Sports & Kids ---
  {
    id: 'w-sport',
    name: 'W-Sport',
    epgId: '558112',
    category: 'sports',
    categoryLabel: 'Sports',
    language: 'English',
    streamType: 'mpd',
    url: 'https://tglmp02.akamaized.net/out/v1/1063ebb215c14312ba9d4e415ac706d2/manifest.mpd',
    clearKeys: { '9e8888ac964d430cbfef9c922ee6714b': '9b1dbd9f59a39a9ebaf1fb8e665a3ef3' },
    logo: 'https://prod98.togglestatic.com/shain/v1/dataservice/ResizeImage/$value?Format=\'png\'&Quality=85&ImageId=\'9358826\'&EntityType=\'Item\'&EntityId=\'558112\'&Width=409&Height=250',
    tag: 'Live Sports',
    description: '24/7 global network dedicated exclusively to women\'s premier sports tournaments.'
  },
  {
    id: 'fifa-plus',
    name: 'FIFA+',
    epgId: '557763',
    category: 'sports',
    categoryLabel: 'Sports',
    language: 'English',
    streamType: 'mpd',
    url: 'https://tglmp03.akamaized.net/out/v1/c8e964618dbd41b38ae487760387af24/manifest.mpd',
    logo: 'https://prod98.togglestatic.com/shain/v1/dataservice/ResizeImage/$value?Format=\'png\'&Quality=85&ImageId=\'9358830\'&EntityType=\'Item\'&EntityId=\'557763\'&Width=264&Height=250',
    tag: 'Football',
    description: 'FIFA World Cup archive matches, football documentaries, and tournament highlights.'
  },
  {
    id: 'trace-sport',
    name: 'TRACE Sport Stars',
    epgId: '556888',
    category: 'sports',
    categoryLabel: 'Sports',
    language: 'English',
    streamType: 'mpd',
    url: 'https://tglmp01.akamaized.net/out/v1/7b64773a43184fbc9c4c1f83193db178/manifest.mpd',
    logo: 'https://prod98.togglestatic.com/shain/v1/dataservice/ResizeImage/$value?Format=\'png\'&Quality=85&ImageId=\'9358846\'&EntityType=\'Item\'&EntityId=\'556888\'&Width=350&Height=250',
    tag: 'Athletes & Lifestyle',
    description: 'Behind the scenes with global sports champions, lifestyle, and fitness stories.'
  },
  {
    id: 'kartoon-channel',
    name: 'Kartoon Channel!',
    epgId: '556893',
    category: 'kids',
    categoryLabel: 'Kids',
    language: 'English',
    streamType: 'mpd',
    url: 'https://tglmp01.akamaized.net/out/v1/b8676da58b8d4a7a9a961358906e43bb/manifest.mpd',
    logo: 'https://prod98.togglestatic.com/shain/v1/dataservice/ResizeImage/$value?Format=\'png\'&Quality=85&ImageId=\'9358834\'&EntityType=\'Item\'&EntityId=\'556893\'&Width=350&Height=250',
    tag: 'All Ages',
    description: 'Safe, positive, and educational animated stories for growing minds.'
  },
  {
    id: 'tg-junior',
    name: 'TG Junior',
    epgId: '556877',
    category: 'kids',
    categoryLabel: 'Kids',
    language: 'English',
    streamType: 'mpd',
    url: 'https://tglmp03.akamaized.net/out/v1/a3992c3d704443c991a8586e01a4cc1c/manifest.mpd',
    logo: 'https://prod98.togglestatic.com/shain/v1/dataservice/ResizeImage/$value?Format=\'png\'&Quality=85&ImageId=\'9358838\'&EntityType=\'Item\'&EntityId=\'556877\'&Width=264&Height=250',
    tag: 'Toddlers',
    description: 'Musical rhymes, gentle animations, and preschool learning.'
  },

  // --- Singapore Live Radios ---
  {
    id: 'radio-yes933',
    name: 'YES 933 (顶尖流行音乐台)',
    category: 'radio',
    categoryLabel: 'Live Radio',
    language: 'Chinese',
    streamType: 'audio',
    url: 'https://22393.live.streamtheworld.com/YES933_PREM.aac',
    logo: 'https://prod98.togglestatic.com/shain/v1/dataservice/ResizeImage/$value?Format=\'png\'&Quality=85&ImageId=\'6318750\'&EntityType=\'Item\'&EntityId=\'97104\'&Width=100&Height=100',
    tag: 'Mandopop',
    description: 'Singapore\'s #1 Chinese radio station playing hottest Mandopop tunes and morning banter.'
  },
  {
    id: 'radio-class95',
    name: 'Class 95 (The Best Mix of Music)',
    category: 'radio',
    categoryLabel: 'Live Radio',
    language: 'English',
    streamType: 'audio',
    url: 'https://22393.live.streamtheworld.com/CLASS95_PREM.aac',
    logo: 'https://prod98.togglestatic.com/shain/v1/dataservice/ResizeImage/$value?Format=\'png\'&Quality=85&ImageId=\'6318760\'&EntityType=\'Item\'&EntityId=\'97098\'&Width=100&Height=100',
    tag: 'English Top 40',
    description: 'Singapore\'s #1 English station with The Muttons in the Morning and great hits.'
  },
  {
    id: 'radio-gold905',
    name: 'Gold 905 (Sounds Good, Feels Good)',
    category: 'radio',
    categoryLabel: 'Live Radio',
    language: 'English',
    streamType: 'audio',
    url: 'https://22393.live.streamtheworld.com/GOLD905_PREM.aac',
    logo: 'https://prod98.togglestatic.com/shain/v1/dataservice/ResizeImage/$value?Format=\'png\'&Quality=85&ImageId=\'6318760\'&EntityType=\'Item\'&EntityId=\'97098\'&Width=100&Height=100',
    tag: 'Classic Hits',
    description: 'Timeless rock, pop, soul, and nostalgic favorites from the 70s, 80s, and 90s.'
  },
  {
    id: 'radio-987fm',
    name: '987FM (Hit Music Station)',
    category: 'radio',
    categoryLabel: 'Live Radio',
    language: 'English',
    streamType: 'audio',
    url: 'https://22393.live.streamtheworld.com/987FM_PREM.aac',
    logo: 'https://prod98.togglestatic.com/shain/v1/dataservice/ResizeImage/$value?Format=\'png\'&Quality=85&ImageId=\'6318766\'&EntityType=\'Item\'&EntityId=\'97072\'&Width=100&Height=100',
    tag: 'Pop & Viral Hits',
    description: 'Trending chartbusters, international stars, and youthful viral music.'
  },
  {
    id: 'radio-symphony924',
    name: 'Symphony 924 (Classical & Jazz)',
    category: 'radio',
    categoryLabel: 'Live Radio',
    language: 'English',
    streamType: 'audio',
    url: 'https://22393.live.streamtheworld.com/SYMPHONY924_PREM.aac',
    logo: 'https://prod98.togglestatic.com/shain/v1/dataservice/ResizeImage/$value?Format=\'png\'&Quality=85&ImageId=\'6318742\'&EntityType=\'Item\'&EntityId=\'97073\'&Width=100&Height=100',
    tag: 'Classical',
    description: 'Only classical music station in Singapore, featuring orchestral masterworks and jazz.'
  }
];
