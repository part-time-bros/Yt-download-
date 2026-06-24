export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url, quality } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const isAudio = quality === 'audio';

    const payload = isAudio
      ? { url, downloadMode: 'audio', audioFormat: 'mp3', filenameStyle: 'basic' }
      : { url, videoQuality: quality || '1080', downloadMode: 'auto', filenameStyle: 'basic' };

    const cobaltRes = await fetch('https://api.cobalt.tools/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await cobaltRes.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
