import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
export default function InteractiveMap({ latitude, longitude, onChange }: { latitude: number | null; longitude: number | null; onChange: (lat: number, lon: number) => void }) {
  const host = useRef<HTMLDivElement>(null), map = useRef<L.Map | null>(null), marker = useRef<L.CircleMarker | null>(null), callback = useRef(onChange), [failed, setFailed] = useState(false);
  callback.current = onChange;
  useEffect(() => {
    const m = L.map(host.current!, { scrollWheelZoom: false }).setView(latitude !== null && longitude !== null ? [latitude,longitude] : [39.5,-98.35], latitude !== null ? 12 : 4); map.current = m;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors' }).on('tileerror', () => setFailed(true)).addTo(m);
    m.on('click', e => callback.current(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))));
    const resize = new ResizeObserver(() => m.invalidateSize()); resize.observe(host.current!);
    return () => { resize.disconnect(); m.remove(); map.current = null; marker.current = null; };
  }, []);
  useEffect(() => { if (!map.current) return; if (marker.current) marker.current.remove(); marker.current = null; if (latitude !== null && longitude !== null && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) { marker.current = L.circleMarker([latitude,longitude], { radius: 9, color: '#d40511', fillColor: '#ffcc00', fillOpacity: 1, weight: 3 }).addTo(map.current); map.current.panTo([latitude,longitude]); } }, [latitude,longitude]);
  return <div><div ref={host} className="interactive-map" aria-label="Interactive location map; click to set coordinates"/>{failed && <p className="warning-box">Some map tiles could not load. Coordinate editing remains available.</p>}<p className="field-hint">Pan and zoom, then click to set the location. OpenStreetMap receives map-tile requests for the visible area; notes and financial details stay in this browser. No automatic address lookup is performed.</p></div>;
}
