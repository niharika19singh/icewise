"use client";

import { useEffect, useState } from "react";
import TopBar from "./TopBar";
import Sidebar from "./Sidebar";
import AntarcticMap from "./AntarcticMap";
import BottomBar from "./BottomBar";
import RightPanel from "./RightPanel";
import type { RouteResponse } from "./types";

const ROUTE_API_URL = "http://localhost:8000/api/route";
const RECALCULATE_API_URL = "http://localhost:8000/api/route/recalculate";

// Real vessel/route request for the first ICEWISE demo corridor — sent as-is to
// Niharika's routing/risk engine. No mock/synthetic route data.
const ROUTE_REQUEST = {
  vessel_id: "RV-POLAR-STERN-01",
  start_point: { lat: -77.0, lon: -42.0 },
  destination: { lat: -74.5, lon: -40.0 },
  cruise_speed_knots: 12.0,
  fuel_consumption_rate_tons_per_day: 15.0,
  algorithm: "A*",
  target_timestamp: "2020-01-02T00:00:00Z",
};

// Same real vessel/corridor, sent to the adaptive re-route endpoint — the
// backend loads each iceberg's latest real observation itself.
const RECALCULATE_REQUEST = {
  vessel_id: ROUTE_REQUEST.vessel_id,
  start_point: ROUTE_REQUEST.start_point,
  destination: ROUTE_REQUEST.destination,
  cruise_speed_knots: ROUTE_REQUEST.cruise_speed_knots,
  fuel_consumption_rate_tons_per_day: ROUTE_REQUEST.fuel_consumption_rate_tons_per_day,
  algorithm: ROUTE_REQUEST.algorithm,
  initial_target_timestamp: ROUTE_REQUEST.target_timestamp,
};

export default function CommandCenter() {
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeLoading, setRouteLoading] = useState(true);
  const [activeModule, setActiveModule] = useState("map");
  const [selectedIcebergId, setSelectedIcebergId] = useState<string | null>(null);
  const [recalculatedRoute, setRecalculatedRoute] = useState<RouteResponse | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [recalculateError, setRecalculateError] = useState<string | null>(null);

  // Switching modules away from Icebergs clears any selection; selecting an
  // iceberg on the map (from any mode) switches into Icebergs mode to show it.
  const handleModuleSelect = (id: string) => {
    setActiveModule(id);
    if (id !== "icebergs") setSelectedIcebergId(null);
  };
  const handleSelectIceberg = (id: string | null) => {
    setSelectedIcebergId(id);
    if (id) setActiveModule("icebergs");
  };

  // Real adaptive re-route: calls Niharika's actual routing engine via the
  // backend's /api/route/recalculate endpoint. No simulated route change.
  const handleRecalculate = () => {
    setRecalculating(true);
    setRecalculateError(null);

    fetch(RECALCULATE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(RECALCULATE_REQUEST),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.detail || `Routing API returned ${res.status}`);
        }
        return res.json();
      })
      .then((data: RouteResponse) => setRecalculatedRoute(data))
      .catch((err: Error) => setRecalculateError(err.message))
      .finally(() => setRecalculating(false));
  };

  useEffect(() => {
    let cancelled = false;

    fetch(ROUTE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ROUTE_REQUEST),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.detail || `Routing API returned ${res.status}`);
        }
        return res.json();
      })
      .then((data: RouteResponse) => {
        if (!cancelled) setRoute(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setRouteError(err.message);
      })
      .finally(() => {
        if (!cancelled) setRouteLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-abyss text-frost">
      <TopBar />

      <div className="flex flex-1 gap-4 overflow-hidden p-4 pb-2">
        <Sidebar active={activeModule} onSelect={handleModuleSelect} />

        <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden">
          <AntarcticMap
            route={route}
            recalculatedRoute={recalculatedRoute}
            activeModule={activeModule}
            selectedIcebergId={selectedIcebergId}
            onSelectIceberg={handleSelectIceberg}
          />
          <BottomBar />
        </div>

        <RightPanel
          route={route}
          routeLoading={routeLoading}
          routeError={routeError}
          activeModule={activeModule}
          selectedIcebergId={selectedIcebergId}
          onDeselectIceberg={() => setSelectedIcebergId(null)}
          recalculatedRoute={recalculatedRoute}
          recalculating={recalculating}
          recalculateError={recalculateError}
          onRecalculate={handleRecalculate}
        />
      </div>

      <footer className="shrink-0 px-4 pb-2">
        <p className="font-mono text-[9px] uppercase leading-tight tracking-mission text-mist/50">
          Antarctic Research Vessel · Support System
        </p>
      </footer>
    </div>
  );
}
