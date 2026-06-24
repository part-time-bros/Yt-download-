export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url, quality } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const apiBase = await getWorkingInstance();
    const isAudio = quality === 'audio';

    const payload = isAudio
      ? { url, downloadMode: 'audio', audioFormat: 'mp3', filenameStyle: 'basic' }
      : { url, videoQuality: quality || '1080', downloadMode: 'auto', filenameStyle: 'basic' };

    const cobaltRes = await fetch(`${apiBase}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'yt-clipper/1.0 (+personal-tool)',
      },
      body: JSON.stringify(payload),
    });

    const data = await cobaltRes.json();

    // Cobalt error response: { status: "error", error: { code: "..." } }
    if (data.status === 'error') {
      const code = data.error?.code || data.error || 'Unknown cobalt error';
      return res.status(200).json({ error: String(code) });
    }

    // local-processing: YouTube 1080p+ serves video and audio as separate streams.
    // Pass both tunnel URLs back so the frontend can show two download buttons.
    if (data.status === 'local-processing') {
      const tunnels = data.tunnel || [];
      return res.status(200).json({
        status: 'local-processing',
        videoUrl: tunnels[0] || null,
        audioUrl: tunnels[1] || null,
        filename: data.output?.filename || 'video.mp4',
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

// Dynamically fetch a working cobalt instance from the public registry
async function getWorkingInstance() {
  try {
    const res = await fetch('https://instances.cobalt.best/api', {
      headers: {
        'User-Agent': 'yt-clipper/1.0 (+personal-tool)',
      },
    });

    if (!res.ok) throw new Error('Registry unavailable');

    const instances = await res.json();

    const best = instances
      .filter((i) => {
        const online = typeof i.online === 'boolean' ? i.online : i.online?.api;
        const noAuth = i.info?.auth === false;
        const youtubeWorks = i.services?.youtube === true;
        const highScore = (i.score || 0) >= 50;
        return online && noAuth && youtubeWorks && highScore;
      })
      .sort((a, b) => (b.score || 0) - (a.score || 0))[0];

    if (best) {
      const proto = best.protocol || 'https';
      return `${proto}://${best.api}`;
    }
  } catch (e) {
    console.error('Instance fetch failed:', e.message);
  }

  // Final fallback
  return 'https://api.cobalt.tools';
}
