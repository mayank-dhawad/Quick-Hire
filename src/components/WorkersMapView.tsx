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
  Users,
  Crosshair,
  RotateCcw,
  ListFilter,
  Phone,
  Star,
  ChevronRight,
  Search,
  CheckCircle2
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
  onViewProfile?: (worker: WorkerItem) => void;
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

function createWorkerPinIcon(category?: string | null, isSelected = false, isAvailable = false): L.DivIcon {
  const color = getCategoryColor(category);
  const statusColor = isAvailable ? '#16a34a' : '#94a3b8';
  const ring = isSelected
    ? 'border: 3px solid #f59e0b; box-shadow: 0 0 16px rgba(245, 158, 11, 0.9); transform: rotate(-45deg) scale(1.15);'
    : `border: 2px solid ${statusColor}; box-shadow: 0 2px 8px rgba(0,0,0,0.35); transform: rotate(-45deg);`;
  const size = isSelected ? 32 : 24;
  return L.divIcon({
    className: 'custom-worker-pin',
    html: `
      <div style="background-color: ${color}; width: ${size}px; height: ${size}px; border-radius: 50% 50% 50% 0; display: flex; align-items: center; justify-content: center; ${ring} cursor: pointer; transition: all 0.2s ease;">
        <div style="width: 7px; height: 7px; background: white; border-radius: 50%; transform: rotate(45deg);"></div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
}

function createClusterIcon(count: number): L.DivIcon {
  const size = count < 10 ? 34 : count < 50 ? 40 : 46;
  return L.divIcon({
    className: 'custom-cluster-pin',
    html: `
      <div style="background: linear-gradient(135deg, #007a5b, #0284c7); color: white; width: ${size}px; height: ${size}px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: ${count > 99 ? '11px' : '13px'}; border: 3px solid #ffffff; box-shadow: 0 4px 14px rgba(0,0,0,0.35); cursor: pointer; transition: transform 0.2s ease;">
        ${count}
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const centerPinIcon = L.divIcon({
  className: 'custom-center-pin',
  html: `<div style="background-color:#0284c7; width:22px; height:22px; border-radius:50%; border:3px solid #ffffff; box-shadow:0 0 14px rgba(2, 132, 199, 0.8); display:flex; align-items:center; justify-content:center;"><div style="width:6px; height:6px; background:white; border-radius:50%;"></div></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -11],
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
  onViewProfile,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const centerLayerRef = useRef<L.LayerGroup | null>(null);
  const markerMapRef = useRef<Map<string, L.Marker>>(new Map());

  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [showSidebar, setShowSidebar] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [activeWorkerId, setActiveWorkerId] = useState<string | null>(selectedWorkerId || null);
  const [workerSearch, setWorkerSearch] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'available' | 'unavailable'>('all');
  const renderClusterMarkersRef = useRef<((map: L.Map) => void) | null>(null);
  const onSelectLocationRef = useRef(onSelectLocation);

  useEffect(() => { onSelectLocationRef.current = onSelectLocation; }, [onSelectLocation]);
  useEffect(() => { setActiveWorkerId(selectedWorkerId || null); }, [selectedWorkerId]);

  const t = (key: string): string => getTranslation(currentLang, key);

  // Keep directory records even when they do not have map coordinates.
  // Zero is a valid latitude/longitude value; only reject missing, out-of-range,
  // or the (0, 0) Null Island placeholder.
  const workersWithCoords = useMemo(() => {
    const parseCoordinate = (value: unknown): number | null => {
      if (value === null || value === undefined || value === '') return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    return workers
      .map((worker) => ({
        ...worker,
        latitude: parseCoordinate(worker.latitude) ?? parseCoordinate(worker.profiles?.latitude),
        longitude: parseCoordinate(worker.longitude) ?? parseCoordinate(worker.profiles?.longitude),
      }))
      .filter(
        (worker): worker is WorkerItem & { latitude: number; longitude: number } =>
          worker.latitude !== null &&
          worker.longitude !== null &&
          worker.latitude >= -90 &&
          worker.latitude <= 90 &&
          worker.longitude >= -180 &&
          worker.longitude <= 180 &&
          !(worker.latitude === 0 && worker.longitude === 0)
      );
  }, [workers]);

  const unmappedCount = workers.length - workersWithCoords.length;

  const sortedNearbyWorkers = useMemo(() => {
    return [...workers].sort((a, b) => {
      const availableDelta = Number(b.is_available === true) - Number(a.is_available === true);
      if (availableDelta !== 0) return availableDelta;
      if (a.distance_km != null && b.distance_km != null) return a.distance_km - b.distance_km;
      if (a.distance_km != null) return -1;
      if (b.distance_km != null) return 1;
      return (a.profiles?.full_name || '').localeCompare(b.profiles?.full_name || '');
    });
  }, [workers]);

  const filteredSidebarWorkers = useMemo(() => {
    const query = workerSearch.trim().toLowerCase();
    return sortedNearbyWorkers.filter((worker) => {
      const isAvailable = worker.is_available === true;
      if (availabilityFilter === 'available' && !isAvailable) return false;
      if (availabilityFilter === 'unavailable' && worker.is_available !== false) return false;
      if (!query) return true;
      const haystack = [
        worker.profiles?.full_name,
        worker.category,
        worker.profiles?.village,
        worker.profiles?.city,
        worker.profiles?.district,
        worker.profiles?.location,
        ...(worker.skills || []),
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [sortedNearbyWorkers, workerSearch, availabilityFilter]);

  const visibleWorkersWithCoords = useMemo(() => {
    const visibleIds = new Set(filteredSidebarWorkers.map((worker) => worker.id));
    return workersWithCoords.filter((worker) => visibleIds.has(worker.id));
  }, [workersWithCoords, filteredSidebarWorkers]);

  // Spatial Clustering renderer for markers
  const renderClusterMarkers = useCallback(
    (map: L.Map) => {
      const markersLayer = markersLayerRef.current;
      if (!markersLayer) return;
      markersLayer.clearLayers();
      markerMapRef.current.clear();

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

      visibleWorkersWithCoords.forEach((worker) => {
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
          const isSelected = (activeWorkerId || selectedWorkerId) === worker.id;
          const marker = L.marker([worker.latitude, worker.longitude], {
            icon: createWorkerPinIcon(worker.category, isSelected, worker.is_available === true),
            zIndexOffset: isSelected ? 1000 : 0,
          }).addTo(markersLayer);

          markerMapRef.current.set(worker.id, marker);

          const name = escapeHtml(worker.profiles?.full_name || 'Verified Rural Worker');
          const category = escapeHtml(worker.category || 'General Work');
          const catColor = getCategoryColor(worker.category);
          const distanceText = worker.distance_km != null
            ? `~${worker.distance_km} km (approx. straight-line)`
            : '';
          const locality = escapeHtml(
            worker.profiles?.village
              ? `${worker.profiles.village}, ${worker.profiles?.district || ''}`
              : worker.profiles?.district || worker.profiles?.location || 'Rural Region'
          );
          const wage = worker.daily_wage ? `₹${worker.daily_wage}/day` : '';
          const rating = worker.average_rating != null ? Number(worker.average_rating).toFixed(1) : 'New';
          const isAvailable = worker.is_available === true;
          const callBtnId = `map-btn-call-${worker.id}`;
          const profileBtnId = `map-btn-profile-${worker.id}`;
          const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${worker.latitude},${worker.longitude}`;

          const popupHtml = `
            <div style="font-family: inherit; font-size: 12px; line-height: 1.4; min-width: 220px; padding: 2px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                <div style="font-weight: 800; font-size: 13px; color: #0f172a;">${name}</div>
                <span style="background: #ecfdf5; color: #059669; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 9999px; border: 1px solid #a7f3d0;">✓ Verified</span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px; flex-wrap: wrap;">
                <span style="color: ${catColor}; font-weight: 700; font-size: 11px;">${category}</span>
                <span style="color: #f59e0b; font-weight: 700; font-size: 11px;">★ ${rating}</span>
                ${wage ? `<span style="color: #334155; font-weight: 700; font-size: 11px;">${wage}</span>` : ''}
                <span style="color: ${worker.is_available === true ? '#059669' : worker.is_available === false ? '#dc2626' : '#a16207'}; font-size: 10px; font-weight: 600;">
                  ${worker.is_available === true ? '• Available for work' : worker.is_available === false ? '• Not available' : '• Availability not set'}
                </span>
              </div>
              ${distanceText ? `<div style="font-weight: 700; color: #16a34a; font-size: 11px; margin-bottom: 4px;">${distanceText}</div>` : ''}
              <div style="color: #64748b; font-size: 11px; margin-bottom: 8px;">
                ${locality}
              </div>
              <div style="display: flex; gap: 4px; margin-top: 6px;">
                <button id="${callBtnId}" style="flex: 1; padding: 6px 8px; background: #007a5b; color: white; border: none; border-radius: 8px; font-weight: 700; font-size: 11px; cursor: pointer; text-align: center;">
                  Contact
                </button>
                <button id="${profileBtnId}" style="flex: 1; padding: 6px 8px; background: #f1f5f9; color: #0f2942; border: 1px solid #cbd5e1; border-radius: 8px; font-weight: 700; font-size: 11px; cursor: pointer; text-align: center;">
                  Profile
                </button>
                <a href="${directionsUrl}" target="_blank" rel="noopener noreferrer" style="padding: 6px 8px; background: #f8fafc; color: #334155; border: 1px solid #cbd5e1; border-radius: 8px; font-weight: 700; font-size: 11px; text-decoration: none; text-align: center; display: inline-flex; align-items: center; justify-content: center;" title="Get directions">
                  Directions
                </a>
              </div>
            </div>
          `;

          marker.bindPopup(popupHtml);

          marker.on('popupopen', () => {
            setActiveWorkerId(worker.id);
            const callBtn = document.getElementById(callBtnId);
            if (callBtn) {
              callBtn.onclick = () => {
                if (onCallWorker) {
                  onCallWorker(worker.id);
                } else if (onSelectWorker) {
                  onSelectWorker(worker);
                }
              };
            }
            const profileBtn = document.getElementById(profileBtnId);
            if (profileBtn) {
              profileBtn.onclick = () => {
                if (onViewProfile) {
                  onViewProfile(worker);
                } else if (onSelectWorker) {
                  onSelectWorker(worker);
                }
              };
            }
          });

          if (onSelectWorker) {
            marker.on('click', () => {
              setActiveWorkerId(worker.id);
              onSelectWorker(worker);
            });
          }

          if (isSelected) {
            setTimeout(() => {
              marker.openPopup();
            }, 60);
          }
        }
      });
    },
    [visibleWorkersWithCoords, activeWorkerId, selectedWorkerId, onCallWorker, onSelectWorker, onViewProfile]
  );

  renderClusterMarkersRef.current = renderClusterMarkers;

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
      const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      });
      tileLayer.on('tileerror', () => {
        console.warn('[QuickHire Map] Tile load notice: Map tiles updating or offline.');
      });
      tileLayer.addTo(map);

      // Invalidate size after DOM settles so tiles render without gray corners
      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 200);

      // Create managed layer groups
      markersLayerRef.current = L.layerGroup().addTo(map);
      centerLayerRef.current = L.layerGroup().addTo(map);

      // Interactive: Click map to set search center. Use the latest callback.
      map.on('click', (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        onSelectLocationRef.current?.(
          Number(lat.toFixed(4)),
          Number(lng.toFixed(4)),
          `Selected Location (${lat.toFixed(3)}, ${lng.toFixed(3)})`
        );
      });

      // Update cluster markers on zoom/move
      map.on('zoomend', () => {
        renderClusterMarkersRef.current?.(map);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update center marker and radius circle whenever search center / radius changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const centerLayer = centerLayerRef.current;
    if (!map || !centerLayer) return;

    centerLayer.clearLayers();

    if (Number.isFinite(centerLat) && Number.isFinite(centerLon) && (centerLat !== 20.5937 || centerLon !== 78.9629)) {
      L.marker([centerLat, centerLon], { icon: centerPinIcon })
        .addTo(centerLayer)
        .bindPopup(
          `<strong>${escapeHtml(centerLabel)}</strong><br/><span style="font-size:11px; color:#64748b;">Search Origin (${centerLat.toFixed(3)}, ${centerLon.toFixed(3)})</span>${radiusKm ? `<br/><span style="font-size:11px; color:#0284c7; font-weight:700;">Radius: ${radiusKm} km</span>` : ''}`
        );

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

      const targetZoom = radiusKm
        ? radiusKm <= 2 ? 14 : radiusKm <= 5 ? 13 : radiusKm <= 15 ? 12 : radiusKm <= 35 ? 11 : radiusKm <= 75 ? 10 : 9
        : 11;
      map.setView([centerLat, centerLon], targetZoom, { animate: true });
    }
  }, [centerLat, centerLon, radiusKm, centerLabel]);

  // Update worker markers whenever workersWithCoords changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    renderClusterMarkers(map);

    // Dynamic viewport fit: give priority to search origin when active
    const hasSearchOrigin = Boolean(
      Number.isFinite(centerLat) &&
      Number.isFinite(centerLon) &&
      (centerLat !== 20.5937 || centerLon !== 78.9629)
    );

    if (hasSearchOrigin) {
      const targetZoom = radiusKm
        ? radiusKm <= 2 ? 14 : radiusKm <= 5 ? 13 : radiusKm <= 15 ? 12 : radiusKm <= 35 ? 11 : radiusKm <= 75 ? 10 : 9
        : 11;
      map.setView([centerLat, centerLon], targetZoom, { animate: true });
    } else if (visibleWorkersWithCoords.length > 1) {
      const bounds = L.latLngBounds([]);
      visibleWorkersWithCoords.forEach((w) => bounds.extend([w.latitude, w.longitude]));
      map.fitBounds(bounds, { padding: [35, 35], maxZoom: 13 });
    } else if (visibleWorkersWithCoords.length === 1) {
      const single = visibleWorkersWithCoords[0];
      map.setView([single.latitude, single.longitude], 12);
    }
  }, [visibleWorkersWithCoords, renderClusterMarkers, centerLat, centerLon, radiusKm]);

  // Handle selectedWorkerId panning
  useEffect(() => {
    const targetId = activeWorkerId || selectedWorkerId;
    if (!targetId || !mapInstanceRef.current) return;
    const target = visibleWorkersWithCoords.find((w) => w.id === targetId);
    if (target) {
      mapInstanceRef.current.setView([target.latitude, target.longitude], 14, { animate: true });
      const marker = markerMapRef.current.get(target.id);
      if (marker) {
        setTimeout(() => {
          marker.openPopup();
        }, 150);
      }
    }
  }, [selectedWorkerId, activeWorkerId, visibleWorkersWithCoords]);

  // Invalidate map size on expand/collapse or sidebar toggle
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (map) {
      setTimeout(() => {
        map.invalidateSize();
      }, 250);
    }
  }, [isExpanded, showSidebar]);

  const handleManualRefresh = () => {
    if (onRefreshAvailability) {
      setIsRefreshing(true);
      onRefreshAvailability();
      setTimeout(() => setIsRefreshing(false), 700);
    }
  };

  const handleRecenter = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const targetZoom = radiusKm
      ? radiusKm <= 2 ? 14 : radiusKm <= 5 ? 13 : radiusKm <= 15 ? 12 : radiusKm <= 35 ? 11 : radiusKm <= 75 ? 10 : 9
      : 11;
    map.setView([centerLat, centerLon], targetZoom, { animate: true });
  };

  const handleFitBounds = () => {
    const map = mapInstanceRef.current;
    if (!map || visibleWorkersWithCoords.length === 0) return;
    const bounds = L.latLngBounds([]);
    visibleWorkersWithCoords.forEach((w) => bounds.extend([w.latitude, w.longitude]));
    if (Number.isFinite(centerLat) && Number.isFinite(centerLon) && (centerLat !== 20.5937 || centerLon !== 78.9629)) {
      bounds.extend([centerLat, centerLon]);
    }
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  };

  const handleResetMap = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    setActiveWorkerId(null);
    map.setView([centerLat, centerLon], radiusKm ? 11 : 6, { animate: true });
  };

  const handleFocusWorkerFromSidebar = (worker: WorkerItem) => {
    setActiveWorkerId(worker.id);
    onSelectWorker?.(worker);
    const latitude = worker.latitude ?? worker.profiles?.latitude;
    const longitude = worker.longitude ?? worker.profiles?.longitude;
    if (latitude == null || longitude == null || !Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude)) || (Number(latitude) === 0 && Number(longitude) === 0)) return;
    const map = mapInstanceRef.current;
    if (!map) return;
    map.setView([Number(latitude), Number(longitude)], 14, { animate: true });
    const marker = markerMapRef.current.get(worker.id);
    if (marker) setTimeout(() => marker.openPopup(), 150);
  };

  return (
    <div
      className={`relative w-full rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-slate-50 transition-all duration-300 flex flex-col ${
        isExpanded ? 'h-[580px]' : 'h-[400px] sm:h-[440px]'
      }`}
    >
      {/* Top Map Bar */}
      <div className="z-10 flex items-center justify-between px-3 sm:px-4 py-2 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs shrink-0">
        <div className="flex items-center gap-2 overflow-hidden flex-wrap sm:flex-nowrap">
          <MapPin className="w-4 h-4 text-brand-600 shrink-0" />
          <span className="text-xs font-bold text-slate-800 truncate">
            {t('workersNearbyCount')} ({workers.length} {workers.length === 1 ? 'worker found' : 'workers found'})
          </span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
            {workersWithCoords.length} plotted on map
          </span>
          {unmappedCount > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
              +{unmappedCount} unmapped
            </span>
          )}
          {radiusKm && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200 shrink-0">
              {radiusKm} km
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Toggle Sidebar Button */}
          {workers.length > 0 && (
            <button
              type="button"
              onClick={() => setShowSidebar((prev) => !prev)}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                showSidebar
                  ? 'bg-brand-50 text-brand-700 border-brand-300'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
              title="Toggle nearby workers list sidebar"
            >
              <ListFilter className="w-3.5 h-3.5" />
              <span className="hidden md:inline">List ({workers.length})</span>
            </button>
          )}

          {/* Refresh Availability */}
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

          {/* Expand / Minimize */}
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
            title={isExpanded ? t('shrinkMap') || 'Collapse Map' : t('expandMap') || 'Expand Map'}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Close */}
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

      {/* Main Map Body with Canvas and Optional Sidebar */}
      <div className="relative flex-1 w-full min-h-0 flex">
        {/* Map Canvas */}
        <div ref={mapContainerRef} className="flex-1 h-full z-0" style={{ minHeight: '260px' }} />

        {/* Floating Quick Map Controls (Top-Right on canvas) */}
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5 bg-white/95 backdrop-blur-md rounded-xl p-1 border border-slate-200 shadow-md">
          {/* Recenter button */}
          <button
            type="button"
            onClick={handleRecenter}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
            title="Recenter to selected preferred location"
            aria-label="Recenter location"
          >
            <Crosshair className="w-4 h-4 text-brand-600" />
          </button>

          {/* Fit matching workers button */}
          <button
            type="button"
            onClick={handleFitBounds}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
            title="Fit view to all matching workers"
            aria-label="Fit view to workers"
          >
            <Users className="w-4 h-4 text-emerald-600" />
          </button>

          {/* Reset map button */}
          <button
            type="button"
            onClick={handleResetMap}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
            title="Reset map view"
            aria-label="Reset map"
          >
            <RotateCcw className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Worker discovery panel: includes mapped and unmapped directory workers. */}
        {showSidebar && sortedNearbyWorkers.length > 0 && (
          <aside
            aria-label="Nearby workers"
            className="absolute left-0 right-0 bottom-0 z-20 w-full max-h-[56%] bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-xl flex flex-col md:relative md:left-auto md:right-auto md:bottom-auto md:w-[340px] md:max-h-full md:border-t-0 md:border-l md:shadow-none"
          >
            <div className="p-3 border-b border-slate-100 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-black uppercase tracking-wider text-slate-800 block">Find a worker</span>
                  <span className="text-[11px] text-slate-500">{filteredSidebarWorkers.length} of {workers.length} workers · nearest first</span>
                </div>
                <button type="button" onClick={() => setShowSidebar(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Hide worker list" aria-label="Hide worker list">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={workerSearch}
                  onChange={(event) => setWorkerSearch(event.target.value)}
                  placeholder="Search name, skill or area"
                  aria-label="Search workers by name, skill or area"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                />
              </div>
              <div className="flex items-center gap-1.5">
                {([
                  ['all', 'All workers'],
                  ['available', 'Available'],
                  ['unavailable', 'Unavailable'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setAvailabilityFilter(value)}
                    aria-pressed={availabilityFilter === value}
                    className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${availabilityFilter === value ? 'bg-brand-50 text-brand-800 border-brand-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
              {filteredSidebarWorkers.length === 0 ? (
                <div className="py-8 px-3 text-center text-xs text-slate-500">No workers match these filters.</div>
              ) : filteredSidebarWorkers.map((worker) => {
                const isSelected = (activeWorkerId || selectedWorkerId) === worker.id;
                const latitude = worker.latitude ?? worker.profiles?.latitude;
                const longitude = worker.longitude ?? worker.profiles?.longitude;
                const hasCoordinates = latitude != null && longitude != null &&
                  Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude)) &&
                  !(Number(latitude) === 0 && Number(longitude) === 0);
                const isAvailable = worker.is_available === true;
                const locality = worker.profiles?.village || worker.profiles?.district || worker.profiles?.location || worker.preferred_work_location || 'Location not specified';
                const rating = worker.average_rating != null ? Number(worker.average_rating).toFixed(1) : 'New';
                const catColor = getCategoryColor(worker.category);

                return (
                  <div
                    key={worker.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleFocusWorkerFromSidebar(worker)}
                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handleFocusWorkerFromSidebar(worker); } }}
                    className={`rounded-xl border p-3 transition-all cursor-pointer ${isSelected ? 'border-brand-300 bg-brand-50/70 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-xs font-extrabold text-slate-900 truncate">{worker.profiles?.full_name || 'Verified Worker'}</h4>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-label="Verified profile" />
                        </div>
                        <div className="text-[10px] font-bold mt-0.5" style={{ color: catColor }}>{worker.category || 'General work'}</div>
                      </div>
                      <span className={`shrink-0 px-2 py-1 rounded-full text-[9px] font-bold border ${isAvailable ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : worker.is_available === false ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                        {isAvailable ? 'Available for work' : worker.is_available === false ? 'Unavailable' : 'Status not set'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[10px] text-slate-500">
                      <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{locality}</span>
                      {worker.distance_km != null && <span className="font-semibold text-emerald-700">{worker.distance_km} km away</span>}
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="font-bold text-slate-800">{worker.daily_wage != null ? `₹${worker.daily_wage}/day` : 'Wage on request'}</span>
                        <span className="inline-flex items-center gap-1 text-amber-600 font-bold"><Star className="w-3 h-3 fill-amber-400" />{rating}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button type="button" disabled={!hasCoordinates} onClick={(event) => { event.stopPropagation(); handleFocusWorkerFromSidebar(worker); }} className="px-2 py-1 rounded-lg border border-slate-200 text-[10px] font-bold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50">
                          <MapPin className="w-3 h-3 inline mr-1" />{hasCoordinates ? 'Show on map' : 'No pin'}
                        </button>
                        {onViewProfile && (
                          <button type="button" onClick={(event) => { event.stopPropagation(); onViewProfile(worker); }} className="px-2 py-1 rounded-lg bg-slate-100 text-[10px] font-bold text-slate-700 hover:bg-slate-200">Profile</button>
                        )}
                        {onCallWorker && (
                          <button type="button" onClick={(event) => { event.stopPropagation(); onCallWorker(worker.id); }} className="px-2 py-1 rounded-lg bg-brand-600 text-[10px] font-bold text-white hover:bg-brand-700">
                            <Phone className="w-3 h-3 inline mr-1" />Call
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        )}

        {/* Empty / Unmapped Overlay */}
        {workersWithCoords.length === 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-6 bg-slate-900/10 pointer-events-none">
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
      </div>

      {/* Interactive Bottom Bar */}
      <div className="z-10 px-3 py-1.5 bg-white/95 backdrop-blur-md border-t border-slate-200 text-[11px] text-slate-600 flex items-center justify-between gap-2 shadow-2xs shrink-0">
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
