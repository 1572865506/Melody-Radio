const express = require('express');
const path = require('path');
const https = require('https');
const http = require('http');

const app = express();
const PORT = 3000;

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// 通用请求头 - 模拟浏览器访问
const BILIBILI_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.bilibili.com',
  'Origin': 'https://www.bilibili.com',
};

/**
 * 从各种格式中提取 BV 号
 */
function extractBvid(input) {
  if (!input) return null;
  input = input.trim();

  // 纯 BV 号
  const bvMatch = input.match(/^(BV[a-zA-Z0-9]+)$/);
  if (bvMatch) return bvMatch[1];

  // 从 URL 中提取
  const urlMatch = input.match(/BV[a-zA-Z0-9]+/);
  if (urlMatch) return urlMatch[0];

  return null;
}

/**
 * 发起 HTTPS 请求的 Promise 封装
 */
function fetchJSON(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const mergedHeaders = { ...BILIBILI_HEADERS, ...headers };
    const urlObj = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: mergedHeaders,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Failed to parse JSON response'));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

/**
 * 代理远程流（支持重定向）
 */
function proxyStream(url, headers, req, res, redirectCount = 0) {
  if (redirectCount > 5) {
    if (!res.headersSent) res.status(502).json({ error: 'Too many redirects' });
    return;
  }

  const urlObj = new URL(url);
  const protocol = urlObj.protocol === 'https:' ? https : http;

  const proxyHeaders = {
    ...BILIBILI_HEADERS,
    ...headers,
    'Host': urlObj.host,
    'Accept': '*/*',
    'Accept-Encoding': 'identity', // 不要压缩，直接传输
  };

  // 透传 Range 请求头（支持进度条拖拽）
  if (req.headers.range) {
    proxyHeaders['Range'] = req.headers.range;
  }

  const options = {
    hostname: urlObj.hostname,
    port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
    path: urlObj.pathname + urlObj.search,
    method: 'GET',
    headers: proxyHeaders,
    timeout: 15000,
  };

  const proxyReq = protocol.request(options, (proxyRes) => {
    // 处理重定向
    if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
      proxyRes.resume(); // drain
      const redirectUrl = new URL(proxyRes.headers.location, url).toString();
      return proxyStream(redirectUrl, headers, req, res, redirectCount + 1);
    }

    // 过滤 undefined 头
    const responseHeaders = {
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    };
    if (proxyRes.headers['content-type']) responseHeaders['Content-Type'] = proxyRes.headers['content-type'];
    if (proxyRes.headers['content-length']) responseHeaders['Content-Length'] = proxyRes.headers['content-length'];
    if (proxyRes.headers['content-range']) responseHeaders['Content-Range'] = proxyRes.headers['content-range'];

    res.writeHead(proxyRes.statusCode, responseHeaders);
    proxyRes.pipe(res);

    // 客户端断开时清理
    req.on('close', () => { proxyRes.destroy(); });
  });

  proxyReq.on('error', (err) => {
    if (err.code === 'ECONNRESET' || err.code === 'ERR_SOCKET_CLOSED') return; // client left
    console.error('Proxy stream error:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Failed to proxy audio stream' });
    }
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      res.status(504).json({ error: 'Stream proxy timeout' });
    }
  });

  // 客户端断开时取消上游请求
  req.on('close', () => { proxyReq.destroy(); });

  proxyReq.end();
}

// ============================================================
// API 路由
// ============================================================

app.get('/api/test', (req, res) => res.json({ status: 'ok' }));

/**
 * GET /api/ai-script?title=xxx&artist=xxx
 * 生成 AI 电台开场白
 */
app.get('/api/ai-script', async (req, res) => {
  const { title, artist } = req.query;
  if (!title) return res.status(400).json({ error: '缺少歌曲信息' });

  const isEnglish = /[a-zA-Z]{3,}/.test(title);
  const scripts = {
    zh: [
      `深夜好，这里是 Melody Radio。接下来的这首歌，是来自 ${artist} 的《${title}》。不知道在这个瞬间，这首歌是否也触动了你心底那块最柔软的地方。`,
      `每一首歌都是一段故事的注脚。现在为你播放 ${artist} 的作品《${title}》。让我们在旋律中，寻找那份久违的平静。`,
      `有时候，言语无法抵达的地方，音乐可以。请听 ${artist} 为我们带来的《${title}》，愿这阵晚风能带走你一天的疲惫。`,
      `你听，那是时间的呼吸。接下来是 ${artist} 的《${title}》，送给正在屏幕前独自努力的你。你并不孤单。`
    ],
    en: [
      `Welcome to Melody Radio. Up next, we have a beautiful piece by ${artist} titled "${title}". Close your eyes and let the rhythm take you somewhere peaceful.`,
      `Music is the universal language of mankind. Enjoy "${title}" by ${artist}. A track that surely speaks to the heart.`,
      `Late night vibes with ${artist}. This is "${title}". Stay tuned, and let the healing begin.`,
      `Sometimes all we need is a good song and a moment of silence. Here is "${title}" from ${artist}. You're listening to Melody Radio.`
    ]
  };

  const pool = isEnglish ? scripts.en : scripts.zh;
  const script = pool[Math.floor(Math.random() * pool.length)];

  res.json({ script });
});

/**
 * POST /api/export
 * 接收 JSON 并返回一个下载文件
 */
app.post('/api/export', (req, res) => {
  try {
    const data = req.body;
    if (!data || !data.playlist) {
      console.error('Export Error: Empty body or missing playlist');
      return res.status(400).send('Invalid data');
    }

    console.log(`Exporting playlist with ${data.playlist.length} songs`);

    const now = new Date();
    const dateStr = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
    const filename = `playlist_${dateStr}.json`;

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Export Route Error:', err);
    res.status(500).send('Server Error');
  }
});

/**
 * POST /api/export-form
 * 通过表单提交导出数据
 */
app.post('/api/export-form', (req, res) => {
  try {
    const dataStr = req.body.data;
    if (!dataStr) return res.status(400).send('No data');
    const data = JSON.parse(dataStr);

    const now = new Date();
    const dateStr = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
    const filename = `playlist_${dateStr}.json`;

    res.attachment(filename);
    res.type('json');
    res.send(JSON.stringify(data, null, 2));
  } catch (err) {
    res.status(500).send('Export Error');
  }
});

/**
 * GET /api/song-info?url=xxx
 * 核心歌曲信息接口
 */
app.get('/api/song-info', async (req, res) => {
  const rawUrl = req.query.url;
  console.log(`[API] Song Info Request: ${rawUrl}`);

  try {
    const bvid = extractBvid(rawUrl);
    if (!bvid) {
      console.error(`[API] Failed to extract BVID from: ${rawUrl}`);
      return res.status(400).json({ error: '无法识别视频地址，请检查链接或 BV 号' });
    }

    console.log(`[API] Extracted BVID: ${bvid}`);
    const url = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
    const data = await fetchJSON(url);

    if (!data || data.code !== 0) {
      const msg = data?.message || '视频信息抓取失败';
      console.error(`[API] Bilibili API Error: ${msg}`);
      return res.status(404).json({ error: msg });
    }

    const video = data.data;
    const result = {
      bvid: video.bvid,
      aid: video.aid,
      title: video.title,
      artist: video.owner?.name || '未知UP主',
      cover: video.pic,
      duration: video.duration,
      cid: video.cid
    };

    console.log(`[API] Successfully fetched: ${result.title}`);
    res.json(result);
  } catch (err) {
    console.error('[API] Fatal Error:', err.message);
    res.status(500).json({ error: '服务器内部错误: ' + err.message });
  }
});

/**
 * GET /api/video-info?bvid=BVxxxx
 * 备用视频信息接口
 */
app.get('/api/video-info', async (req, res) => {
  try {
    const bvid = extractBvid(req.query.bvid);
    if (!bvid) {
      return res.status(400).json({ error: '无效的 BV 号' });
    }

    const url = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
    const data = await fetchJSON(url);

    if (data.code !== 0) {
      return res.status(404).json({ error: data.message || '视频不存在' });
    }

    const video = data.data;
    res.json({
      bvid: video.bvid,
      aid: video.aid,
      title: video.title,
      artist: video.owner?.name || '未知UP主',
      cover: video.pic,
      duration: video.duration,
      cid: video.cid,
      pages: video.pages?.map(p => ({
        cid: p.cid,
        part: p.part,
        page: p.page,
        duration: p.duration,
      })),
    });
  } catch (err) {
    console.error('Video info error:', err.message);
    res.status(500).json({ error: '获取视频信息失败' });
  }
});

/**
 * GET /api/audio-stream?bvid=BVxxxx&cid=xxxxx
 * 代理音频流
 */
app.get('/api/audio-stream', async (req, res) => {
  try {
    const bvid = extractBvid(req.query.bvid);
    let cid = req.query.cid;

    if (!bvid) {
      return res.status(400).json({ error: '无效的 BV 号' });
    }

    // 如果没提供 cid，先获取
    if (!cid) {
      const viewUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
      const viewData = await fetchJSON(viewUrl);
      if (viewData.code !== 0) {
        return res.status(404).json({ error: '视频不存在' });
      }
      cid = viewData.data.cid;
    }

    // 获取 DASH 格式的播放 URL（fnval=16 表示 DASH）
    const playUrl = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&fnval=16&fnver=0&fourk=1`;
    const playData = await fetchJSON(playUrl);

    if (playData.code !== 0) {
      return res.status(404).json({ error: playData.message || '无法获取播放地址' });
    }

    const dash = playData.data?.dash;
    if (!dash || !dash.audio || dash.audio.length === 0) {
      return res.status(404).json({ error: '无法获取音频流' });
    }

    // 选择最高质量的音频流
    const audioStream = dash.audio.reduce((best, current) => {
      return (current.bandwidth > best.bandwidth) ? current : best;
    }, dash.audio[0]);

    const audioUrl = audioStream.baseUrl || audioStream.base_url;

    if (!audioUrl) {
      return res.status(404).json({ error: '音频 URL 不可用' });
    }

    // 代理音频流
    proxyStream(audioUrl, {
      'Referer': 'https://www.bilibili.com',
    }, req, res);
  } catch (err) {
    console.error('Audio stream error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: '获取音频流失败' });
    }
  }
});

/**
 * GET /api/comments?bvid=BVxxxx
 * 获取视频评论（热评）
 */
app.get('/api/comments', async (req, res) => {
  try {
    const bvid = extractBvid(req.query.bvid);
    let aid = req.query.aid;

    if (!bvid && !aid) return res.status(400).json({ error: '无效的参数' });

    // 1. 如果没有 aid，则先通过 bvid 获取
    if (!aid) {
      const viewUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
      const viewData = await fetchJSON(viewUrl);
      if (viewData.code === 0) {
        aid = viewData.data.aid;
      } else {
        console.error('Failed to get aid for bvid:', bvid, viewData.message);
        return res.status(404).json({ error: '无法获取视频信息' });
      }
    }

    // 2. 获取评论 (使用更通用的 API 并在失败时记录原因)
    const replyUrl = `https://api.bilibili.com/x/v2/reply?type=1&oid=${aid}&sort=1&ps=20&pn=1`;
    const replyData = await fetchJSON(replyUrl);

    if (replyData.code !== 0) {
      console.warn(`Bilibili API returned non-zero code for comments (aid:${aid}):`, replyData.code, replyData.message);
      return res.json({ comments: [] }); 
    }

    const replies = replyData.data?.replies || [];
    const formatted = replies.map(r => ({
      member: {
        uname: r.member?.uname,
        avatar: r.member?.avatar,
      },
      content: {
        message: r.content?.message,
      },
      like: r.like,
      ctime: r.ctime,
    }));

    res.json({ comments: formatted });
  } catch (err) {
    console.error('Comments API Error:', err.message);
    res.status(500).json({ error: '获取评论失败' });
  }
});

/**
 * GET /api/cover-proxy?url=xxx
 * 代理封面图片（绕过防盗链）
 */
app.get('/api/cover-proxy', (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) {
    return res.status(400).json({ error: '缺少图片 URL' });
  }

  const urlObj = new URL(imageUrl);
  const protocol = urlObj.protocol === 'https:' ? https : http;

  const options = {
    hostname: urlObj.hostname,
    path: urlObj.pathname + urlObj.search,
    method: 'GET',
    headers: {
      'User-Agent': BILIBILI_HEADERS['User-Agent'],
      'Referer': 'https://www.bilibili.com',
    },
  };

  const proxyReq = protocol.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, {
      'Content-Type': proxyRes.headers['content-type'],
      'Content-Length': proxyRes.headers['content-length'],
      'Cache-Control': 'public, max-age=86400',
    });
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Cover proxy error:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: '封面加载失败' });
    }
  });

  proxyReq.end();
});



// 启动服务器
app.listen(PORT, () => {
  console.log(`\n  🎵 BiliRadio 音乐电台已启动`);
  console.log(`  📡 访问地址: http://localhost:${PORT}\n`);
});
