const express = require('express');
const router = express.Router();

function extractCoordinates(urlStr) {
  let origin = null;
  let destination = null;

  try {
    const parsedUrl = new URL(urlStr);
    const lowercaseUrl = urlStr.toLowerCase();
    
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

        if (extractedCoords.length >= 2) {
            if (!origin) origin = extractedCoords[0];
            if (!destination) destination = extractedCoords[extractedCoords.length - 1];
        } else if (extractedCoords.length === 1) {
            if (!destination && origin) destination = extractedCoords[0];
            else if (!origin && destination) origin = extractedCoords[0];
            else if (!destination) destination = extractedCoords[0];
        }
    }

    // Try @lat,lng in path (viewport center - useful as fallback for single places, less reliable for routes)
    if (!destination && !origin) {
        const atMatch = urlStr.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (atMatch) {
             destination = [parseFloat(atMatch[1]), parseFloat(atMatch[2])];
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

    return { origin, destination };
  } catch (error) {
    return { error: error.message };
  }
}

router.post('/parse-google-maps-link', async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.json({ success: false, message: 'URL không hợp lệ' });
  }

  console.log(`[Parser] Đang xử lý link: ${url}`);

  try {
    const parsedInitUrl = new URL(url);
    const validDomains = ['google.com', 'www.google.com', 'maps.google.com', 'maps.app.goo.gl', 'goo.gl'];
    
    if (!validDomains.includes(parsedInitUrl.hostname)) {
      return res.json({ success: false, message: 'Đây không phải là link Google Maps hợp lệ.' });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    // Giả lập trình duyệt đầy đủ hơn để tránh bị Google chặn IP VPS
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': 'https://www.google.com/'
      }
    });
    clearTimeout(timeoutId);

    const finalUrl = response.url;
    console.log(`[Parser] URL cuối cùng sau redirect: ${finalUrl}`);

    // Thử tách từ URL trước
    let extractedCoordinates = extractCoordinates(finalUrl);

    // Nếu URL không có, thì đọc nội dung HTML
    const htmlText = await response.text();
    
    // Nếu vẫn chưa có tọa độ từ URL, tìm trong HTML
    if (extractedCoordinates.error || !extractedCoordinates.origin || !extractedCoordinates.destination) {
      console.log('[Parser] Không tìm thấy đủ tọa độ trong URL, đang quét nội dung HTML...');
      
      // Tìm meta refresh hoặc link ẩn trong script
      const metaMatch = htmlText.match(/url=([^"'>\s]+)/i);
      if (metaMatch) {
        const metaUrl = decodeURIComponent(metaMatch[1].replace(/&amp;/g, '&'));
        console.log(`[Parser] Tìm thấy meta-refresh URL: ${metaUrl}`);
        const metaExtracted = extractCoordinates(metaUrl);
        if (!metaExtracted.error) {
          if (!extractedCoordinates.origin) extractedCoordinates.origin = metaExtracted.origin;
          if (!extractedCoordinates.destination) extractedCoordinates.destination = metaExtracted.destination;
          delete extractedCoordinates.error;
        }
      }

      // Regex quét tất cả các cặp [lat, lng] hoặc [lng, lat] phổ biến trong script của Google Maps
      // Google thường lưu dạng: [106.12345, 10.6789] (lng trước lat sau)
      const geoMatches = [...htmlText.matchAll(/\[(-?\d+\.\d+),(-?\d+\.\d+)\]/g)]
        .map(m => [parseFloat(m[1]), parseFloat(m[2])])
        // Lọc các số giống tọa độ Việt Nam (Lat: 8-24, Lng: 102-110)
        .filter(c => (c[0] > 100 && c[0] < 110 && c[1] > 8 && c[1] < 24) || (c[1] > 100 && c[1] < 110 && c[0] > 8 && c[0] < 24));

      if (geoMatches.length > 0) {
        console.log(`[Parser] Tìm thấy ${geoMatches.length} cặp số giống tọa độ trong HTML.`);
        
        // Chuẩn hóa: Lat luôn là số nhỏ (8-24), Lng luôn là số lớn (102-110)
        const normalized = geoMatches.map(c => {
          if (c[0] > c[1]) return [c[1], c[0]]; // [lat, lng]
          return c;
        });

        if (!extractedCoordinates.origin && normalized.length >= 2) {
          extractedCoordinates.origin = normalized[0];
          delete extractedCoordinates.error;
        }
        if (!extractedCoordinates.destination && normalized.length >= 1) {
          // Lấy cặp cuối cùng thường là điểm đến
          extractedCoordinates.destination = normalized[normalized.length - 1];
          delete extractedCoordinates.error;
        }
      }
    }

    if (extractedCoordinates.error || !extractedCoordinates.destination) {
      console.error('[Parser] Thất bại - Không trích xuất được tọa độ.');
      return res.json({
        success: false,
        message: 'Google Maps đang chặn truy cập từ Server hoặc link không chứa tọa độ trực tiếp. Hãy thử dùng link đầy đủ (không rút gọn) hoặc dán tọa độ thủ công.',
        resolvedUrl: finalUrl
      });
    }

    console.log('[Parser] Thành công:', extractedCoordinates);
    return res.json({
      success: true,
      origin: extractedCoordinates.origin,
      destination: extractedCoordinates.destination,
      resolvedUrl: finalUrl
    });

  } catch (err) {
    console.error('[Parser] Lỗi nghiêm trọng:', err);
    return res.json({
      success: false,
      message: 'Có lỗi xảy ra khi xử lý link. Vui lòng thử lại.',
      error: err.message
    });
  }
});

module.exports = router;
