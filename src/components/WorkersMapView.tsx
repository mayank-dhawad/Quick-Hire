import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { WorkerItem } from './WorkerDiscoveryModal';
import { MapPin, Phone, Star, X } from 'lucide-react';
import { getTranslation } from '../lib/translations';

interface WorkersMapViewProps {
  workers: WorkerItem[];
  centerLat?: number;
  centerLon?: number;
  centerLabel?: string;
  radiusKm?: number;
  currentLang?: string;
  onSelectWorker?: (worker: WorkerItem) => void;
  onCallWorker?: (workerId: string) => void;
  onClose?: () => void;
}

// Fix default Leaflet icon paths in Vite bundler
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const centerPinIcon = L.divIcon({
  className: 'custom-center-pin',
  html: `<div style="background-color:#0284c7; width:20px; height:20px; border-radius:50%; border:3px solid #ffffff; box-shadow:0 0 10px rgba(0,0,0,0.4);"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

export const WorkersMapView: React.FC<WorkersMapViewProps> = ({
  workers,
  centerLat = 20.5937, // Default center of India
  centerLon = 78.9629,
  centerLabel = 'Search Center',
  radiusKm,
  currentLang = 'English',
  onSelectWorker,
  onCallWorker,
  onClose,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  const t = (key: string): string => getTranslation(currentLang, key);

  // Filter workers with valid coordinates
  const workersWithCoords = workers.filter(
    (w) =>
      w.latitude !== null &&
      w.latitude !== undefined &&
      w.longitude !== null &&
      w.longitude !== undefined &&
      !isNaN(Number(w.latitude)) &&
      !isNaN(Number(w.longitude))
  );

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Destroy existing map if any
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    // Determine initial center and zoom
    const initialLat = workersWithCoords.length > 0 && centerLat === 20.5937
      ? Number(workersWithCoords[0].latitude)
      : centerLat;
    const initialLon = workersWithCoords.length > 0 && centerLon === 78.9629
      ? Number(workersWithCoords[0].longitude)
      : centerLon;

    const initialZoom = radiusKm ? (radiusKm <= 25 ? 11 : radiusKm <= 50 ? 10 : 8) : 6;

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLon],
      zoom: initialZoom,
      zoomControl: true,
      attributionControl: true,
    });

    mapInstanceRef.current = map;

    // Add OpenStreetMap base tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    // If an employer center point is set, display center pin and radius circle
    if (centerLat && centerLon && (centerLat !== 20.5937 || centerLon !== 78.9629)) {
      L.marker([centerLat, centerLon], { icon: centerPinIcon })
        .addTo(map)
        .bindPopup(`<strong>📍 ${centerLabel}</strong><br/>Search Origin`);

      if (radiusKm && radiusKm > 0) {
        L.circle([centerLat, centerLon], {
          radius: radiusKm * 1000,
          color: '#0284c7',
          fillColor: '#38bdf8',
          fillOpacity: 0.12,
          weight: 2,
          dashArray: '4, 6',
        }).addTo(map);
      }
    }

    // Add approximate worker locality pins
    const bounds = L.latLngBounds([]);
    if (centerLat && centerLon && (centerLat !== 20.5937 || centerLon !== 78.9629)) {
      bounds.extend([centerLat, centerLon]);
    }

    workersWithCoords.forEach((worker) => {
      const lat = Number(worker.latitude);
      const lon = Number(worker.longitude);
      const name = worker.profiles?.full_name || 'Verified Rural Worker';
      const category = worker.category || 'General Work';
      const distance = worker.distance_km ? `${worker.distance_km} km away` : '';
      const buttonId = `map-btn-call-${worker.id}`;

      const marker = L.marker([lat, lon], { icon: defaultIcon }).addTo(map);
      bounds.extend([lat, lon]);

      const popupHtml = `
        <div style="font-family: inherit; font-size: 12px; line-height: 1.4; min-width: 150px;">
          <div style="font-weight: 800; font-size: 13px; color: #0f172a;">${name}</div>
          <div style="color: #0284c7; font-weight: 700; margin-bottom: 4px;">${category}</div>
          ${distance ? `<div style="font-weight: 700; color: #16a34a; font-size: 11px; margin-bottom: 4px;">📍 ${distance}</div>` : ''}
          <div style="color: #64748b; font-size: 11px; margin-bottom: 6px;">
            ${worker.profiles?.village ? worker.profiles.village + ', ' : ''}${worker.profiles?.district || ''}
          </div>
          <button id="${buttonId}" style="display:block; width:100%; padding: 6px 10px; background: #0284c7; color: white; border: none; border-radius: 6px; font-weight: 700; font-size: 11px; cursor: pointer; text-align: center;">
            📞 Contact Worker
          </button>
        </div>
      `;
      marker.bindPopup(popupHtml);

      marker.on('popupopen', () => {
        const btn = document.getElementById(buttonId);
        if (btn) {
          btn.onclick = () => {
            if (onCallWorker) {
              onCallWorker(worker.id);
            } else if (onSelectWorker) {
              onSelectWorker(worker);
            }
          };
        }
      });

      if (onSelectWorker) {
        marker.on('click', () => onSelectWorker(worker));
      }
    });

    if (workersWithCoords.length > 1) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
    }

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [workers, centerLat, centerLon, radiusKm, centerLabel]);

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-slate-50 space-y-2">
      {/* Top Map Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-slate-200">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-brand-600" />
          <span className="text-xs font-bold text-slate-800">
            Workers Nearby Map ({workersWithCoords.length} plotted)
          </span>
          {radiusKm && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
              Radius: {radiusKm} km
            </span>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            title="Close map"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Map View Container */}
      <div
        ref={mapContainerRef}
        className="w-full h-72 sm:h-96 z-0"
        style={{ minHeight: '280px' }}
      />

      {/* Footer Notice */}
      <div className="px-4 py-2 bg-slate-100/70 border-t border-slate-200 text-[11px] text-slate-500 flex items-center justify-between">
        <span>Approximate locality-level markers to protect worker residence privacy.</span>
        <span className="text-[10px] text-slate-400">Map data © OpenStreetMap</span>
      </div>
    </div>
  );
};

export default WorkersMapView;
