import { useEffect, useRef, useState } from "react";
import { useCustomerStore, type MapTypeId } from "../../store/useCustomerStore";
import { loadGoogleMaps } from "../../services/maps";
import type { Segment } from "../../types/api";
import { getBooths } from "../../services/api";
import {
  buildConvexHull,
  getSegmentPoints,
  hashToColor,
  toLatLngPathsArray,
} from "../map/utils";

interface CustomerMapViewProps {
  segments: Segment[];
  selectedSegment: Segment | null;
}

/** Ensure value is a finite number for LatLng (API may return strings from DB). */
function toNum(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Valid LatLng literal for Google Maps. */
function toLatLng(
  lat: unknown,
  lng: unknown,
): { lat: number; lng: number } | null {
  const la = toNum(lat);
  const ln = toNum(lng);
  return la != null && ln != null ? { lat: la, lng: ln } : null;
}

const CustomerMapView = ({
  segments,
  selectedSegment,
}: CustomerMapViewProps) => {
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const polygonsRef = useRef<google.maps.Polygon[]>([]);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const voterOverlaysRef = useRef<google.maps.Circle[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const prevMapTypeRef = useRef<MapTypeId | null>(null);

  const MAX_VOTER_OVERLAYS = 2000;
  const initializingRef = useRef(false); // Prevent double initialization
  const {
    layers,
    setSelectedSegmentId,
    mapType,
    map3DEnabled,
    setMapType,
    setMap3DEnabled,
    electionId,
    boothId,
    scopeType,
  } = useCustomerStore();
  const [mapReady, setMapReady] = useState(false);
  const boothMarkerRef =
    useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";

  // Callback ref pattern - called when div is attached to DOM
  const mapRefCallback = (element: HTMLDivElement | null) => {
    if (!element) return;
    if (googleMapRef.current) return; // Already initialized
    if (initializingRef.current) return; // Already initializing

    initializingRef.current = true;

    if (!apiKey) {
      setError("Google Maps API key missing");
      setLoading(false);
      initializingRef.current = false;
      return;
    }

    loadGoogleMaps(apiKey)
      .then(() => {
        if (!element) {
          initializingRef.current = false;
          return;
        }

        // Default center: India center coordinates, or Delhi if segments exist
        const defaultCenter =
          segments.length > 0
            ? { lat: 28.6139, lng: 77.209 } // Delhi
            : { lat: 20.5937, lng: 78.9629 }; // India center

        const defaultZoom = segments.length > 0 ? 12 : 5; // Zoom out for India view

        const map = new google.maps.Map(element, {
          zoom: defaultZoom,
          center: defaultCenter,
          mapId: "62304de93ee45a67",
          mapTypeId: mapType,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          fullscreenControlOptions: {
            position: google.maps.ControlPosition.RIGHT_TOP,
          },
          zoomControl: true,
          zoomControlOptions: {
            position: google.maps.ControlPosition.RIGHT_CENTER,
          },
          clickableIcons: false,
          disableDefaultUI: false,
          tilt: map3DEnabled ? 45 : 0,
          heading: 0,
          gestureHandling: "greedy",
        });

        // Create info window for tooltips
        infoWindowRef.current = new google.maps.InfoWindow();

        googleMapRef.current = map;
        setMapReady(true);
        setLoading(false);
        initializingRef.current = false;
      })
      .catch((err) => {
        setError(`Map loading failed: ${err.message}`);
        setLoading(false);
        initializingRef.current = false;
      });
  };

  // Sync map type and 3D tilt when user changes them
  useEffect(() => {
    if (!googleMapRef.current || !mapReady) return;
    const map = googleMapRef.current;

    // Always apply the requested map type first.
    map.setMapTypeId(mapType);

    // Google Maps 45° tilt is most consistently available on satellite/hybrid at high zoom.
    // If user enables "3D / Realistic", switch to hybrid (keeping labels) and zoom in so the effect is visible.
    if (map3DEnabled) {
      if (mapType !== "satellite" && mapType !== "hybrid") {
        // Remember the user's preferred map type so we can restore it when 3D is turned off.
        if (!prevMapTypeRef.current) prevMapTypeRef.current = mapType;
        setMapType("hybrid");
        return; // wait for state update to re-run effect
      }

      const currentZoom = map.getZoom() ?? 0;
      if (currentZoom < 18) map.setZoom(18);
      map.setTilt(45);
      map.setHeading(45); // non-zero heading makes the 3D perspective obvious
      map.setOptions({ rotateControl: true });
    } else {
      map.setTilt(0);
      map.setHeading(0);

      // Restore original map type if we auto-switched it when enabling 3D.
      if (prevMapTypeRef.current) {
        const prev = prevMapTypeRef.current;
        prevMapTypeRef.current = null;
        // Only restore if user hasn't manually picked a different type while in 3D.
        // (If they did, prevMapTypeRef would still be set, but restoring would feel surprising.)
        if (mapType === "hybrid") setMapType(prev);
      }
    }
  }, [mapReady, mapType, map3DEnabled, setMapType]);

  // Render segments with advanced features
  useEffect(() => {
    if (!googleMapRef.current || !mapReady) return;

    // Clear existing polygons, markers, and voter overlays
    polygonsRef.current.forEach((p) => p.setMap(null));
    markersRef.current.forEach((m) => (m.map = null));
    voterOverlaysRef.current.forEach((c) => c.setMap(null));
    polygonsRef.current = [];
    markersRef.current = [];
    voterOverlaysRef.current = [];

    if (segments.length === 0) return;

    const bounds = new google.maps.LatLngBounds();

    segments.forEach((segment) => {
      if (!layers.boundaries) return;

      // Prefer geometry (contiguous union of tiles) over boundary_geojson (convex hull)
      const geom = segment.geometry ?? segment.boundary_geojson;
      // Use raw paths so each geohash cell renders with its segment's distinct color (dots per segment)
      let paths = geom ? toLatLngPathsArray(geom) : [];

      // Fallback: when backend geometry is missing/empty, build convex hull from member positions so 7 segments show as regions (not 326 dots)
      if (paths.length === 0) {
        const points = getSegmentPoints(segment);
        const hullPath = points.length >= 3 ? buildConvexHull(points) : [];
        if (hullPath.length >= 3) paths = [hullPath];
      }
      if (paths.length === 0) return;

      // Calculate segment height based on voter count (for visual depth)
      const voterCount = segment.total_voters ?? 0;
      const maxVoters = Math.max(...segments.map((s) => s.total_voters ?? 0));
      const normalizedHeight = maxVoters > 0 ? voterCount / maxVoters : 0;

      // Create polygon(s) - one per segment when using convex hull, or per path otherwise
      const isSelected = selectedSegment?.id === segment.id;
      // Use segment color from API, or hash-based color so each segment has a distinct color
      const segmentColor = segment.color ?? hashToColor(segment.id, null);
      const highlight = layers.dimMap;
      const baseFillOpacity = highlight ? 0.5 : 0.35;
      const selectedFillOpacity = highlight ? 0.7 : 0.5;
      const baseStrokeWeight = highlight ? 3 : 2.5;
      const selectedStrokeWeight = highlight ? 5 : 4;

      paths.forEach((coordinates) => {
        const polygon = new google.maps.Polygon({
          paths: coordinates,
          strokeColor: isSelected ? "#1e40af" : segmentColor,
          strokeOpacity: 1,
          strokeWeight: isSelected ? selectedStrokeWeight : baseStrokeWeight,
          fillColor: segmentColor,
          fillOpacity: isSelected ? selectedFillOpacity : baseFillOpacity,
          map: googleMapRef.current,
          clickable: true,
          zIndex: isSelected ? 1000 : 100 + Math.floor(normalizedHeight * 50),
        });

        // Click handler
        polygon.addListener("click", () => {
          setSelectedSegmentId(segment.id);
        });

        // Hover effects with info window
        polygon.addListener("mouseover", (e: google.maps.MapMouseEvent) => {
          polygon.setOptions({
            fillOpacity: highlight ? 0.7 : 0.45,
            strokeWeight: highlight ? 4.5 : 3,
            strokeColor: "#1e40af",
          });

          // Show tooltip
          if (infoWindowRef.current && e.latLng) {
            const content = `
						<div style="padding: 8px; font-family: system-ui;">
							<div style="font-weight: 600; font-size: 14px; color: #111827; margin-bottom: 6px;">
								${segment.display_name ?? segment.segment_name ?? "Segment"}
							</div>
							<div style="font-size: 12px; color: #6b7280; margin-bottom: 2px;">
								<span style="font-weight: 500;">Voters:</span> ${voterCount.toLocaleString()}
							</div>
							<div style="font-size: 12px; color: #6b7280;">
								<span style="font-weight: 500;">Families:</span> ${(segment.total_families ?? 0).toLocaleString()}
							</div>
						</div>
					`;
            infoWindowRef.current.setContent(content);
            infoWindowRef.current.setPosition(e.latLng);
            infoWindowRef.current.open(googleMapRef.current);
          }
        });

        polygon.addListener("mouseout", () => {
          polygon.setOptions({
            fillOpacity: isSelected ? selectedFillOpacity : baseFillOpacity,
            strokeWeight: isSelected ? selectedStrokeWeight : baseStrokeWeight,
            strokeColor: isSelected ? "#1e40af" : segmentColor,
          });

          // Close tooltip
          if (infoWindowRef.current) {
            infoWindowRef.current.close();
          }
        });

        polygonsRef.current.push(polygon);

        // Extend bounds
        coordinates.forEach((coord) => bounds.extend(coord));
      });

      // Add label with AdvancedMarkerElement (only with valid numeric lat/lng)
      const centroidPos = toLatLng(segment.centroid_lat, segment.centroid_lng);
      if (layers.labels && centroidPos) {
        const labelDiv = document.createElement("div");
        labelDiv.style.cssText = `
					background: white;
					padding: 6px 10px;
					border-radius: 6px;
					font-size: 12px;
					font-weight: 600;
					color: #111827;
					box-shadow: 0 2px 8px rgba(0,0,0,0.15);
					border: 1px solid rgba(0,0,0,0.1);
					white-space: nowrap;
				`;
        labelDiv.textContent =
          segment.display_name ?? segment.segment_name ?? "";

        const label = new google.maps.marker.AdvancedMarkerElement({
          position: centroidPos,
          map: googleMapRef.current,
          content: labelDiv,
        });

        markersRef.current.push(label);
      }

      // Add centroid marker (only with valid numeric lat/lng)
      if (layers.centroids && centroidPos) {
        const centroidDiv = document.createElement("div");
        centroidDiv.style.cssText = `
					width: 12px;
					height: 12px;
					background: ${segmentColor};
					border: 2px solid white;
					border-radius: 50%;
					box-shadow: 0 2px 4px rgba(0,0,0,0.2);
				`;

        const centroidMarker = new google.maps.marker.AdvancedMarkerElement({
          position: centroidPos,
          map: googleMapRef.current,
          content: centroidDiv,
        });

        markersRef.current.push(centroidMarker);
      }

      // Voter positions (lat/lng) when layer is on – use Circle overlays to avoid Advanced Markers API issues
      if (
        layers.showVoters &&
        voterOverlaysRef.current.length < MAX_VOTER_OVERLAYS &&
        (segment.members ?? segment.voters ?? []).length > 0
      ) {
        const list = segment.members ?? segment.voters ?? [];
        const segColor = segment.color ?? hashToColor(segment.id, null);
        for (const m of list) {
          if (voterOverlaysRef.current.length >= MAX_VOTER_OVERLAYS) break;
          const pos = toLatLng(m.latitude, m.longitude);
          if (!pos || !googleMapRef.current) continue;
          try {
            const boothLabel =
              m.booth_name ??
              (m.booth_number != null ? `Booth ${m.booth_number}` : "Booth");
            const isFar = Boolean(m.is_far_from_booth);
            const isBoothMissing = m.booth_location_status === "missing";
            const isMemberMissing =
              m.booth_location_status === "member_location_missing";
            const fillColor = isFar
              ? "#dc2626"
              : isBoothMissing
                ? "#d97706"
                : isMemberMissing
                  ? "#64748b"
                  : segColor;
            const radius = isFar ? 9 : isBoothMissing ? 7 : isMemberMissing ? 6 : 4;
            const circle = new google.maps.Circle({
              center: pos,
              radius,
              fillColor,
              fillOpacity: 0.85,
              strokeColor: "#fff",
              strokeWeight: isFar ? 1.5 : 1,
              map: googleMapRef.current,
              zIndex: isFar ? 80 : 50,
            });
            circle.addListener("mouseover", () => {
              if (!infoWindowRef.current) return;
              const content = `
							<div style="padding: 8px; font-family: system-ui;">
								<div style="font-weight: 600; font-size: 13px; color: #111827; margin-bottom: 6px;">
									${m.full_name ?? "Voter"}
								</div>
								<div style="font-size: 12px; color: #6b7280; margin-bottom: 2px;">
									<span style="font-weight: 500;">Booth:</span> ${boothLabel}
								</div>
								<div style="font-size: 12px; color: ${
                  isFar ? "#b91c1c" : isBoothMissing || isMemberMissing ? "#b45309" : "#166534"
                };">
									${
                    isFar
                      ? `<span style="font-weight: 600;">2 km away</span>${m.distance_from_booth_m != null ? ` · ${(m.distance_from_booth_m / 1000).toFixed(2)} km` : ""}`
                      : isBoothMissing
                        ? "Booth location not available"
                        : isMemberMissing
                          ? "Member location not available"
                          : "Within 2 km"
                  }
								</div>
							</div>
						`;
              infoWindowRef.current.setContent(content);
              infoWindowRef.current.setPosition(pos);
              infoWindowRef.current.open(googleMapRef.current);
            });
            circle.addListener("mouseout", () => {
              infoWindowRef.current?.close();
            });
            voterOverlaysRef.current.push(circle);
          } catch {
            // Skip if Maps API fails (e.g. quota, key restrictions)
          }
        }
      }
    });

    // Fit bounds with smooth animation
    if (!bounds.isEmpty()) {
      googleMapRef.current.fitBounds(bounds, {
        top: 60,
        bottom: 60,
        left: 360, // Account for left sidebar
        right: 380, // Account for right sidebar
      });

      google.maps.event.addListenerOnce(
        googleMapRef.current,
        "bounds_changed",
        () => {
          const zoom = googleMapRef.current?.getZoom();
          if (zoom && zoom > 18) {
            googleMapRef.current?.setZoom(18);
          }
        },
      );
    }
  }, [segments, layers, selectedSegment, mapReady, setSelectedSegmentId]);

  // --- Booth location marker ---
  useEffect(() => {
    // Remove previous booth marker
    if (boothMarkerRef.current) {
      boothMarkerRef.current.map = null;
      boothMarkerRef.current = null;
    }

    if (!mapReady || !googleMapRef.current) return;
    if (!layers.boothMarker) return;
    if (scopeType !== "booth" || !boothId || !electionId) return;

    // Fetch the booth's coordinates, then place a marker
    getBooths(electionId, boothId)
      .then((booths) => {
        const booth = booths.find(
          (b) => b.id === boothId || b.node_id === boothId,
        );
        if (!booth) return;
        const lat =
          typeof booth.latitude === "number"
            ? booth.latitude
            : Number(booth.latitude);
        const lng =
          typeof booth.longitude === "number"
            ? booth.longitude
            : Number(booth.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        if (!googleMapRef.current) return;

        const boothLabel =
          booth.booth_name ??
          (booth.booth_number != null
            ? `Booth ${booth.booth_number}`
            : "Booth");

        // Inject styles once
        if (!document.getElementById("booth-pin-style")) {
          const style = document.createElement("style");
          style.id = "booth-pin-style";
          style.textContent = `
						@keyframes boothPulse {
							0%   { transform: scale(1);   opacity: 0.8; }
							50%  { transform: scale(1.6); opacity: 0.3; }
							100% { transform: scale(2.2); opacity: 0;   }
						}
						.booth-pin-wrap { position: relative; cursor: default; user-select: none; }
						.booth-pin-wrap .booth-tooltip {
							position: absolute;
							bottom: calc(100% + 10px);
							left: 50%;
							transform: translateX(-50%);
							background: #1e293b;
							color: #f1f5f9;
							font-family: system-ui, sans-serif;
							font-size: 12px;
							font-weight: 600;
							white-space: nowrap;
							padding: 5px 10px;
							border-radius: 8px;
							box-shadow: 0 4px 12px rgba(0,0,0,0.35);
							pointer-events: none;
							opacity: 0;
							transition: opacity 0.18s ease, transform 0.18s ease;
							transform: translateX(-50%) translateY(4px);
						}
						.booth-pin-wrap .booth-tooltip::after {
							content: '';
							position: absolute;
							top: 100%;
							left: 50%;
							transform: translateX(-50%);
							border: 5px solid transparent;
							border-top-color: #1e293b;
						}
						.booth-pin-wrap:hover .booth-tooltip {
							opacity: 1;
							transform: translateX(-50%) translateY(0);
						}
						.booth-pulse-ring {
							position: absolute;
							inset: -10px;
							border-radius: 50%;
							// border: 3px solid rgba(234,88,12,0.55);
							animation: boothPulse 1.8s ease-out infinite;
							pointer-events: none;
						}
						.booth-icon-circle {
						display: flex;
						align-items: center;
						justify-content: center;
						filter: drop-shadow(0 3px 6px rgba(0,0,0,0.35));
					}
				`.replace(/\t/g, "");
          document.head.appendChild(style);
        }

        // Build marker DOM
        const wrap = document.createElement("div");
        wrap.className = "booth-pin-wrap";

        // Pulsing ring
        // const ring = document.createElement("div");
        // ring.className = "booth-pulse-ring";
        // wrap.appendChild(ring);

        // Red map-pin icon
        const pinEl = document.createElement("div");
        pinEl.className = "booth-icon-circle";
        pinEl.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#E53935"/>
        <circle cx="12" cy="9" r="3" fill="#f8f8f8ff"/>
    </svg>`.trim();
        wrap.appendChild(pinEl);

        // Hover tooltip with booth name
        const tooltip = document.createElement("div");
        tooltip.className = "booth-tooltip";
        tooltip.textContent = boothLabel;
        wrap.appendChild(tooltip);

        const marker = new google.maps.marker.AdvancedMarkerElement({
          position: { lat, lng },
          map: googleMapRef.current,
          content: wrap,
          title: boothLabel,
          zIndex: 9999,
        });

        boothMarkerRef.current = marker;
      })
      .catch(() => {
        // Booth coordinates unavailable – silently skip
      });

    return () => {
      if (boothMarkerRef.current) {
        boothMarkerRef.current.map = null;
        boothMarkerRef.current = null;
      }
    };
  }, [mapReady, boothId, electionId, scopeType, layers.boothMarker]);

  // Always render map container, overlay loading/error states
  return (
    <div className="w-full h-full relative">
      {/* Map container - ALWAYS rendered so callback ref is invoked */}
      <div ref={mapRefCallback} className="w-full h-full" />

      {/* Map type & 3D controls - only when map is ready */}
      {mapReady && (
        <div className="absolute bottom-4 left-4 flex flex-col gap-2 z-10">
          <div className="flex rounded-lg overflow-hidden bg-white/95 shadow-lg border border-gray-200">
            {(["roadmap", "satellite", "hybrid", "terrain"] as const).map(
              (id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMapType(id)}
                  className={`px-3 py-2 text-xs font-medium capitalize transition-colors ${
                    mapType === id
                      ? "bg-blue-600 text-white"
                      : "bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {id}
                </button>
              ),
            )}
          </div>
          <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/95 shadow-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={map3DEnabled}
              onChange={(e) => setMap3DEnabled(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            />
            <span className="text-xs font-medium text-gray-700">
              3D / Realistic view
            </span>
          </label>
        </div>
      )}

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-50">
          <div className="text-center">
            <div className="inline-block w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
            <div className="text-gray-900 font-semibold mb-1">Loading Map</div>
            <div className="text-sm text-gray-500">
              Initializing Google Maps...
            </div>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-50">
          <div className="text-center p-8 max-w-md">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <div className="text-red-600 font-semibold mb-2">
              Map Load Error
            </div>
            <div className="text-sm text-gray-600">{error}</div>
            <div className="text-xs text-gray-500 mt-4">
              Check browser console for details
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerMapView;
