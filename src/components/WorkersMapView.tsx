import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { WorkerItem } from './WorkerDiscoveryModal';
import {
  MapPin,
  RefreshCw,
  Maximize2,
  Minimize2,
  X,
  Compass,
  AlertCircle,
  Users
} from 'lucide-react';
import { getTranslation } from '../lib/translations';

export interface WorkersMapViewProps {
  workers: WorkerItem[];
  centerLat?: number;
  centerLon?: number;
  centerLabel?: string;
  radiusKm?: number;
  currentLang?: string;
  selectedWorkerId?: string | null;
  onSelectWorker?: (worker: WorkerItem) => void;
  onCallWorker?: (workerId: string) => void;
  onSelectLocation?: (lat: number, lon: number, label: string) => void;
  onRefreshAvailability?: () => void;
  onClose?: () => void;
}

// Helpers
function getCategoryColor(category?: string | null): string {
  switch (category) {
    case 'Agriculture':
      return '#059669'; // Emerald
    case 'Construction':
      return '#d97706'; // Amber
    case 'Daily work':
      return '#0284c7'; // Sky/Blue
    case 'Skilled self-employed':
      return '#7c3aed'; // Purple
    default:
      return '#007a5b'; // Brand green
  }
}

function escapeHtml(str?: string | null): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function createWorkerPinIcon(category?: string | null, isSelected = false): L.DivIcon {
  const color = getCategoryColor(category);
  const ring = isSelected
    ? 'border: 3px solid #f59e0b; box-shadow: 0 0 14px rgba(245, 158, 11, 0.8);'
    : 'border: 2px solid #ffffff; box-shadow: 0 2px 8px rgba(0,0,0,0.35);';
  const size = isSelected ? 30 : 24;
  return L.divIcon({
    className: 'custom-worker-pin',
    html: `
      <div style="background-color: ${color}; width: ${size}px; height: ${size}px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; ${ring} cursor: pointer;">
        <div style="width: 7px; height: 7px; background: white; border-radius: 50%; transform: rotate(45deg);"></div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
}

function createClusterIcon(count: number): L.DivIcon {
  const size = count < 10 ? 32 : count < 50 ? 38 : 44;
  return L.divIcon({
    className: 'custom-cluster-pin',
    html: `
      <div style="background: linear-gradient(135deg, #007a5b, #0284c7); color: white; width: ${size}px; height: ${size}px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: ${count > 99 ? '11px' : '13px'}; border: 3px solid #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.35); cursor: pointer;">
        ${count}
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const centerPinIcon = L.divIcon({
  className: 'custom-center-pin',
  html: `<div style="background-color:#0284c7; width:22px; height:22px; border-radius:50%; border:3px solid #ffffff; box-shadow:0 0 12px rgba(2, 132, 199, 0.7); display:flex; align-items:center; justify-content:center;"><div style="width:6px; height:6px; background:white; border-radius:50%;"></div></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

export const WorkersMapView: React.FC<WorkersMapViewProps> = ({
  workers,
  centerLat = 20.5937, // Default center of India
  centerLon = 78.9629,
  centerLabel = 'Search Center',
  radiusKm,
  currentLang = 'English',
  selectedWorkerId,
  onSelectWorker,
  onCallWorker,
  onSelectLocation,
  onRefreshAvailability,
  onClose,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const centerLayerRef = useRef<L.LayerGroup | null>(null);

  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const t = (key: string): string => getTranslation(currentLang, key);

  // Extract workers with valid numeric coordinates (from worker or profile)
  const workersWithCoords = useMemo(() => {
    return workers
      .map((w) => {
        const lat =
          w.latitude !== null && w.latitude !== undefined && !isNaN(Number(w.latitude)) && Number(w.latitude) !== 0
            ? Number(w.latitude)
            : w.profiles?.latitude !== null && w.profiles?.latitude !== undefined && !isNaN(Number(w.profiles.latitude)) && Number(w.profiles.latitude) !== 0
            ? Number(w.profiles.latitude)
            : null;

        const lon =
          w.longitude !== null && w.longitude !== undefined && !isNaN(Number(w.longitude)) && Number(w.longitude) !== 0
            ? Number(w.longitude)
            : w.profiles?.longitude !== null && w.profiles?.longitude !== undefined && !isNaN(Number(w.profiles.longitude)) && Number(w.profiles.longitude) !== 0
            ? Number(w.profiles.longitude)
            : null;

        return {
          ...w,
          latitude: lat,
          longitude: lon,
        };
      })
      .filter(
        (w): w is WorkerItem & { latitude: number; longitude: number } =>
          w.latitude !== null &&
          w.longitude !== null &&
          w.latitude >= -90 &&
          w.latitude <= 90 &&
          w.longitude >= -180 &&
          w.longitude <= 180
      );
  }, [workers]);

  const unmappedCount = workers.length - workersWithCoords.length;

  // Spatial Clustering renderer for markers
  const renderClusterMarkers = useCallback(
    (map: L.Map) => {
      const markersLayer = markersLayerRef.current;
      if (!markersLayer) return;
      markersLayer.clearLayers();

      const zoom = map.getZoom();
      const shouldCluster = zoom < 13;
      const clusterPixelThreshold = zoom <= 8 ? 60 : zoom <= 10 ? 45 : 30;

      interface ClusterGroup {
        workers: (WorkerItem & { latitude: number; longitude: number })[];
        lat: number;
        lon: number;
        bounds: L.LatLngBounds;
      }

      const clusters: ClusterGroup[] = [];

      workersWithCoords.forEach((worker) => {
        const pt = map.latLngToLayerPoint([worker.latitude, worker.longitude]);
        let placed = false;

        if (shouldCluster) {
          for (const c of clusters) {
            const cPt = map.latLngToLayerPoint([c.lat, c.lon]);
            const dist = Math.hypot(pt.x - cPt.x, pt.y - cPt.y);
            if (dist < clusterPixelThreshold) {
              c.workers.push(worker);
              c.bounds.extend([worker.latitude, worker.longitude]);
              c.lat = c.workers.reduce((sum, w) => sum + w.latitude, 0) / c.workers.length;
              c.lon = c.workers.reduce((sum, w) => sum + w.longitude, 0) / c.workers.length;
              placed = true;
              break;
            }
          }
        }

        if (!placed) {
          clusters.push({
            workers: [worker],
            lat: worker.latitude,
            lon: worker.longitude,
            bounds: L.latLngBounds([worker.latitude, worker.longitude], [worker.latitude, worker.longitude]),
          });
        }
      });

      clusters.forEach((cluster) => {
        if (cluster.workers.length > 1) {
          const clusterMarker = L.marker([cluster.lat, cluster.lon], {
            icon: createClusterIcon(cluster.workers.length),
          }).addTo(markersLayer);

          clusterMarker.on('click', () => {
            map.fitBounds(cluster.bounds.pad(0.3), { maxZoom: 15 });
          });
        } else {
          const worker = cluster.workers[0];
          const isSelected = selectedWorkerId === worker.id;
          const marker = L.marker([worker.latitude, worker.longitude], {
            icon: createWorkerPinIcon(worker.category, isSelected),
            zIndexOffset: isSelected ? 1000 : 0,
          }).addTo(markersLayer);

          const name = escapeHtml(worker.profiles?.full_name || 'Verified Rural Worker');
          const category = escapeHtml(worker.category || 'General Work');
          const catColor = getCategoryColor(worker.category);
          const distance = worker.distance_km ? `${worker.distance_km} km away` : '';
          const locality = escapeHtml(
            worker.profiles?.village
              ? `${worker.profiles.village}, ${worker.profiles?.district || ''}`
              : worker.profiles?.district || worker.profiles?.location || 'Rural Region'
          );
          const wage = worker.daily_wage ? `₹${worker.daily_wage}/day` : '';
          const rating = worker.average_rating ? Number(worker.average_rating).toFixed(1) : '5.0';
          const callBtnId = `map-btn-call-${worker.id}`;
          const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${worker.latitude},${worker.longitude}`;

          const popupHtml = `
            <div style="font-family: inherit; font-size: 12px; line-height: 1.4; min-width: 200px; padding: 2px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                <div style="font-weight: 800; font-size: 13px; color: #0f172a;">${name}</div>
                <span style="background: #ecfdf5; color: #059669; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 9999px; border: 1px solid #a7f3d0;">✓ Verified</span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
                <span style="color: ${catColor}; font-weight: 700; font-size: 11px;">${category}</span>
                <span style="color: #f59e0b; font-weight: 700; font-size: 11px;">★ ${rating}</span>
                ${wage ? `<span style="color: #475569; font-weight: 700; font-size: 11px;">${wage}</span>` : ''}
              </div>
              ${distance ? `<div style="font-weight: 700; color: #16a34a; font-size: 11px; margin-bottom: 4px;">📍 ${distance}</div>` : ''}
              <div style="color: #64748b; font-size: 11px; margin-bottom: 8px;">
                ${locality}
              </div>
              <div style="display: flex; gap: 6px;">
                <button id="${callBtnId}" style="flex: 1; padding: 7px 10px; background: #007a5b; color: white; border: none; border-radius: 8px; font-weight: 700; font-size: 11px; cursor: pointer; text-align: center;">
                  📞 Contact
                </button>
                <a href="${directionsUrl}" target="_blank" rel="noopener noreferrer" style="padding: 7px 10px; background: #f8fafc; color: #334155; border: 1px solid #cbd5e1; border-radius: 8px; font-weight: 700; font-size: 11px; text-decoration: none; text-align: center; display: inline-flex; align-items: center; justify-content: center;">
                  🧭 Route
                </a>
              </div>
            </div>
          `;

          marker.bindPopup(popupHtml);

          marker.on('popupopen', () => {
            const btn = document.getElementById(callBtnId);
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

          if (isSelected) {
            setTimeout(() => {
              marker.openPopup();
            }, 60);
          }
        }
      });
    },
    [workersWithCoords, selectedWorkerId, onCallWorker, onSelectWorker]
  );

  // Initialize Map Instance once
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const initialLat =
        workersWithCoords.length > 0 && centerLat === 20.5937
          ? Number(workersWithCoords[0].latitude)
          : centerLat;
      const initialLon =
        workersWithCoords.length > 0 && centerLon === 78.9629
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

      // OpenStreetMap Base Tile Layer with proper attribution
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      // Create managed layer groups
      markersLayerRef.current = L.layerGroup().addTo(map);
      centerLayerRef.current = L.layerGroup().addTo(map);

      // Interactive: Click map to set search center
      map.on('click', (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        if (onSelectLocation) {
          onSelectLocation(
            Number(lat.toFixed(4)),
            Number(lng.toFixed(4)),
            `Selected Location (${lat.toFixed(3)}, ${lng.toFixed(3)})`
          );
        }
      });

      // Update cluster markers on zoom/move
      map.on('zoomend', () => {
        renderClusterMarkers(map);
      });
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markersLayerRef.current = null;
        centerLayerRef.current = null;
      }
    };
  }, []);

  // Update center marker and radius circle whenever search center / radius changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const centerLayer = centerLayerRef.current;
    if (!map || !centerLayer) return;

    centerLayer.clearLayers();

    if (centerLat && centerLon && (centerLat !== 20.5937 || centerLon !== 78.9629)) {
      L.marker([centerLat, centerLon], { icon: centerPinIcon })
        .addTo(centerLayer)
        .bindPopup(`<strong>📍 ${escapeHtml(centerLabel)}</strong><br/><span style="font-size:11px; color:#64748b;">Search Origin</span>`);

      if (radiusKm && radiusKm > 0) {
        L.circle([centerLat, centerLon], {
          radius: radiusKm * 1000,
          color: '#0284c7',
          fillColor: '#38bdf8',
          fillOpacity: 0.12,
          weight: 2,
          dashArray: '5, 6',
        }).addTo(centerLayer);
      }
    }
  }, [centerLat, centerLon, radiusKm, centerLabel]);

  // Update worker markers whenever workersWithCoords changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    renderClusterMarkers(map);

    // Dynamic viewport fit
    const hasSearchOrigin = centerLat && centerLon && (centerLat !== 20.5937 || centerLon !== 78.9629);

    if (workersWithCoords.length > 1) {
      const bounds = L.latLngBounds([]);
      if (hasSearchOrigin) {
        bounds.extend([centerLat, centerLon]);
      }
      workersWithCoords.forEach((w) => bounds.extend([w.latitude, w.longitude]));
      map.fitBounds(bounds, { padding: [35, 35], maxZoom: 13 });
    } else if (workersWithCoords.length === 1) {
      const single = workersWithCoords[0];
      map.setView([single.latitude, single.longitude], 12);
    } else if (hasSearchOrigin) {
      map.setView([centerLat, centerLon], radiusKm ? (radiusKm <= 10 ? 12 : 10) : 10);
    }
  }, [workersWithCoords, renderClusterMarkers, centerLat, centerLon, radiusKm]);

  // Handle selectedWorkerId panning
  useEffect(() => {
    if (!selectedWorkerId || !mapInstanceRef.current) return;
    const target = workersWithCoords.find((w) => w.id === selectedWorkerId);
    if (target) {
      mapInstanceRef.current.setView([target.latitude, target.longitude], 14, { animate: true });
    }
  }, [selectedWorkerId, workersWithCoords]);

  // Invalidate map size on expand/collapse toggle
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (map) {
      setTimeout(() => {
        map.invalidateSize();
      }, 250);
    }
  }, [isExpanded]);

  const handleManualRefresh = () => {
    if (onRefreshAvailability) {
      setIsRefreshing(true);
      onRefreshAvailability();
      setTimeout(() => setIsRefreshing(false), 700);
    }
  };

  return (
    <div
      className={`relative w-full rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-slate-50 transition-all duration-300 ${
        isExpanded ? 'h-[520px]' : 'h-80 sm:h-96'
      }`}
    >
      {/* Top Map Bar */}
      <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-3 sm:px-4 py-2 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-2 overflow-hidden">
          <MapPin className="w-4 h-4 text-brand-600 shrink-0" />
          <span className="text-xs font-bold text-slate-800 truncate">
            {t('workersNearbyCount')} ({workersWithCoords.length} {t('workersPlotted')})
          </span>
          {radiusKm && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200 shrink-0">
              {radiusKm} km
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {onRefreshAvailability && (
            <button
              type="button"
              onClick={handleManualRefresh}
              className={`p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer ${
                isRefreshing ? 'animate-spin text-brand-600' : ''
              }`}
              title={t('refreshAvailability') || 'Refresh worker availability'}
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
            title={isExpanded ? t('shrinkMap') || 'Collapse Map' : t('expandMap') || 'Expand Map'}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              title="Close map"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Map View Canvas */}
      <div ref={mapContainerRef} className="w-full h-full z-0" style={{ minHeight: '260px' }} />

      {/* Empty / Unmapped Overlay */}
      {workersWithCoords.length === 0 && (
        <div className="absolute inset-0 z-5 flex items-center justify-center p-6 bg-slate-900/10 pointer-events-none">
          <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 shadow-md p-5 max-w-sm text-center pointer-events-auto space-y-2">
            <Users className="w-8 h-8 text-brand-600 mx-auto" />
            <h4 className="font-heading font-bold text-sm text-slate-800">
              {workers.length > 0 ? 'Locality Coordinates Pending' : t('noWorkersFound')}
            </h4>
            <p className="text-xs text-slate-500">
              {workers.length > 0
                ? `${workers.length} worker(s) in this category are listed in the directory below. No locality coordinates have been set for map plotting yet.`
                : 'No workers match the current category or radius filter. Try widening your radius.'}
            </p>
          </div>
        </div>
      )}

      {/* Interactive Hint & Unmapped Count Bar */}
      <div className="absolute bottom-0 inset-x-0 z-10 px-3 py-1.5 bg-white/95 backdrop-blur-md border-t border-slate-200 text-[11px] text-slate-600 flex items-center justify-between gap-2 shadow-2xs">
        <span className="flex items-center gap-1.5 truncate">
          <Compass className="w-3 h-3 text-brand-600 shrink-0" />
          <span className="truncate">{t('clickMapHint')}</span>
        </span>

        <div className="flex items-center gap-2 shrink-0">
          {unmappedCount > 0 && (
            <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-medium">
              +{unmappedCount} {t('unmappedWorkersNotice')}
            </span>
          )}
          <span className="text-[10px] text-slate-400">© OpenStreetMap</span>
        </div>
      </div>
    </div>
  );
};

export default WorkersMapView;
