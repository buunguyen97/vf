const express = require('express');
const axios = require('axios');
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

  // Remove mobile app parameters that can cause issues
  normalized = normalized.replace(/[?&]g_st=[^&]*/g, '');
  normalized = normalized.replace(/[?&]g_ep=[^&]*/g, '');
  normalized = normalized.replace(/[?&]lucs=[^&]*/g, '');
  normalized = normalized.replace(/[?&]skid=[^&]*/g, '');

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

  // If origin and destination are the same or very close (< 100m), treat as single location
  if (normalized.origin && normalized.destination) {
    const latDiff = Math.abs(normalized.origin[0] - normalized.destination[0]);
    const lngDiff = Math.abs(normalized.origin[1] - normalized.destination[1]);
    const distanceApprox = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) * 111000; // rough meters

    if (distanceApprox < 100) {
      normalized.origin = null;
    }
  }

  return normalized;
}

function isValidCoordinatePair(lat, lng) {
  return Number.isFinite(lat)
    && Number.isFinite(lng)
    && lat >= -90
    && lat <= 90
    && lng >= -180
    && lng <= 180;
}

function isValidVietnamCoordinatePair(lat, lng) {
  return isValidCoordinatePair(lat, lng)
    && lat >= 8
    && lat <= 24
    && lng >= 102
    && lng <= 110;
}

function toValidCoordinatePair(lat, lng, { preferVietnam = false } = {}) {
  if (!isValidCoordinatePair(lat, lng)) return null;
  if (preferVietnam && !isValidVietnamCoordinatePair(lat, lng)) return null;
  return [lat, lng];
}

function decodeHtmlAttribute(value) {
  return `${value || ''}`
    .replace(/&amp;/g, '&')
    .replace(/\\u003d/g, '=')
    .replace(/\\u0026/g, '&')
    .replace(/\\u003c/g, '<')
    .replace(/\\u003e/g, '>');
}

function extractPreviewPlaceUrl(html, baseUrl) {
  const previewMatches = [
    html.match(/<link[^>]+href="([^"]*\/maps\/preview\/place[^"]+)"/i),
    html.match(/(\/maps\/preview\/place\?[^"'<>\s]+)/i),
    html.match(/(https?:\/\/www\.google\.[^"'<>\s]+\/maps\/preview\/place\?[^"'<>\s]+)/i),
  ];

  const match = previewMatches.find(Boolean);
  if (!match) return null;

  try {
    return new URL(decodeHtmlAttribute(match[1]), baseUrl).href;
  } catch {
    return null;
  }
}

function extractPreviewDirectionsCoordinates(html) {
  const previewMatches = [
    ...html.matchAll(/<link[^>]+href="([^"]*\/maps\/preview\/directions[^"]+)"/gi),
    ...html.matchAll(/(\/maps\/preview\/directions\?[^"'<>\s]+)/gi),
    ...html.matchAll(/(https?:\/\/www\.google\.[^"'<>\s]+\/maps\/preview\/directions\?[^"'<>\s]+)/gi),
  ];

  for (const match of previewMatches) {
    const decodedAttribute = decodeHtmlAttribute(match[1]);
    let decodedUrl = decodedAttribute;

    try {
      decodedUrl = decodeURIComponent(decodedAttribute);
    } catch {
      // Keep the attribute as-is if Google changes the escaping format.
    }

    const pairs = [...decodedUrl.matchAll(/!3m2!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/g)]
      .map((coordMatch) => toValidCoordinatePair(parseFloat(coordMatch[1]), parseFloat(coordMatch[2]), { preferVietnam: true }))
      .filter(Boolean);

    if (pairs.length >= 2) {
      return {
        origin: pairs[0],
        destination: pairs[pairs.length - 1],
      };
    }

    if (pairs.length === 1) {
      return {
        origin: null,
        destination: pairs[0],
      };
    }
  }

  return null;
}

function findPreviewPlaceCoordinate(value, depth = 0) {
  if (!Array.isArray(value) || depth > 12) return null;

  if (
    value.length >= 3 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    typeof value[2] === 'number'
  ) {
    const pair = toValidCoordinatePair(value[2], value[1], { preferVietnam: true });
    if (pair) return pair;
  }

  for (const child of value) {
    const found = findPreviewPlaceCoordinate(child, depth + 1);
    if (found) return found;
  }

  return null;
}

function extractPreviewPlaceCoordinate(previewText) {
  const cleanedText = `${previewText || ''}`.replace(/^\)\]\}'\s*/, '').trim();

  try {
    const parsed = JSON.parse(cleanedText);
    const parsedCoordinate = findPreviewPlaceCoordinate(parsed);
    if (parsedCoordinate) return parsedCoordinate;
  } catch {
    // Some Google responses are JSON-like payloads with an XSSI prefix.
  }

  const coordinateTriples = [...cleanedText.matchAll(/\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*\]/g)];
  for (const match of coordinateTriples) {
    const pair = toValidCoordinatePair(parseFloat(match[3]), parseFloat(match[2]), { preferVietnam: true });
    if (pair) return pair;
  }

  return null;
}

async function resolvePreviewPlaceDestination(html, baseUrl) {
  const previewUrl = extractPreviewPlaceUrl(html, baseUrl);
  if (!previewUrl) return null;

  try {
    const response = await axios.get(previewUrl, {
      maxRedirects: 10,
      timeout: 20000,
      validateStatus: (status) => status < 500,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'vi-vn',
        'Referer': 'https://www.google.com/'
      }
    });

    if (response.status !== 200) return null;

    return extractPreviewPlaceCoordinate(response.data);
  } catch (err) {
    console.error('[Parser] Lỗi resolve preview/place:', err.message);
    return null;
  }
}

function extractPreferredPlaceDestination(urlStr) {
  if (!urlStr) return null;

  const exactMatches = [...urlStr.matchAll(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/g)];
  if (exactMatches.length > 0) {
    const last = exactMatches[exactMatches.length - 1];
    return toValidCoordinatePair(parseFloat(last[1]), parseFloat(last[2]), { preferVietnam: true });
  }

  const fallbackMatches = [...urlStr.matchAll(/!1d(-?\d+\.\d+)!2d(-?\d+\.\d+)/g)];
  if (fallbackMatches.length > 0) {
    const last = fallbackMatches[fallbackMatches.length - 1];
    return toValidCoordinatePair(parseFloat(last[2]), parseFloat(last[1]), { preferVietnam: true });
  }

  return null;
}

async function geocodeGoogleMapsQuery(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const q = `${parsed.searchParams.get('q') || ''}`.trim();
    if (!q) return null;

    const geocodeUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&countrycodes=vn&limit=1&accept-language=vi`;
    const response = await axios.get(geocodeUrl, {
      headers: { 'User-Agent': 'VFRangeAssistant/1.0' },
      timeout: 20000,
      validateStatus: (status) => status < 500
    });

    if (response.status !== 200) return null;

    const results = response.data;
    const bestMatch = Array.isArray(results) ? results[0] : null;
    if (!bestMatch?.lat || !bestMatch?.lon) return null;

    return [parseFloat(bestMatch.lat), parseFloat(bestMatch.lon)];
  } catch (err) {
    console.error('[Geocode] Lỗi geocode query:', err.message);
    return null;
  }
}

function hasFtidQuery(urlStr) {
  try {
    const parsed = new URL(urlStr);
    return parsed.searchParams.has('ftid');
  } catch {
    return false;
  }
}

function hasCoordinateLikeQuery(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const q = `${parsed.searchParams.get('q') || ''}`.trim();
    if (!q) return false;

    return /-?\d+\.\d+\s*,\s*-?\d+\.\d+/.test(q);
  } catch {
    return false;
  }
}

async function geocodeTextAddress(address) {
  if (!address || typeof address !== 'string' || address.trim().length === 0) return null;

  try {
    // Try original address first
    let geocodeUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&countrycodes=vn&limit=1&accept-language=vi`;
    let response = await axios.get(geocodeUrl, {
      headers: { 'User-Agent': 'VFRangeAssistant/1.0' },
      timeout: 20000,
      validateStatus: (status) => status < 500
    });

    if (response.status === 200) {
      const results = response.data;
      const bestMatch = Array.isArray(results) ? results[0] : null;
      if (bestMatch?.lat && bestMatch?.lon) {
        return [parseFloat(bestMatch.lat), parseFloat(bestMatch.lon)];
      }
    }

    // If failed, try simplifying the address (take first part before comma)
    const simplifiedAddress = address.split(',')[0].trim();
    if (simplifiedAddress && simplifiedAddress !== address) {
      console.log(`[Geocode] Retrying with simplified address: ${simplifiedAddress}`);
      geocodeUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(simplifiedAddress)}&format=json&countrycodes=vn&limit=1&accept-language=vi`;
      response = await axios.get(geocodeUrl, {
        headers: { 'User-Agent': 'VFRangeAssistant/1.0' },
        timeout: 20000,
        validateStatus: (status) => status < 500
      });

      if (response.status === 200) {
        const results = response.data;
        const bestMatch = Array.isArray(results) ? results[0] : null;
        if (bestMatch?.lat && bestMatch?.lon) {
          return [parseFloat(bestMatch.lat), parseFloat(bestMatch.lon)];
        }
      }
    }

    return null;
  } catch (err) {
    console.error('[Geocode] Lỗi geocode address:', err.message);
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
           if (match) origin = toValidCoordinatePair(parseFloat(match[1]), parseFloat(match[2]), { preferVietnam: true });
       }
       if (pathParts[3]) {
           const match = pathParts[3].match(coordRegex);
           if (match) destination = toValidCoordinatePair(parseFloat(match[1]), parseFloat(match[2]), { preferVietnam: true });
       }
    }

    // Try URL params for explicit coordinates
    const qParam = parsedUrl.searchParams.get('q');
    if (qParam && !destination) {
      const qMatch = qParam.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
      if (qMatch) destination = toValidCoordinatePair(parseFloat(qMatch[1]), parseFloat(qMatch[2]), { preferVietnam: true });
    }
    const saddr = parsedUrl.searchParams.get('saddr');
    if (saddr && !origin) {
      const saddrMatch = saddr.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
      if (saddrMatch) origin = toValidCoordinatePair(parseFloat(saddrMatch[1]), parseFloat(saddrMatch[2]), { preferVietnam: true });
    }
    const daddr = parsedUrl.searchParams.get('daddr');
    if (daddr && !destination) {
      const daddrMatch = daddr.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
      if (daddrMatch) destination = toValidCoordinatePair(parseFloat(daddrMatch[1]), parseFloat(daddrMatch[2]), { preferVietnam: true });
    }
    const destParam = parsedUrl.searchParams.get('destination');
    if (destParam && !destination) {
      const destMatch = destParam.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
      if (destMatch) destination = toValidCoordinatePair(parseFloat(destMatch[1]), parseFloat(destMatch[2]), { preferVietnam: true });
    }
    const originParam = parsedUrl.searchParams.get('origin');
    if (originParam && !origin) {
      const originMatch = originParam.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
      if (originMatch) origin = toValidCoordinatePair(parseFloat(originMatch[1]), parseFloat(originMatch[2]), { preferVietnam: true });
    }

    // Try extracted place via !1d !2d or !3d !4d variables in URL string
    if (!destination || !origin) {
        // Collect all !1d !2d matches
        const dMatches = [...urlStr.matchAll(/!1d(-?\d+\.\d+)!2d(-?\d+\.\d+)/g)];
        const extractedCoords = dMatches
          .map(m => toValidCoordinatePair(parseFloat(m[2]), parseFloat(m[1]), { preferVietnam: true }))
          .filter(Boolean); // 1d is lon, 2d is lat

        // Also fallback to !3d (lat) !4d (lon)
        const d34Matches = [...urlStr.matchAll(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/g)];
        d34Matches.forEach(m => {
          const pair = toValidCoordinatePair(parseFloat(m[1]), parseFloat(m[2]), { preferVietnam: true });
          if (pair) extractedCoords.push(pair);
        });

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
             const pair = toValidCoordinatePair(parseFloat(atMatch[1]), parseFloat(atMatch[2]), { preferVietnam: true });
             if (pair) destination = pair;
        }
    }
    
    // Try raw lat,lng in path like /place/lat,lng/
    if (!destination && !origin) {
        const pathMatch = parsedUrl.pathname.match(/\/(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (pathMatch) {
            destination = toValidCoordinatePair(parseFloat(pathMatch[1]), parseFloat(pathMatch[2]), { preferVietnam: true });
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

  let initialExtracted = extractCoordinates(normalizedUrl);

  // Try to extract from saddr/daddr parameters first
  try {
    const parsedUrl = new URL(normalizedUrl);
    const saddr = parsedUrl.searchParams.get('saddr');
    const daddr = parsedUrl.searchParams.get('daddr');

    if (saddr || daddr) {
      let origin = null;
      let destination = null;

      // Check if saddr is coordinates
      if (saddr) {
        const saddrMatch = saddr.match(/(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
        if (saddrMatch) {
          origin = [parseFloat(saddrMatch[1]), parseFloat(saddrMatch[2])];
        }
      }

      // Check if daddr is coordinates or address
      if (daddr) {
        const daddrMatch = daddr.match(/(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
        if (daddrMatch) {
          destination = [parseFloat(daddrMatch[1]), parseFloat(daddrMatch[2])];
        } else {
          // Try geocoding the address
          const geocoded = await geocodeTextAddress(daddr);
          if (geocoded) {
            destination = geocoded;
          }
        }
      }

      if (destination) {
        return res.json({
          success: true,
          origin: origin,
          destination: destination,
          resolvedUrl: normalizedUrl
        });
      }
    }
  } catch (err) {
    console.error('[Parser] Lỗi xử lý saddr/daddr:', err.message);
  }

  if (!initialExtracted.error && initialExtracted.destination) {
    return res.json({
      success: true,
      origin: initialExtracted.origin,
      destination: initialExtracted.destination,
      resolvedUrl: normalizedUrl
    });
  }

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

    if (isQueryPlaceUrl && hasCoordinateLikeQuery(normalizedUrl)) {
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
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    let response;
    let fetchError = null;

    // Retry logic for shortened URLs (they're more prone to transient failures)
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const axiosResponse = await axios.get(normalizedUrl, {
          maxRedirects: 10,
          timeout: 20000,
          signal: controller.signal,
          validateStatus: (status) => status < 500,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'vi-vn',
            'Referer': 'https://www.google.com/'
          }
        });
        response = {
          url: axiosResponse.request.res.responseUrl || axiosResponse.config.url,
          text: async () => axiosResponse.data
        };
        fetchError = null;
        break;
      } catch (err) {
        fetchError = err;
        console.error(`[Parser] Lỗi fetch attempt ${attempt + 1}:`, err.message);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }
    }

    clearTimeout(timeoutId);

    if (fetchError) {
      throw fetchError;
    }

    const finalUrl = response.url;
    console.log(`[Parser] URL sau redirect: ${finalUrl}`);
    const isFinalPlaceOnlyUrl = isPlaceOnlyGoogleMapsUrl(finalUrl);
    const isFinalRouteUrl = isRouteGoogleMapsUrl(finalUrl);
    const isFinalQueryPlaceUrl = isMapsQueryPlaceUrl(finalUrl);
    const preferredFinalPlaceDestination = isFinalPlaceOnlyUrl
      ? extractPreferredPlaceDestination(finalUrl)
      : null;
    let finalHtml = null;
    const getFinalHtml = async () => {
      if (finalHtml === null) {
        finalHtml = await response.text();
      }
      return finalHtml;
    };

    // Try to extract from saddr/daddr parameters in final URL first
    let extractedOrigin = null;
    let extractedDestination = null;

    try {
      const parsedUrl = new URL(finalUrl);
      const saddr = parsedUrl.searchParams.get('saddr');
      const daddr = parsedUrl.searchParams.get('daddr');

      if (saddr || daddr) {
        // Check if saddr is coordinates
        if (saddr) {
          const saddrMatch = saddr.match(/(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
          if (saddrMatch) {
            extractedOrigin = toValidCoordinatePair(parseFloat(saddrMatch[1]), parseFloat(saddrMatch[2]), { preferVietnam: true });
          }
        }

        // Check if daddr is coordinates or address
        if (daddr) {
          const daddrMatch = daddr.match(/(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
          if (daddrMatch) {
            extractedDestination = toValidCoordinatePair(parseFloat(daddrMatch[1]), parseFloat(daddrMatch[2]), { preferVietnam: true });
          } else {
            const shouldReadDirectionsPreview = parsedUrl.searchParams.has('geocode') || parsedUrl.searchParams.has('ftid');
            const previewDirections = shouldReadDirectionsPreview
              ? extractPreviewDirectionsCoordinates(await getFinalHtml())
              : null;

            if (previewDirections?.origin && !extractedOrigin) {
              extractedOrigin = previewDirections.origin;
            }
            if (previewDirections?.destination) {
              extractedDestination = previewDirections.destination;
            }

            if (!extractedDestination) {
              // Fall back to geocoding only after checking Google's richer directions payload.
              const geocoded = await geocodeTextAddress(daddr);
              if (geocoded) {
                extractedDestination = geocoded;
              }
            }
          }
        }

        // If we have both origin and destination, return immediately
        if (extractedOrigin && extractedDestination) {
          return res.json({
            success: true,
            origin: extractedOrigin,
            destination: extractedDestination,
            resolvedUrl: finalUrl
          });
        }

        // If we only have origin but daddr geocoding failed, continue to try other extraction methods
        // Don't return here, let it fall through to extractCoordinates
      }
    } catch (err) {
      console.error('[Parser] Lỗi xử lý saddr/daddr từ finalUrl:', err.message);
    }

    if (isFinalQueryPlaceUrl && hasCoordinateLikeQuery(finalUrl)) {
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

    // Merge with extractedOrigin/extractedDestination from saddr/daddr
    if (extractedOrigin && !extracted.origin) {
      extracted.origin = extractedOrigin;
    }
    if (extractedDestination && !extracted.destination) {
      extracted.destination = extractedDestination;
    }

    // If we have both now, return
    if (extracted.origin && extracted.destination) {
      return res.json({
        success: true,
        origin: extracted.origin,
        destination: extracted.destination,
        resolvedUrl: finalUrl
      });
    }

    // If no coordinates found but has text addresses, try geocoding
    if ((!extracted.origin || !extracted.destination) && isFinalRouteUrl) {
      const parsedUrl = new URL(finalUrl);
      const saddr = parsedUrl.searchParams.get('saddr');
      const daddr = parsedUrl.searchParams.get('daddr');

      if (saddr && !extracted.origin) {
        const geocodedOrigin = await geocodeTextAddress(saddr);
        if (geocodedOrigin) {
          extracted.origin = geocodedOrigin;
        }
      }

      if (daddr && !extracted.destination) {
        const geocodedDestination = await geocodeTextAddress(daddr);
        if (geocodedDestination) {
          extracted.destination = geocodedDestination;
        }
      }
    }

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
    const html = await getFinalHtml();
    let preferredPlaceDestination = null;

    if (extracted.error || !extracted.origin || !extracted.destination) {
      console.log('[Parser] Đang quét sâu nội dung HTML...');
      const shouldAvoidBroadHtmlCoordinateScan = isFinalQueryPlaceUrl && hasFtidQuery(finalUrl);

      // Kiểm tra xem có bị dính trang "Robot check" của Google không
      if (html.includes('unusual traffic from your computer network') || html.includes('captcha')) {
        console.error('[Parser] LỖI: Google đã chặn IP của VPS này (Robot Check).');
        return res.json({
          success: false,
          message: 'Lỗi: Google Maps đang chặn máy chủ. Cách khắc phục: Hãy dán link "đầy đủ" từ trình duyệt thay vì dùng nút Chia sẻ trong App, hoặc dán tọa độ thủ công.'
        });
      }

      const previewPlaceDestination = await resolvePreviewPlaceDestination(html, finalUrl);
      if (previewPlaceDestination && !isFinalRouteUrl) {
        return res.json({
          success: true,
          origin: null,
          destination: previewPlaceDestination,
          resolvedUrl: finalUrl
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
      // Format: [lng,lat] hoặc (lng,lat) hoặc lng,lat
      const coordinatePairs = [];

      // Find format: [106.710494,10.786648]
      const bracketMatches = [...html.matchAll(/\[(-?\d+\.\d+),(-?\d+\.\d+)\]/g)];
      for (const m of bracketMatches) {
        const lng = parseFloat(m[1]);
        const lat = parseFloat(m[2]);
        // Check if valid Vietnam coordinates
        if ((lat >= 8 && lat <= 24 && lng >= 102 && lng <= 110) ||
            (lng >= 8 && lng <= 24 && lat >= 102 && lat <= 110)) {
          // Normalize to [lat, lng]
          const isVn1 = (lat >= 8 && lat <= 24) && (lng >= 102 && lng <= 110);
          coordinatePairs.push(isVn1 ? [lat, lng] : [lng, lat]);
        }
      }

      // If we found coordinate pairs, use them for origin/destination
      if (!shouldAvoidBroadHtmlCoordinateScan && coordinatePairs.length >= 2) {
        extracted.origin = coordinatePairs[0];
        extracted.destination = coordinatePairs[coordinatePairs.length - 1];
        console.log(`[Parser] Found ${coordinatePairs.length} coordinate pairs from HTML`);
      } else if (!shouldAvoidBroadHtmlCoordinateScan && coordinatePairs.length === 1) {
        extracted.destination = coordinatePairs[0];
      }

      // Fallback: Tìm dạng: 10.123456,106.123456 hoặc 10.123456, 106.123456
      if ((!extracted.origin || !extracted.destination) && !shouldAvoidBroadHtmlCoordinateScan) {
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
    }

    if (preferredPlaceDestination && !isFinalRouteUrl) {
      extracted = {
        origin: null,
        destination: preferredPlaceDestination,
      };
    }

    extracted = normalizeCoordinateResult(extracted);

    if (!extracted.destination && isFinalQueryPlaceUrl) {
      const geocodedDestination = await geocodeGoogleMapsQuery(finalUrl);
      if (geocodedDestination) {
        return res.json({
          success: true,
          origin: extracted.origin || null,
          destination: geocodedDestination,
          resolvedUrl: finalUrl
        });
      }
    }

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

    // Try to extract from URL parameters as fallback
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

    // Last resort: try geocoding saddr/daddr if present
    try {
      const parsedUrl = new URL(normalizedUrl);
      const daddr = parsedUrl.searchParams.get('daddr');
      if (daddr) {
        const geocoded = await geocodeTextAddress(daddr);
        if (geocoded) {
          const saddr = parsedUrl.searchParams.get('saddr');
          let origin = null;
          if (saddr) {
            const saddrMatch = saddr.match(/(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
            if (saddrMatch) {
              origin = [parseFloat(saddrMatch[1]), parseFloat(saddrMatch[2])];
            }
          }
          return res.json({
            success: true,
            origin: origin,
            destination: geocoded,
            resolvedUrl: normalizedUrl,
            warning: 'Đã geocode địa chỉ do không thể truy cập Google Maps.'
          });
        }
      }
    } catch (geocodeErr) {
      console.error('[Parser] Lỗi geocode fallback:', geocodeErr.message);
    }

    const errorMessage = err.response?.status === 502
      ? 'Lỗi 502: Google Maps tạm thời không phản hồi. Vui lòng thử lại sau ít phút.'
      : 'Lỗi kết nối đến Google Maps.';

    return res.json({
      success: false,
      message: errorMessage,
      error: err.message
    });
  }
});

module.exports = router;
