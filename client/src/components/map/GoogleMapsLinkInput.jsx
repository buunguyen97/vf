import { useState } from 'react';
import { evApi } from '../../services/api';

export default function GoogleMapsLinkInput({ onOriginDestFound }) {
  const [urlState, setUrlState] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleParse = async () => {
    if (!urlState.trim()) {
      setError('Vui lòng dán link Google Maps vào ô trống.');
      return;
    }

    try {
      // Basic check
      const parsed = new URL(urlState);
      if (!parsed.hostname.includes('google') && !parsed.hostname.includes('goo.gl')) {
        setError('Link không đúng định dạng của Google Maps.');
        return;
      }
    } catch {
      setError('Link không hợp lệ.');
      return;
    }

    setError('');
    setMessage('');
    setLoading(true);

    try {
      const result = await evApi.parseGoogleMapsLink(urlState);
      
      if (!result.success) {
        setError(result.message || 'Không thể tách tọa độ từ link này.');
      } else {
        setMessage('Đã lấy tọa độ thành công!');
        // Call the parent handler
        onOriginDestFound({
          origin: result.origin, 
          destination: result.destination
        });
        // Clear input upon success after a short delay
        setTimeout(() => {
          setUrlState('');
          setMessage('');
        }, 3000);
      }
    } catch (err) {
      setError('Lỗi kết nối tới máy chủ khi phân tích link.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#111111] border border-white/10 rounded-xl p-3 mb-2 flex flex-col gap-2 relative">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-[#1464F4]/20 flex items-center justify-center shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1464F4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
          </svg>
        </div>
        <span className="text-white text-sm font-semibold">Dán link chỉ đường Google Maps</span>
      </div>
      
      <div className="flex gap-2">
        <input 
          type="text" 
          value={urlState}
          onChange={(e) => setUrlState(e.target.value)}
          placeholder="https://maps.app.goo.gl/..."
          className="flex-1 bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#1464F4]"
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
  );
}
