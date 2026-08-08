"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { ManagerPlanningItem } from "@/features/calendar/service";

type ManagerPlanningMapProps = {
  items: ManagerPlanningItem[];
  selectedItemId: string | null;
  onSelectItem: (itemId: string) => void;
};

type LatLngLiteral = {
  lat: number;
  lng: number;
};

type MapsApi = any;

type PlanningOverlay = any;

type MarkerEntry = {
  overlay: PlanningOverlay;
  item: ManagerPlanningItem;
  position: LatLngLiteral;
};

declare global {
  interface Window {
    google?: any;
    __rolanproGoogleMapsPromise?: Promise<MapsApi>;
    __rolanproGoogleMapsReady?: () => void;
    gm_authFailure?: () => void;
  }
}

const MAP_TONES: Record<string, { fill: string; stroke: string }> = {
  yellow: { fill: "#d29a2e", stroke: "#8c6113" },
  green: { fill: "#2b9a6b", stroke: "#155b3f" },
  blue: { fill: "#3478f6", stroke: "#1647a3" },
  red: { fill: "#cc533a", stroke: "#8a2c1a" },
  slate: { fill: "#6d7789", stroke: "#455063" },
};

function getTone(colorToken: string) {
  return MAP_TONES[colorToken] ?? MAP_TONES.blue;
}

function getApiKey() {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? "";
}

function loadGoogleMaps(): Promise<MapsApi> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps is only available in the browser."));
  }

  if (window.google?.maps?.Map) {
    return Promise.resolve(window.google.maps);
  }

  if (window.__rolanproGoogleMapsPromise) {
    return window.__rolanproGoogleMapsPromise;
  }

  const apiKey = getApiKey();

  if (!apiKey) {
    return Promise.reject(new Error("Google Maps API key is missing."));
  }

  window.__rolanproGoogleMapsPromise = new Promise<MapsApi>((resolve, reject) => {
    const existing = document.getElementById("rolanpro-google-maps");

    if (existing) {
      if (window.google?.maps?.Map) {
        resolve(window.google.maps);
        return;
      }

      existing.addEventListener("load", () => {
        if (window.google?.maps?.Map) {
          resolve(window.google.maps);
        }
      });
      existing.addEventListener("error", () => reject(new Error("Google Maps script failed to load.")));
      return;
    }

    window.__rolanproGoogleMapsReady = () => {
      if (window.google?.maps?.Map) {
        resolve(window.google.maps);
        return;
      }

      reject(new Error("Google Maps did not initialize."));
    };

    const script = document.createElement("script");
    script.id = "rolanpro-google-maps";
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async&callback=__rolanproGoogleMapsReady`;
    script.onload = () => {
      if (window.google?.maps?.Map) {
        resolve(window.google.maps);
        return;
      }
    };
    script.onerror = () => reject(new Error("Google Maps script failed to load."));
    document.head.appendChild(script);
  });

  return window.__rolanproGoogleMapsPromise;
}

function geocodeAddress(geocoder: any, address: string) {
  return new Promise<LatLngLiteral | null>((resolve) => {
    geocoder.geocode({ address }, (results: any, status: string) => {
      if (status !== "OK" || !results?.[0]?.geometry?.location) {
        resolve(null);
        return;
      }

      const location = results[0].geometry.location;
      resolve({ lat: location.lat(), lng: location.lng() });
    });
  });
}

function formatArrivalLabel(item: ManagerPlanningItem) {
  return new Date(item.starts_at).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDispatchLabel(item: ManagerPlanningItem) {
  if (item.entity_type === "consultation") {
    return item.assignee_label?.trim() || "Замерщик не назначен";
  }

  const installers = item.installer_labels.filter((label) => label.trim().length > 0);
  const installerPreview =
    installers.length > 2 ? `${installers.slice(0, 2).join(", ")} +${installers.length - 2}` : installers.join(", ");

  if (item.crew_label && installerPreview) {
    return `${item.crew_label} · ${installerPreview}`;
  }

  if (item.crew_label) {
    return item.crew_label;
  }

  if (installerPreview) {
    return installerPreview;
  }

  return "Монтажники не назначены";
}

function buildDestinationRouteHref(address: string | null) {
  if (!address?.trim()) {
    return null;
  }

  const params = new URLSearchParams({
    api: "1",
    destination: address.trim(),
    travelmode: "driving",
  });

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildInfoWindowContent(item: ManagerPlanningItem) {
  const tags = item.tags.length
    ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">${item.tags
        .map(
          (tag) =>
            `<span style="display:inline-flex;align-items:center;min-height:24px;padding:0 10px;border-radius:999px;border:1px solid rgba(24,22,19,.08);background:#fff;font-size:12px;">${tag}</span>`,
        )
        .join("")}</div>`
    : "";

  return `
    <div style="max-width:280px;padding:6px 2px 2px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#7d7365;margin-bottom:6px;">${item.kind_label}</div>
      <div style="font-size:16px;font-weight:700;color:#1b1b1d;margin-bottom:4px;">${item.title}</div>
      <div style="font-size:13px;color:#5f594f;margin-bottom:6px;">${item.subtitle}</div>
      <div style="font-size:12px;color:#5f594f;">${item.time_label}</div>
      <div style="font-size:12px;color:#1b1b1d;margin-top:4px;">${item.entity_type === "consultation" ? "Едет" : "Состав"}: ${escapeHtml(
        formatDispatchLabel(item),
      )}</div>
      <div style="font-size:12px;color:#5f594f;margin-top:4px;">${item.address ?? "Адрес не указан"}</div>
      <div style="font-size:12px;color:#1b1b1d;margin-top:8px;">Статус: ${item.status_label}</div>
      ${tags}
    </div>
  `;
}

function createPlanningOverlayClass(maps: MapsApi) {
  const OverlayView = maps.OverlayView;

  return class PlannerBadgeOverlay extends OverlayView {
    private position: LatLngLiteral;
    private item: ManagerPlanningItem;
    private onSelect: (itemId: string) => void;
    private selected: boolean;
    private root: HTMLButtonElement | null = null;

    constructor(position: LatLngLiteral, item: ManagerPlanningItem, selected: boolean, onSelect: (itemId: string) => void) {
      super();
      this.position = position;
      this.item = item;
      this.selected = selected;
      this.onSelect = onSelect;
    }

    onAdd() {
      const tone = getTone(this.item.color_token);
      const root = document.createElement("button");
      root.type = "button";
      root.className = `planning-map-marker${this.selected ? " planning-map-marker-selected" : ""}`;
      root.style.setProperty("--marker-fill", tone.fill);
      root.style.setProperty("--marker-stroke", tone.stroke);
      root.style.setProperty("--marker-dark", "#203245");
      root.innerHTML = `
        <span class="planning-map-marker-pin" aria-hidden="true"></span>
        <span class="planning-map-marker-badge">
          <span class="planning-map-marker-time">${escapeHtml(formatArrivalLabel(this.item))}</span>
          <span class="planning-map-marker-names">${escapeHtml(formatDispatchLabel(this.item))}</span>
        </span>
      `;
      root.title = `${this.item.kind_label}: ${this.item.title}. Повторный клик строит маршрут.`;
      root.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (this.selected) {
          const routeHref = buildDestinationRouteHref(this.item.address);
          if (routeHref) {
            window.open(routeHref, "_blank", "noopener,noreferrer");
            return;
          }
        }

        this.onSelect(this.item.item_id);
      });

      this.root = root;
      const panes = this.getPanes();
      panes?.overlayMouseTarget.appendChild(root);
    }

    draw() {
      if (!this.root) {
        return;
      }

      const projection = this.getProjection();
      if (!projection) {
        return;
      }

      const point = projection.fromLatLngToDivPixel(new maps.LatLng(this.position.lat, this.position.lng));
      if (!point) {
        return;
      }

      this.root.style.left = `${point.x}px`;
      this.root.style.top = `${point.y}px`;
    }

    onRemove() {
      this.root?.remove();
      this.root = null;
    }

    setSelected(selected: boolean) {
      this.selected = selected;
      if (!this.root) {
        return;
      }

      this.root.classList.toggle("planning-map-marker-selected", selected);
    }
  };
}

export function ManagerPlanningMap({ items, selectedItemId, onSelectItem }: ManagerPlanningMapProps) {
  const mapRootRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any | null>(null);
  const geocoderRef = useRef<any | null>(null);
  const infoWindowRef = useRef<any | null>(null);
  const markerEntriesRef = useRef<Map<string, MarkerEntry>>(new Map());
  const positionsCacheRef = useRef<Map<string, LatLngLiteral | null>>(new Map());
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [visualReady, setVisualReady] = useState(false);

  const itemsWithAddress = useMemo(
    () => items.filter((item) => item.address?.trim()),
    [items],
  );
  const selectedItem = useMemo(
    () => items.find((item) => item.item_id === selectedItemId) ?? items[0] ?? null,
    [items, selectedItemId],
  );
  const fallbackEmbedHref = useMemo(
    () => selectedItem?.map_embed_href ?? itemsWithAddress[0]?.map_embed_href ?? null,
    [itemsWithAddress, selectedItem],
  );

  useEffect(() => {
    let cancelled = false;
    const previousAuthFailure = (window as Window & { gm_authFailure?: () => void }).gm_authFailure;

    (window as Window & { gm_authFailure?: () => void }).gm_authFailure = () => {
      if (cancelled) {
        return;
      }

      setMapError(
        "Google Maps key is blocked or required APIs are not enabled. Turn on Maps JavaScript API, Geocoding API, billing, and localhost referrers.",
      );
      setIsLoading(false);
      setVisualReady(false);
    };

    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !mapRootRef.current) {
          return;
        }

        if (!mapRef.current) {
          mapRef.current = new maps.Map(mapRootRef.current, {
            center: { lat: 34.0522, lng: -118.2437 },
            zoom: 10,
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: true,
          });

          const ensureResize = () => {
            if (!mapRef.current) {
              return;
            }

            maps.event.trigger(mapRef.current, "resize");
            mapRef.current.setCenter({ lat: 34.0522, lng: -118.2437 });
          };

          window.requestAnimationFrame(ensureResize);
          window.setTimeout(ensureResize, 180);
          maps.event.addListenerOnce(mapRef.current, "idle", () => {
            setVisualReady(true);
          });
        }

        if (!geocoderRef.current) {
          geocoderRef.current = new maps.Geocoder();
        }

        if (!infoWindowRef.current) {
          infoWindowRef.current = new maps.InfoWindow();
        }

        setMapReady(true);
        setMapError(null);
        setIsLoading(false);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setMapError(error instanceof Error ? error.message : "Google Maps failed to load.");
        setIsLoading(false);
        setVisualReady(false);
      });

    return () => {
      cancelled = true;
      (window as Window & { gm_authFailure?: () => void }).gm_authFailure = previousAuthFailure;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !geocoderRef.current) {
      return;
    }

    let active = true;

    async function syncMarkers() {
      const map = mapRef.current;
      const geocoder = geocoderRef.current;

      if (!map || !geocoder) {
        return;
      }

      const nextPositions = new Map<string, LatLngLiteral>();
      const addresses = Array.from(
        new Set(itemsWithAddress.map((item) => item.address!.trim())),
      );

      await Promise.all(
        addresses.map(async (address) => {
          if (positionsCacheRef.current.has(address)) {
            const cached = positionsCacheRef.current.get(address);
            if (cached) {
              nextPositions.set(address, cached);
            }
            return;
          }

          const result = await geocodeAddress(geocoder, address);
          positionsCacheRef.current.set(address, result);
          if (result) {
            nextPositions.set(address, result);
          }
        }),
      );

      positionsCacheRef.current.forEach((value, key) => {
        if (value) {
          nextPositions.set(key, value);
        }
      });

      if (!active) {
        return;
      }

      markerEntriesRef.current.forEach(({ overlay }) => overlay.setMap(null));
      markerEntriesRef.current.clear();
      const PlannerBadgeOverlay = createPlanningOverlayClass(window.google.maps);

      const bounds = new window.google.maps.LatLngBounds();

      itemsWithAddress.forEach((item) => {
        const address = item.address?.trim();
        if (!address) {
          return;
        }

        const position = nextPositions.get(address);
        if (!position) {
          return;
        }

        const overlay = new PlannerBadgeOverlay(position, item, item.item_id === selectedItemId, onSelectItem);
        overlay.setMap(map);

        markerEntriesRef.current.set(item.item_id, { overlay, item, position });
        bounds.extend(position);
      });

      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, 64);
      }
    }

    void syncMarkers();

    return () => {
      active = false;
    };
  }, [itemsWithAddress, mapReady, onSelectItem, selectedItemId]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !infoWindowRef.current) {
      return;
    }

    const infoWindow = infoWindowRef.current;
    const selectedEntry = selectedItemId ? markerEntriesRef.current.get(selectedItemId) ?? null : null;

    markerEntriesRef.current.forEach(({ overlay, item }) => {
      overlay.setSelected(item.item_id === selectedItemId);
    });

    if (selectedEntry) {
      infoWindow.setContent(buildInfoWindowContent(selectedEntry.item));
      infoWindow.open({
        map: mapRef.current,
        position: selectedEntry.position,
        shouldFocus: false,
      });
      mapRef.current.panTo(selectedEntry.position);
      return;
    }

    infoWindow.close();
  }, [mapReady, selectedItemId]);

  const overlayMessage = !getApiKey()
    ? "Google Maps key не задан. Добавь NEXT_PUBLIC_GOOGLE_MAPS_API_KEY в env."
    : !itemsWithAddress.length
      ? "У событий выбранного дня пока нет адресов, поэтому точки на карте не отображаются."
      : isLoading
        ? "Загружаю Google Map и точки выбранного дня…"
        : mapError
          ? `Google Map не загрузилась: ${mapError}`
          : null;

  return (
    <div className="planning-map-shell">
      <div className="planning-map-stage">
        {!visualReady && fallbackEmbedHref ? (
          <div className="planning-map-frame planning-map-frame-large planning-map-frame-inline">
            <iframe title="Planning map preview" src={fallbackEmbedHref} loading="lazy" />
          </div>
        ) : null}
        <div
          ref={mapRootRef}
          className={`planning-map-canvas${visualReady ? " planning-map-canvas-visible" : " planning-map-canvas-hidden"}`}
        />
        {overlayMessage ? (
          <div className="planning-map-overlay-message">
            <div className="empty-state">{overlayMessage}</div>
          </div>
        ) : null}
      </div>
      <div className="planning-map-legend">
        <span className="planning-map-legend-item">
          <span className="planning-map-dot planning-map-dot-yellow" />
          Консультации
        </span>
        <span className="planning-map-legend-item">
          <span className="planning-map-dot planning-map-dot-blue" />
          Монтажи
        </span>
        <span className="planning-map-legend-item">
          <span className="planning-map-dot planning-map-dot-red" />
          Attention
        </span>
      </div>
    </div>
  );
}
