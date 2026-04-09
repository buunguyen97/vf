import { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Crosshair } from 'lucide-react';
import { evApi } from '../../services/api';

export default function LocationSearch({ title, placeholder, iconColor = "#1464F4", onLocationSelect, defaultDisplay = '', showLocateButton = false, onLocateMe }) {
  const [query, setQuery] = useState(defaultDisplay);
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedDisplay, setSelectedDisplay] = useState(defaultDisplay);
  const [isCurrentLocation, setIsCurrentLocation] = useState(!!defaultDisplay);
  const initializedRef = useRef(false);

  // Sync when defaultDisplay changes (e.g. after geolocation resolves)
  useEffect(() => {
    if (defaultDisplay && !initializedRef.current) {
      setQuery(defaultDisplay);
      setSelectedDisplay(defaultDisplay);
      setIsCurrentLocation(true);
      initializedRef.current = true;
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

  const searchLocation = (e) => {
    e.preventDefault();
  };

  const handleSelect = (place) => {
    const lat = parseFloat(place.lat);
    const lon = parseFloat(place.lon);
    
    onLocationSelect([lat, lon]);
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

  return (
    <div className={`bg-white/5 backdrop-blur-2xl rounded-xl p-3 md:p-4 border border-white/10 shadow-lg relative ${results.length > 0 ? 'z-[200]' : 'z-50'}`}>
      <h2 className="text-xs font-bold text-white/90 mb-3 uppercase tracking-wide flex justify-between items-center">
        <span className="flex items-center gap-2">
          {title}
          {isCurrentLocation && (
            <span className="text-[10px] font-medium text-[#00B14F] bg-[#00B14F]/15 px-2 py-0.5 rounded-full normal-case tracking-normal animate-pulse">
              GPS
            </span>
          )}
        </span>
        {showLocateButton && !isCurrentLocation ? (
          <button
            type="button"
            onClick={handleLocateMe}
            className="flex items-center gap-1.5 text-[10px] font-medium text-[#00B14F] bg-[#00B14F]/10 hover:bg-[#00B14F]/20 px-2.5 py-1 rounded-full normal-case tracking-normal transition-colors cursor-pointer border border-[#00B14F]/20"
          >
            <Crosshair className="w-3 h-3" />
            Chọn vị trí hiện tại
          </button>
        ) : (
          <MapPin className="w-3.5 h-3.5 text-white/50" />
        )}
      </h2>
      <form onSubmit={searchLocation} className="relative group">
        <input 
          type="text" 
          placeholder={placeholder}
          className={`w-full bg-black/40 border text-white rounded-lg py-2 pl-3 pr-10 focus:outline-none focus:ring-1 focus:bg-black/60 focus:border-transparent transition-all placeholder:text-gray-600 text-sm font-medium ${isCurrentLocation ? 'border-[#00B14F]/30 bg-[#00B14F]/5' : 'border-white/10'}`}
          style={{ '--tw-ring-color': iconColor }}
          value={query}
          onFocus={() => {
            if (isCurrentLocation) {
              setQuery('');
              setSelectedDisplay('');
              setIsCurrentLocation(false);
            }
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            if (selectedDisplay && e.target.value !== selectedDisplay) {
              setSelectedDisplay('');
            }
          }}
        />
        <div className="absolute right-1 top-1 bottom-1 flex items-center gap-0.5">
          <div className="aspect-square h-full flex items-center justify-center bg-white/5 rounded-md transition-colors" style={{ backgroundColor: query ? `${iconColor}20` : '' }}>
            {isSearching ? <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: iconColor }}></div> : <Search className="w-3.5 h-3.5 text-white/50 group-focus-within:text-white" />}
          </div>
        </div>
      </form>

      {/* Dropdown Results */}
      {results.length > 0 && (
        <div className="absolute top-[calc(100%+8px)] left-0 right-0 bg-[#0A0A0A]/95 backdrop-blur-xl border border-white/10 rounded-xl overflow-y-auto max-h-60 z-[100] shadow-[0_20px_50px_rgba(0,0,0,0.5)] transform origin-top animate-in fade-in zoom-in-95 duration-200">
           {results.map((place, idx) => (
             <button
                key={idx}
                type="button"
                className="w-full text-left p-3 hover:bg-white/10 flex gap-3 text-xs transition-all border-b border-white/5 last:border-0 items-center overflow-hidden"
                onClick={() => handleSelect(place)}
             >
                <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                   <MapPin className="w-3 h-3" style={{ color: iconColor }} />
                </div>
                <span className="text-gray-300 line-clamp-2 leading-snug">
                  {place.display_name}
                </span>
             </button>
           ))}
        </div>
      )}
    </div>
  );
}
