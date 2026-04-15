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

  try {
    // Basic validation to prevent fetching arbitrary domains
    const parsedInitUrl = new URL(url);
    const validDomains = ['google.com', 'www.google.com', 'maps.google.com', 'maps.app.goo.gl', 'goo.gl'];
    
    if (!validDomains.includes(parsedInitUrl.hostname)) {
      return res.json({ success: false, message: 'Đây không phải là link Google Maps hợp lệ.' });
    }

    // Follow redirect to get final URL
    // Sometimes Google Maps checks User-Agent, so we provide a generic browser one to avoid blocking
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
      }
    });
    clearTimeout(timeoutId);

    let finalUrl = response.url;
    let extractedCoordinates = extractCoordinates(finalUrl);

    if (extractedCoordinates.error || !extractedCoordinates.origin || !extractedCoordinates.destination) {
      // Try fetching HTML body to check for meta refresh or embedded location
      const text = await response.text();
      
      if (extractedCoordinates.error) {
        const metaMatch = text.match(/url=([^"'>\s]+)/i);
        if (metaMatch) {
           finalUrl = unescape(metaMatch[1].replace(/&amp;/g, '&'));
           const metaExtracted = extractCoordinates(finalUrl);
           if (!metaExtracted.error) {
               extractedCoordinates = metaExtracted;
           }
        }
      }
      
      // Advanced Fallback: If URL still doesn't contain BOTH lat/lng, Google Maps embeds
      // points in the scripts as `[lng, lat]` tuples.
      if (extractedCoordinates.error || !extractedCoordinates.origin || !extractedCoordinates.destination) {
         const genericMatches = [...text.matchAll(/\[(-?\d{1,3}\.\d{3,}),(-?\d{1,2}\.\d{3,})\]/g)];
         
         if (genericMatches.length >= 2) {
             if (!extractedCoordinates.origin) {
                 extractedCoordinates.origin = [parseFloat(genericMatches[0][2]), parseFloat(genericMatches[0][1])];
             }
             if (!extractedCoordinates.destination) {
                 const last = genericMatches[genericMatches.length - 1];
                 extractedCoordinates.destination = [parseFloat(last[2]), parseFloat(last[1])];
             }
             delete extractedCoordinates.error;
         } else if (genericMatches.length === 1) {
             if (!extractedCoordinates.destination) {
                 extractedCoordinates.destination = [parseFloat(genericMatches[0][2]), parseFloat(genericMatches[0][1])];
             }
             delete extractedCoordinates.error;
         }
      }
    }

    if (extractedCoordinates.error) {
      return res.json({
        success: false,
        message: 'Không thể tách tọa độ chính xác từ link này. Vui lòng dùng link đầy đủ hoặc dán tọa độ thủ công.',
        resolvedUrl: finalUrl
      });
    }

    return res.json({
      success: true,
      origin: extractedCoordinates.origin,
      destination: extractedCoordinates.destination,
      resolvedUrl: finalUrl
    });

  } catch (err) {
    console.error('Lỗi phân tích link Google Maps:', err);
    return res.json({
      success: false,
      message: 'Có lỗi xảy ra khi xử lý link. Vui lòng thử lại.',
      error: err.message
    });
  }
});

module.exports = router;
