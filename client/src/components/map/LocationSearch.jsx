import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Crosshair, MapPin, Search } from 'lucide-react';
import { evApi } from '../../services/api';

export default function LocationSearch({
  title,
  placeholder,
  iconColor = '#1464F4',
  onLocationSelect,
  defaultDisplay = '',
  showLocateButton = false,
  onLocateMe,
  readOnly = false,
  compact = false,
}) {
  const [query, setQuery] = useState(defaultDisplay);
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedDisplay, setSelectedDisplay] = useState(defaultDisplay);
  const [isCurrentLocation, setIsCurrentLocation] = useState(!!defaultDisplay);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef(null);

  useEffect(() => {
    if (defaultDisplay !== undefined && defaultDisplay !== query) {
      setQuery(defaultDisplay);
      setSelectedDisplay(defaultDisplay);
      setIsCurrentLocation(typeof defaultDisplay === 'string' && defaultDisplay.includes('Vị trí hiện tại'));
    }
  }, [defaultDisplay]);

  useEffect(() => {
    if (query.trim().length <= 2 || query === selectedDisplay) {
      setResults([]);
      return;
    }

    setIsCurrentLocation(false);
    const debounceTimer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const data = await evApi.searchLocation(query);
        setResults(data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(debounceTimer);
  }, [query, selectedDisplay]);

  useEffect(() => () => {
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
    }
  }, []);

  const searchLocation = (e) => {
    e.preventDefault();
  };

  const handleSelect = (place) => {
    const lat = parseFloat(place.lat);
    const lon = parseFloat(place.lon);

    onLocationSelect([lat, lon], place.display_name);
    setResults([]);
    setSelectedDisplay(place.display_name);
    setQuery(place.display_name);
    setIsCurrentLocation(false);
  };

  const handleLocateMe = () => {
    if (onLocateMe) {
      onLocateMe();
      setQuery('📍 Vị trí hiện tại của bạn');
      setSelectedDisplay('📍 Vị trí hiện tại của bạn');
      setIsCurrentLocation(true);
      setResults([]);
    }
  };

  const handleCopy = async () => {
    if (!query) return;

    try {
      await navigator.clipboard.writeText(query);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className={`relative rounded-xl border border-white/10 bg-[#111111] shadow-lg ${compact ? 'p-2.5 md:p-3' : 'p-3 md:p-4'} ${results.length > 0 ? 'z-[200]' : 'z-10'}`}>
      <h2 className={`flex items-center justify-between font-bold uppercase tracking-wide text-white/90 ${compact ? 'mb-2 text-[11px]' : 'mb-3 text-xs'}`}>
        <span className="flex items-center gap-2">
          {title}
          {isCurrentLocation && (
            <span className="rounded-full bg-[#00B14F]/15 px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-[#00B14F] animate-pulse">
              GPS
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {showLocateButton && !isCurrentLocation && (
            <button
              type="button"
              onClick={handleLocateMe}
              className={`flex cursor-pointer items-center gap-1.5 rounded-full border border-[#00B14F]/20 bg-[#00B14F]/10 font-medium normal-case tracking-normal text-[#00B14F] transition-colors hover:bg-[#00B14F]/20 ${compact ? 'px-2 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[10px]'}`}
            >
              <Crosshair className="h-3 w-3" />
              Chọn vị trí hiện tại
            </button>
          )}
          {!showLocateButton || isCurrentLocation ? <MapPin className="h-3.5 w-3.5 text-white/50" /> : null}
        </div>
      </h2>

      <form onSubmit={searchLocation} className="group relative">
        <input
          type="text"
          placeholder={placeholder}
          readOnly={readOnly}
          className={`w-full rounded-lg border font-medium text-white transition-all placeholder:text-gray-600 focus:bg-black/60 focus:outline-none focus:ring-1 focus:border-transparent ${
            compact ? 'py-1.5 pl-2.5 text-[12px]' : 'py-2 pl-3 text-sm'
          } ${
            readOnly ? (compact ? 'cursor-text select-all truncate pr-16' : 'cursor-text select-all pr-20') : 'pr-10'
          } ${isCurrentLocation ? 'border-[#00B14F]/30 bg-[#00B14F]/5' : 'border-white/10 bg-black/40'}`}
          style={{ '--tw-ring-color': iconColor }}
          value={query}
          onFocus={() => {
            if (isCurrentLocation && !readOnly) {
              setQuery('');
              setSelectedDisplay('');
              setIsCurrentLocation(false);
            }
          }}
          onChange={(e) => {
            if (readOnly) return;
            setQuery(e.target.value);
            if (selectedDisplay && e.target.value !== selectedDisplay) {
              setSelectedDisplay('');
            }
          }}
        />

        {readOnly ? (
          <div className="absolute bottom-1 right-1 top-1 flex items-center">
            <button
              type="button"
              onClick={handleCopy}
              disabled={!query}
              className="flex h-full items-center gap-1 rounded-md bg-white/6 px-2 text-[11px] font-semibold text-white/65 transition-colors hover:bg-white/12 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-[#22c55e]" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Đã chép' : 'Copy'}
            </button>
          </div>
        ) : (
          <div className="absolute bottom-1 right-1 top-1 flex items-center gap-0.5">
            <div className="flex aspect-square h-full items-center justify-center rounded-md bg-white/5 transition-colors" style={{ backgroundColor: query ? `${iconColor}20` : '' }}>
              {isSearching ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: iconColor }}></div>
              ) : (
                <Search className="h-3.5 w-3.5 text-white/50 group-focus-within:text-white" />
              )}
            </div>
          </div>
        )}
      </form>

      {readOnly && !compact && (
        <p className="mt-2 text-[10px] text-white/35">
          Ô này chỉ hiển thị tọa độ để sao chép, không chỉnh sửa trực tiếp.
        </p>
      )}

      {results.length > 0 && (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[100] max-h-60 origin-top overflow-y-auto rounded-xl border border-white/10 bg-[#0A0A0A] shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-in fade-in zoom-in-95 duration-200">
          {results.map((place, idx) => (
            <button
              key={idx}
              type="button"
              className="flex w-full items-center gap-3 overflow-hidden border-b border-white/5 p-3 text-left text-xs transition-all last:border-0 hover:bg-white/10"
              onClick={() => handleSelect(place)}
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/5">
                <MapPin className="h-3 w-3" style={{ color: iconColor }} />
              </div>
              <span className="line-clamp-2 leading-snug text-gray-300">{place.display_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
