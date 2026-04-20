const express = require('express');
const router = express.Router();

function normalizeInputUrl(rawValue) {
  const raw = `${rawValue || ''}`.trim();
  if (!raw) return '';

  const matchedUrl = raw.match(/https?:\/\/[^\s]+|(?:maps\.app\.goo\.gl|goo\.gl|g\.co|google\.[^\s/]+)[^\s]*/i);
  let normalized = (matchedUrl ? matchedUrl[0] : raw).trim();

  normalized = normalized.replace(/[)\]>]+$/g, '');

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  return normalized;
}

function isGoogleMapsUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname.toLowerCase();

    return (
      hostname === 'maps.app.goo.gl' ||
      hostname.endsWith('.maps.app.goo.gl') ||
      hostname === 'goo.gl' ||
      hostname.endsWith('.goo.gl') ||
      hostname === 'g.co' ||
      hostname.endsWith('.g.co') ||
      hostname.includes('google.')
    );
  } catch {
    return false;
  }
}

function isPlaceOnlyGoogleMapsUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const path = parsed.pathname.toLowerCase();
    return path.includes('/maps/place/') || (path.includes('/place/') && !path.includes('/dir/'));
  } catch {
    return false;
  }
}

function isRouteGoogleMapsUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const path = parsed.pathname.toLowerCase();
    return (
      path.includes('/maps/dir/') ||
      path.includes('/dir/') ||
      parsed.searchParams.has('origin') ||
      parsed.searchParams.has('destination') ||
      parsed.searchParams.has('saddr') ||
      parsed.searchParams.has('daddr')
    );
  } catch {
    return false;
  }
}

function isMapsQueryPlaceUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const path = parsed.pathname.toLowerCase();
    const q = parsed.searchParams.get('q');

    if (!q) return false;

    return (
      path === '/maps' &&
      parsed.searchParams.has('ftid') &&
      !isRouteGoogleMapsUrl(urlStr)
    );
  } catch {
    return false;
  }
}

function normalizeCoordinateResult(result) {
  if (!result || result.error) return result;

  const normalized = {
    origin: result.origin || null,
    destination: result.destination || null,
  };

  if (normalized.origin && !normalized.destination) {
    normalized.destination = normalized.origin;
    normalized.origin = null;
  }

  return normalized;
}

function extractPreferredPlaceDestination(urlStr) {
  if (!urlStr) return null;

  const exactMatches = [...urlStr.matchAll(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/g)];
  if (exactMatches.length > 0) {
    const last = exactMatches[exactMatches.length - 1];
    return [parseFloat(last[1]), parseFloat(last[2])];
  }

  const fallbackMatches = [...urlStr.matchAll(/!1d(-?\d+\.\d+)!2d(-?\d+\.\d+)/g)];
  if (fallbackMatches.length > 0) {
    const last = fallbackMatches[fallbackMatches.length - 1];
    return [parseFloat(last[2]), parseFloat(last[1])];
  }

  return null;
}

async function geocodeGoogleMapsQuery(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const q = `${parsed.searchParams.get('q') || ''}`.trim();
    if (!q) return null;

    const geocodeUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&countrycodes=vn&limit=1&accept-language=vi`;
    const response = await fetch(geocodeUrl, {
      headers: { 'User-Agent': 'VFRangeAssistant/1.0' }
    });

    if (!response.ok) return null;

    const results = await response.json();
    const bestMatch = Array.isArray(results) ? results[0] : null;
    if (!bestMatch?.lat || !bestMatch?.lon) return null;

    return [parseFloat(bestMatch.lat), parseFloat(bestMatch.lon)];
  } catch {
    return null;
  }
}

function extractCoordinates(urlStr) {
  let origin = null;
  let destination = null;

  try {
    const parsedUrl = new URL(urlStr);
    const isPlaceOnlyUrl = isPlaceOnlyGoogleMapsUrl(urlStr);
    
    // Parse /dir/ paths more robustly
    const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
    if (pathParts[0] === 'maps' && pathParts[1] === 'dir') {
       const coordRegex = /^(-?\d+\.\d+),(-?\d+\.\d+)$/;
       // pathParts[2] is origin, pathParts[3] is destination
       if (pathParts[2]) {
           const match = pathParts[2].match(coordRegex);
           if (match) origin = [parseFloat(match[1]), parseFloat(match[2])];
       }
       if (pathParts[3]) {
           const match = pathParts[3].match(coordRegex);
           if (match) destination = [parseFloat(match[1]), parseFloat(match[2])];
       }
    }

    // Try URL params for explicit coordinates
    const qParam = parsedUrl.searchParams.get('q');
    if (qParam && !destination) {
      const qMatch = qParam.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
      if (qMatch) destination = [parseFloat(qMatch[1]), parseFloat(qMatch[2])];
    }
    const saddr = parsedUrl.searchParams.get('saddr');
    if (saddr && !origin) {
      const saddrMatch = saddr.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
      if (saddrMatch) origin = [parseFloat(saddrMatch[1]), parseFloat(saddrMatch[2])];
    }
    const daddr = parsedUrl.searchParams.get('daddr');
    if (daddr && !destination) {
      const daddrMatch = daddr.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
      if (daddrMatch) destination = [parseFloat(daddrMatch[1]), parseFloat(daddrMatch[2])];
    }
    const destParam = parsedUrl.searchParams.get('destination');
    if (destParam && !destination) {
      const destMatch = destParam.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
      if (destMatch) destination = [parseFloat(destMatch[1]), parseFloat(destMatch[2])];
    }
    const originParam = parsedUrl.searchParams.get('origin');
    if (originParam && !origin) {
      const originMatch = originParam.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
      if (originMatch) origin = [parseFloat(originMatch[1]), parseFloat(originMatch[2])];
    }

    // Try extracted place via !1d !2d or !3d !4d variables in URL string
    if (!destination || !origin) {
        // Collect all !1d !2d matches
        const dMatches = [...urlStr.matchAll(/!1d(-?\d+\.\d+)!2d(-?\d+\.\d+)/g)];
        const extractedCoords = dMatches.map(m => [parseFloat(m[2]), parseFloat(m[1])]); // 1d is lon, 2d is lat

        // Also fallback to !3d (lat) !4d (lon)
        const d34Matches = [...urlStr.matchAll(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/g)];
        d34Matches.forEach(m => extractedCoords.push([parseFloat(m[1]), parseFloat(m[2])]));

        if (extractedCoords.length >= 2 && !isPlaceOnlyUrl) {
            if (!origin) origin = extractedCoords[0];
            if (!destination) destination = extractedCoords[extractedCoords.length - 1];
        } else if (extractedCoords.length === 1) {
            if (!destination && origin) destination = extractedCoords[0];
            else if (!origin && destination) origin = extractedCoords[0];
            else if (!destination) destination = extractedCoords[0];
        } else if (extractedCoords.length >= 2 && isPlaceOnlyUrl) {
            destination = extractedCoords[extractedCoords.length - 1];
        }
    }

    // Try @lat,lng in path (viewport center - useful as fallback for single places, less reliable for routes)
    if (!destination && !origin) {
        const atMatch = urlStr.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (atMatch) {
             if (isPlaceOnlyUrl) {
               destination = [parseFloat(atMatch[1]), parseFloat(atMatch[2])];
             } else {
               destination = [parseFloat(atMatch[1]), parseFloat(atMatch[2])];
             }
        }
    }
    
    // Try raw lat,lng in path like /place/lat,lng/
    if (!destination && !origin) {
        const pathMatch = parsedUrl.pathname.match(/\/(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (pathMatch) {
            destination = [parseFloat(pathMatch[1]), parseFloat(pathMatch[2])];
        }
    }

    if (!origin && !destination) {
        return { error: 'Không tìm thấy tọa độ trong link.' };
    }

    return normalizeCoordinateResult({ origin, destination });
  } catch (error) {
    return { error: error.message };
  }
}

router.post('/parse-google-maps-link', async (req, res) => {
  const { url } = req.body;
  const normalizedUrl = normalizeInputUrl(url);

  if (!normalizedUrl) {
    return res.json({ success: false, message: 'URL không hợp lệ' });
  }

  if (!isGoogleMapsUrl(normalizedUrl)) {
    return res.json({ success: false, message: 'Link không đúng định dạng Google Maps.' });
  }

  console.log(`[Parser] Đang xử lý link: ${normalizedUrl}`);

  try {
    const directExtracted = normalizeCoordinateResult(extractCoordinates(normalizedUrl));
    const fallbackExtracted = (!directExtracted.error && (directExtracted.origin || directExtracted.destination))
      ? directExtracted
      : null;
    const isPlaceOnlyUrl = isPlaceOnlyGoogleMapsUrl(normalizedUrl);
    const isQueryPlaceUrl = isMapsQueryPlaceUrl(normalizedUrl);
    const directPlaceDestination = isPlaceOnlyUrl
      ? (extractPreferredPlaceDestination(normalizedUrl) || directExtracted.destination)
      : null;

    if (isQueryPlaceUrl) {
      const geocodedDestination = await geocodeGoogleMapsQuery(normalizedUrl);
      if (geocodedDestination) {
        return res.json({
          success: true,
          origin: null,
          destination: geocodedDestination,
          resolvedUrl: normalizedUrl
        });
      }
    }

    if (directPlaceDestination) {
      return res.json({
        success: true,
        origin: null,
        destination: directPlaceDestination,
        resolvedUrl: normalizedUrl
      });
    }

    if (directExtracted.origin && directExtracted.destination) {
      return res.json({
        success: true,
        origin: directExtracted.origin,
        destination: directExtracted.destination,
        resolvedUrl: normalizedUrl
      });
    }

    if (isPlaceOnlyUrl && directExtracted.destination) {
      return res.json({
        success: true,
        origin: null,
        destination: directExtracted.destination,
        resolvedUrl: normalizedUrl
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    // Sử dụng User-Agent của iPhone để Google trả về phiên bản Mobile linh hoạt hơn
    const response = await fetch(normalizedUrl, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'vi-vn',
        'Referer': 'https://www.google.com/'
      }
    });
    clearTimeout(timeoutId);

    const finalUrl = response.url;
    console.log(`[Parser] URL sau redirect: ${finalUrl}`);
    const isFinalPlaceOnlyUrl = isPlaceOnlyGoogleMapsUrl(finalUrl);
    const isFinalRouteUrl = isRouteGoogleMapsUrl(finalUrl);
    const isFinalQueryPlaceUrl = isMapsQueryPlaceUrl(finalUrl);
    const preferredFinalPlaceDestination = isFinalPlaceOnlyUrl
      ? extractPreferredPlaceDestination(finalUrl)
      : null;

    if (isFinalQueryPlaceUrl) {
      const geocodedDestination = await geocodeGoogleMapsQuery(finalUrl);
      if (geocodedDestination) {
        return res.json({
          success: true,
          origin: null,
          destination: geocodedDestination,
          resolvedUrl: finalUrl
        });
      }
    }

    // Ưu tiên 1: Tách từ URL
    let extracted = normalizeCoordinateResult(extractCoordinates(finalUrl));

    if (preferredFinalPlaceDestination) {
      return res.json({
        success: true,
        origin: null,
        destination: preferredFinalPlaceDestination,
        resolvedUrl: finalUrl
      });
    }

    if (isFinalPlaceOnlyUrl && extracted.destination) {
      return res.json({
        success: true,
        origin: null,
        destination: extracted.destination,
        resolvedUrl: finalUrl
      });
    }

    // Ưu tiên 2: Nếu URL không đủ, quét nội dung HTML bằng các kỹ thuật mạnh hơn
    const html = await response.text();
    let preferredPlaceDestination = null;

    if (extracted.error || !extracted.origin || !extracted.destination) {
      console.log('[Parser] Đang quét sâu nội dung HTML...');

      // Kiểm tra xem có bị dính trang "Robot check" của Google không
      if (html.includes('unusual traffic from your computer network') || html.includes('captcha')) {
        console.error('[Parser] LỖI: Google đã chặn IP của VPS này (Robot Check).');
        return res.json({
          success: false,
          message: 'Lỗi: Google Maps đang chặn máy chủ. Cách khắc phục: Hãy dán link "đầy đủ" từ trình duyệt thay vì dùng nút Chia sẻ trong App, hoặc dán tọa độ thủ công.'
        });
      }

      // 1. Tìm trong các meta tags hoặc link preview
      const metaMatches = [
        ...html.matchAll(/property="og:url" content="([^"]+)"/g),
        ...html.matchAll(/url=([^"'>\s]+)/gi)
      ];
      
      for (const m of metaMatches) {
        const decoded = decodeURIComponent(m[1].replace(/&amp;/g, '&'));
        const mExtracted = normalizeCoordinateResult(extractCoordinates(decoded));

        if (!preferredPlaceDestination && isPlaceOnlyGoogleMapsUrl(decoded) && mExtracted?.destination) {
          preferredPlaceDestination = mExtracted.destination;
        }

        if (!mExtracted.error) {
          if (!extracted.origin) extracted.origin = mExtracted.origin;
          if (!extracted.destination) extracted.destination = mExtracted.destination;
        }
      }

      // 2. Tìm bất kỳ chuỗi số nào giống tọa độ Việt Nam trong toàn bộ HTML
      // Tìm dạng: 10.123456,106.123456 hoặc 10.123456, 106.123456
      const rawMatches = [...html.matchAll(/(-?\d{1,2}\.\d{5,})\s*,\s*(-?\d{1,3}\.\d{5,})/g)]
        .map(m => [parseFloat(m[1]), parseFloat(m[2])])
        // Lọc tọa độ hợp lệ tại Việt Nam (Lat: 8-24, Lng: 102-110)
        .filter(c => {
          const isVn1 = (c[0] >= 8 && c[0] <= 24) && (c[1] >= 102 && c[1] <= 110);
          const isVn2 = (c[1] >= 8 && c[1] <= 24) && (c[0] >= 102 && c[0] <= 110);
          return isVn1 || isVn2;
        })
        .map(c => (c[0] < c[1] ? c : [c[1], c[0]])); // Chuẩn hóa [lat, lng]

      if (rawMatches.length > 0) {
        console.log(`[Parser] Quét HTML thấy ${rawMatches.length} tọa độ phù hợp.`);
        if (isFinalPlaceOnlyUrl) {
          if (!extracted.destination) extracted.destination = rawMatches[rawMatches.length - 1];
          extracted.origin = null;
        } else {
          if (!extracted.origin) extracted.origin = rawMatches[0];
          if (!extracted.destination) extracted.destination = rawMatches[rawMatches.length - 1];
        }
        delete extracted.error;
      }
    }

    if (preferredPlaceDestination && !isFinalRouteUrl) {
      extracted = {
        origin: null,
        destination: preferredPlaceDestination,
      };
    }

    extracted = normalizeCoordinateResult(extracted);

    if (!extracted.destination) {
      if (fallbackExtracted?.destination) {
        return res.json({
          success: true,
          origin: extracted.origin || fallbackExtracted.origin || null,
          destination: fallbackExtracted.destination,
          resolvedUrl: finalUrl || normalizedUrl
        });
      }

      return res.json({
        success: false,
        message: 'Không tìm thấy thông tin tọa độ. Vui lòng thử dùng Link đầy đủ từ trình duyệt.',
        resolvedUrl: finalUrl
      });
    }

    console.log('[Parser] Kết quả cuối cùng:', extracted);
    return res.json({
      success: true,
      origin: extracted.origin,
      destination: extracted.destination,
      resolvedUrl: finalUrl
    });

  } catch (err) {
    console.error('[Parser] Lỗi nghiêm trọng:', err);

    const fallbackExtracted = normalizeCoordinateResult(extractCoordinates(normalizedUrl));
    if (!fallbackExtracted.error && fallbackExtracted.destination) {
      return res.json({
        success: true,
        origin: fallbackExtracted.origin || null,
        destination: fallbackExtracted.destination,
        resolvedUrl: normalizedUrl,
        warning: 'Đã dùng tọa độ đọc trực tiếp từ link do không kết nối được tới Google Maps.'
      });
    }

    return res.json({
      success: false,
      message: 'Lỗi kết nối đến Google Maps.',
      error: err.message
    });
  }
});

module.exports = router;
