import { useState } from 'react';
import { CircleHelp, Map } from 'lucide-react';
import { evApi } from '../../services/api';
import UsageGuideModal from '../help/UsageGuideModal';

function normalizeGoogleMapsInput(rawValue) {
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

function getApiErrorMessage(error) {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    'Lỗi kết nối tới máy chủ khi phân tích link.'
  );
}

function isSupportedGoogleMapsUrl(urlString) {
  try {
    const parsed = new URL(urlString);
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

export default function GoogleMapsLinkInput({ onOriginDestFound }) {
  const [urlState, setUrlState] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [guideOpen, setGuideOpen] = useState(false);

  const handleParse = async () => {
    const normalizedUrl = normalizeGoogleMapsInput(urlState);

    if (!normalizedUrl) {
      setError('Vui lòng dán link Google Maps vào ô trống.');
      return;
    }

    if (!isSupportedGoogleMapsUrl(normalizedUrl)) {
      setError('Link không đúng định dạng của Google Maps.');
      return;
    }

    try {
      new URL(normalizedUrl);
    } catch {
      setError('Link không hợp lệ.');
      return;
    }

    setError('');
    setMessage('');
    setLoading(true);
    setUrlState(normalizedUrl);

    try {
      const result = await evApi.parseGoogleMapsLink(normalizedUrl);
      
      if (!result.success) {
        setError(result.message || 'Không thể tách tọa độ từ link này.');
      } else {
        const resolvedDestination = result.destination || result.origin || null;

        if (!resolvedDestination) {
          setError('Không thể xác định điểm đến từ link này.');
          return;
        }

        setMessage('Đã lấy tọa độ thành công!');
        // Call the parent handler
        onOriginDestFound({
          origin: result.origin || null,
          destination: resolvedDestination,
        });
        // Clear input upon success after a short delay
        setTimeout(() => {
          setUrlState('');
          setMessage('');
        }, 3000);
      }
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenGoogleMaps = () => {
    window.open('https://www.google.com/maps/dir/', '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <div className="bg-[#111111] border border-white/10 rounded-xl p-3 mb-2 flex flex-col gap-2 relative">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-full bg-[#1464F4]/20 flex items-center justify-center shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1464F4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
              </svg>
            </div>
            <span className="text-white text-sm font-semibold truncate">Dán link chỉ đường Google Maps</span>
          </div>

          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/6 px-2.5 py-1.5 text-[11px] font-semibold text-white/78 transition-colors hover:bg-white/12 hover:text-white"
          >
            <CircleHelp className="h-3.5 w-3.5 text-[#74E3A3]" />
            Hướng dẫn
          </button>
        </div>

        <div className="rounded-lg border border-[#1464F4]/16 bg-[#1464F4]/6 px-3 py-2 text-[11px] leading-5 text-white/68">
          <span className="md:hidden">
            Mẹo nhanh: mở tuyến đường trên Google Maps, nhấn chia sẻ, sao chép link rồi quay lại đây{' '}
            <span className="font-semibold text-white">chạm vào ô bên dưới và dán</span>, sau đó bấm{' '}
            <span className="font-semibold text-white">Phân tích</span>.
          </span>
          <span className="hidden md:inline">
            Mẹo nhanh: bấm <span className="font-semibold text-white">Mở GG Map</span>, tạo tuyến đường, sao chép link rồi quay lại đây để{' '}
            <span className="font-semibold text-white">Phân tích</span>.
          </span>
        </div>
        
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleOpenGoogleMaps}
            className="flex shrink-0 items-center justify-center gap-1 rounded-lg border border-[#00B14F]/20 bg-[#00B14F]/10 px-2.5 py-2 text-xs font-bold text-[#74E3A3] transition-colors hover:bg-[#00B14F]/18"
          >
            <Map className="h-4 w-4" />
            <span className="hidden min-[370px]:inline">Mở GG Map</span>
            <span className="min-[370px]:hidden">Map</span>
          </button>
          <input
            type="text"
            value={urlState}
            onChange={(e) => setUrlState(e.target.value)}
            placeholder="https://maps.app.goo.gl/..."
            className="min-w-0 flex-1 bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#1464F4]"
            onKeyDown={(e) => e.key === 'Enter' && handleParse()}
          />
          <button
            onClick={handleParse}
            disabled={loading}
            className="bg-[#1464F4] hover:bg-[#0f4eb8] disabled:bg-gray-600 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm font-bold flex items-center justify-center transition-colors shrink-0"
          >
            {loading ? (
               <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : 'Phân tích'}
          </button>
        </div>

        {error && (
          <div className="text-red-400 text-xs mt-1 bg-red-400/10 p-2 rounded border border-red-400/20">
            {error}
          </div>
        )}
        
        {message && (
          <div className="text-[#00B14F] text-xs mt-1 bg-[#00B14F]/10 p-2 rounded border border-[#00B14F]/20">
            {message}
          </div>
        )}
      </div>

      <UsageGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
    </>
  );
}
