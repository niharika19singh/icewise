"use client";

import { useEffect, useState } from "react";
import AnalyticsHeader from "./AnalyticsHeader";
import KpiSection from "./KpiSection";
import AdaptiveRoutePerformance from "./AdaptiveRoutePerformance";
import PredictionIntelligence from "./PredictionIntelligence";
import RiskIntelligence from "./RiskIntelligence";
import MissionOutcome from "./MissionOutcome";
import AnalyticsFooter from "./AnalyticsFooter";
import type { RouteResponse, C18BValidation } from "@/components/command-center/types";

const BASE_API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const ROUTE_API_URL = `${BASE_API_URL}/api/route`;
const RECALCULATE_API_URL = `${BASE_API_URL}/api/route/recalculate`;
const VALIDATION_API_URL = `${BASE_API_URL}/api/analytics/c18b-validation`;

// Same real vessel/corridor request used by the Command Center — reused
// verbatim, not a second invented scenario.
const ROUTE_REQUEST = {
  vessel_id: "RV-POLAR-STERN-01",
  start_point: { lat: -77.0, lon: -42.0 },
  destination: { lat: -74.5, lon: -40.0 },
  cruise_speed_knots: 12.0,
  fuel_consumption_rate_tons_per_day: 15.0,
  algorithm: "A*",
  target_timestamp: "2020-01-02T00:00:00Z",
};

const RECALCULATE_REQUEST = {
  ...ROUTE_REQUEST,
  initial_target_timestamp: ROUTE_REQUEST.target_timestamp,
};

export default function AnalyticsDashboard() {
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);

  const [recalculatedRoute, setRecalculatedRoute] = useState<RouteResponse | null>(null);
  const [recalculating, setRecalculating] = useState(true);
  const [recalculateError, setRecalculateError] = useState<string | null>(null);

  const [validation, setValidation] = useState<C18BValidation | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

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
      });

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
      .then((data: RouteResponse) => {
        if (!cancelled) setRecalculatedRoute(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setRecalculateError(err.message);
      })
      .finally(() => {
        if (!cancelled) setRecalculating(false);
      });

    fetch(VALIDATION_API_URL)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.detail || `Validation API returned ${res.status}`);
        }
        return res.json();
      })
      .then((data: C18BValidation) => {
        if (!cancelled) setValidation(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setValidationError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-abyss text-frost">
      <AnalyticsHeader algorithmUsed={route?.algorithm_used ?? null} />

      {route ? (
        <>
          <KpiSection route={route} />
          <AdaptiveRoutePerformance
            route={route}
            recalculatedRoute={recalculatedRoute}
            recalculating={recalculating}
            recalculateError={recalculateError}
          />
          <PredictionIntelligence route={route} validation={validation} validationError={validationError} />
          <RiskIntelligence route={route} />
          <MissionOutcome route={route} recalculatedRoute={recalculatedRoute} />
        </>
      ) : (
        <div className="px-6 py-24 text-center lg:px-10">
          <p className="font-mono text-sm text-mist">
            {routeError ? `Route data unavailable: ${routeError}` : "Loading real mission data…"}
          </p>
        </div>
      )}

      <AnalyticsFooter />
    </main>
  );
}
