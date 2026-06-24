import { Innertube, UniversalCache } from 'youtubei.js';

function extractVideoId(url) {
  const match = url.match(
    /(?:v=|\/shorts\/|youtu\.be\/|\/embed\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

function sanitizeTitle(title) {
  return (title || 'video')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .trim()
    .substring(0, 80);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url, quality } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  const videoId = extractVideoId(url);
  if (!videoId) return res.status(400).json({ error: 'Invalid YouTube URL' });

  try {
    const yt = await Innertube.create({ cache: new UniversalCache(false) });
    const info = await yt.getBasicInfo(videoId);
    const player = yt.session.player;

    const title = sanitizeTitle(info.basic_info?.title);
    const combined = info.streaming_data?.formats || [];
    const adaptive = info.streaming_data?.adaptive_formats || [];

    // ── Audio only ──────────────────────────────────────────────────
    if (quality === 'audio') {
      const fmt = adaptive
        .filter(f => f.mime_type?.startsWith('audio/'))
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

      if (!fmt) throw new Error('No audio stream found');
      return res.json({ status: 'redirect', url: fmt.decipher(player), filename: `${title}.mp3` });
    }

    // ── Target height ───────────────────────────────────────────────
    const targetH = quality === 'max' ? 9999 : (parseInt(quality) || 720);

    // ── Try combined (video+audio) streams first — exist up to 720p ─
    const bestCombined = combined
      .filter(f => f.mime_type?.includes('video/mp4'))
      .sort((a, b) => Math.abs((a.height || 0) - targetH) - Math.abs((b.height || 0) - targetH))[0];

    if (bestCombined) {
      const streamUrl = bestCombined.decipher(player);
      if (streamUrl) {
        return res.json({
          status: 'redirect',
          url: streamUrl,
          filename: `${title}-${bestCombined.height}p.mp4`,
        });
      }
    }

    // ── Fall back to adaptive (separate video + audio) for 1080p+ ───
    const videoFmts = adaptive
      .filter(f => f.mime_type?.includes('video/mp4') && f.height)
      .sort((a, b) => Math.abs((a.height || 0) - targetH) - Math.abs((b.height || 0) - targetH));

    const audioFmts = adaptive
      .filter(f => f.mime_type?.startsWith('audio/'))
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

    if (!videoFmts.length) throw new Error('No video stream found for this quality');

    const bestVideo = videoFmts[0];
    const bestAudio = audioFmts[0];

    return res.json({
      status: 'local-processing',
      videoUrl: bestVideo.decipher(player),
      audioUrl: bestAudio ? bestAudio.decipher(player) : null,
      filename: `${title}-${bestVideo.height}p.mp4`,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to get video info' });
  }
}
