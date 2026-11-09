import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { Transaction } from './model';
import type { NearbyFacility } from './facilityLocations';
import 'leaflet/dist/leaflet.css';

type Props = {
  position: L.LatLngTuple | null;
  facilityName: string;
  facilityCode: string;
  nearby: NearbyFacility[];
  onPlace?: (latitude: number, longitude: number) => void;
  onOpen: (transaction: Transaction) => void;
};

function pin(label: string, selected = false) {
  const text = document.createElement('span');
  text.textContent = label;
  return L.divIcon({
    html: text,
    className: selected ? 'facility-pin facility-pin-selected' : 'facility-pin',
    iconSize: selected ? [46, 28] : [30, 28],
  });
}

function nearestWorld(position: L.LatLngTuple, longitude: number): L.LatLngTuple {
  const offset = ((position[1] - longitude + 540) % 360) - 180;
  return [position[0], longitude + offset];
}

export default function InteractiveMap({ position, facilityName, facilityCode, nearby, onPlace, onOpen }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const [tilesUnavailable, setTilesUnavailable] = useState(false);
  const editing = Boolean(onPlace);

  useEffect(() => {
    if (!host.current) return;
    const instance = L.map(host.current, { scrollWheelZoom: false });
    map.current = instance;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).on('tileerror', () => setTilesUnavailable(true)).addTo(instance);
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(host.current);
    return () => {
      resize.disconnect();
      instance.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !onPlace) return;
    const place = (event: L.LeafletMouseEvent) => {
      const { lat, lng } = event.latlng.wrap();
      onPlace(Number(lat.toFixed(6)), Number(lng.toFixed(6)));
    };
    instance.on('click', place);
    return () => { instance.off('click', place); };
  }, [onPlace]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    if (!position) {
      if (instance.getZoom() === undefined) instance.setView([39.5, -98.35], 4);
      return;
    }
    const pins = L.layerGroup().addTo(instance);
    const bounds = L.latLngBounds([position]);
    L.marker(position, {
      icon: pin(facilityCode || 'Site', true),
      title: facilityName,
      keyboard: false,
      interactive: false,
      zIndexOffset: 1000,
    }).addTo(pins);
    if (!editing) {
      nearby.forEach(({ transaction, position: neighborPosition }, index) => {
        const point = nearestWorld(neighborPosition, position[1]);
        bounds.extend(point);
        const title = `Open ${transaction.name}`;
        const marker = L.marker(point, {
          icon: pin(String(index + 1)),
          title,
          bubblingMouseEvents: false,
        });
        marker.on('add', () => marker.getElement()?.setAttribute('aria-label', title));
        marker.on('keydown', (event: L.LeafletKeyboardEvent) => {
          const { key } = event.originalEvent;
          if (key === 'Enter' || key === ' ') {
            event.originalEvent.preventDefault();
            onOpen(transaction);
          }
        });
        marker.on('click', () => onOpen(transaction)).addTo(pins);
      });
      instance.fitBounds(bounds, { padding: [32, 35], maxZoom: 12, animate: false });
    } else {
      instance.setView(position, Math.max(12, instance.getZoom() ?? 0), { animate: false });
    }
    return () => { pins.remove(); };
  }, [position, facilityName, facilityCode, nearby, editing, onOpen]);

  return <>
    <div
      ref={host}
      className={`interactive-map facility-map ${editing ? 'is-editing' : ''}`}
      role="region"
      aria-label={editing ? 'Location editor map' : 'Map of this facility and nearby facilities'}
    />
    {tilesUnavailable && <p className="facility-map-message">Some background tiles are unavailable. Facility pins and the nearby list are available.</p>}
  </>;
}
