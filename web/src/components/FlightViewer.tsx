import {
  ArrowLeft,
  BarChart3,
  Bird,
  Building2,
  Eye,
  HelpCircle,
  Info,
  Maximize2,
  MousePointer2,
  Pause,
  Plane,
  Play,
  RotateCcw,
  Route,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDuration, formatLocalDate, formatMetric } from "@/domain/format";
import { createTimeline, pointAtTime } from "@/domain/interpolate";
import type {
  AircraftModelId,
  DepartureAlignmentDecision,
  FlightRecord,
  FlightSettingsPatch,
} from "@/domain/types";
import { aircraftModelOptions } from "./aircraftModels";
import { FlightCharts } from "./FlightCharts";
import {
  type BuildingAnchor,
  type BuildingsStatus,
  type CameraMode,
  GlobeView,
  type MapStatus,
  type TrackMetric,
} from "./GlobeView";

type FlightViewerProps = {
  record: FlightRecord;
  onBack: () => void;
  onSettingsChange: (patch: FlightSettingsPatch) => void;
};

const rates = [0.25, 0.5, 1, 2, 4, 10, 20];
const MAX_ALTITUDE_OFFSET = 5_000;
const cameraModes: Array<{ id: CameraMode; label: string; icon: typeof Bird }> = [
  { id: "overview", label: "Trace", icon: Maximize2 },
  { id: "bird", label: "Oiseau", icon: Bird },
  { id: "chase", label: "Poursuite", icon: Eye },
  { id: "pilot", label: "Pilote", icon: Plane },
  { id: "free", label: "Libre", icon: MousePointer2 },
];

function MetricReadout({
  label,
  value,
  unit,
  accent = false,
}: {
  label: string;
  value: number | null;
  unit: string;
  accent?: boolean;
}) {
  return (
    <div className={`metric-readout ${accent ? "is-accent" : ""}`}>
      <span>{label}</span>
      <strong>{value === null ? "—" : Math.round(value).toLocaleString("fr-FR")}</strong>
      <small>{unit}</small>
    </div>
  );
}

export function FlightViewer({ record, onBack, onSettingsChange }: FlightViewerProps) {
  const { data: flight } = record;
  const altitudeOffset = record.altitudeOffset ?? 0;
  const aircraftModelId = record.aircraftModelId ?? "cessna";
  const start = flight.summary.startTime ?? 0;
  const end = flight.summary.endTime ?? start;
  const [currentTime, setCurrentTime] = useState(start);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [cameraMode, setCameraMode] = useState<CameraMode>("overview");
  const [trackMetric, setTrackMetric] = useState<TrackMetric>("altitude");
  const [showCharts, setShowCharts] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [mapStatus, setMapStatus] = useState<MapStatus>("loading");
  const [groundElevation, setGroundElevation] = useState<number | null>(null);
  const [departureGroundElevation, setDepartureGroundElevation] = useState<number | null>(null);
  const [pilotLookResetKey, setPilotLookResetKey] = useState(0);
  const [buildingsEnabled, setBuildingsEnabled] = useState(false);
  const [buildingsAnchor, setBuildingsAnchor] = useState<BuildingAnchor>({
    latitude: flight.points[0].latitude,
    longitude: flight.points[0].longitude,
  });
  const [buildingsInfo, setBuildingsInfo] = useState<{
    status: BuildingsStatus;
    count: number;
  }>({ status: "idle", count: 0 });
  const previousFrame = useRef<number | null>(null);
  const timeline = useMemo(() => createTimeline(flight.points), [flight.points]);
  const currentPoint = useMemo(
    () => pointAtTime(flight.points, currentTime, timeline),
    [currentTime, flight.points, timeline],
  );
  const handleBuildingsStatus = useCallback((status: BuildingsStatus, count: number) => {
    setBuildingsInfo({ status, count });
  }, []);

  const seek = useCallback(
    (time: number) => {
      setCurrentTime(Math.max(start, Math.min(end, time)));
    },
    [end, start],
  );

  useEffect(() => {
    if (!playing || end <= start) return;
    let frame = 0;
    const tick = (time: number) => {
      const previous = previousFrame.current ?? time;
      previousFrame.current = time;
      setCurrentTime((value) => {
        const next = value + (time - previous) * rate;
        if (next >= end) {
          setPlaying(false);
          return end;
        }
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      previousFrame.current = null;
    };
  }, [end, playing, rate, start]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable=true]")) return;
      if (event.code === "Space") {
        event.preventDefault();
        setPlaying((value) => !value);
      } else if (event.key === "ArrowLeft") {
        seek(currentTime - (event.shiftKey ? 30_000 : 5_000));
      } else if (event.key === "ArrowRight") {
        seek(currentTime + (event.shiftKey ? 30_000 : 5_000));
      } else if (event.key === "Home") seek(start);
      else if (event.key === "End") seek(end);
      else if (event.key.toLowerCase() === "g") setCameraMode("overview");
      else if (event.key.toLowerCase() === "f") {
        setCameraMode((mode) => (mode === "chase" ? "free" : "chase"));
      } else if (event.key.toLowerCase() === "c") setShowCharts((value) => !value);
      else if (event.key.toLowerCase() === "i") setShowAdvanced((value) => !value);
      else if (event.key === "?") setShowHelp(true);
      else if (event.key === "Escape") {
        setShowHelp(false);
        setShowAdvanced(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [currentTime, end, seek, start]);

  const sourceSpeed = currentPoint?.sourceSpeed ?? null;
  const calculatedSpeed = currentPoint?.calculatedSpeed ?? null;
  const displaySpeed = sourceSpeed ?? calculatedSpeed;
  const course = currentPoint?.sourceCourse ?? currentPoint?.calculatedCourse ?? null;
  const elapsed = end > start ? (currentTime - start) / 1_000 : null;
  const renderedElevation = currentPoint?.ellipsoidElevation ?? currentPoint?.elevation ?? null;
  const agl =
    renderedElevation !== null && groundElevation !== null
      ? renderedElevation + altitudeOffset - groundElevation
      : null;
  const setAltitudeOffset = (value: number, decision?: DepartureAlignmentDecision) => {
    if (!Number.isFinite(value)) return;
    const normalized = Math.max(
      -MAX_ALTITUDE_OFFSET,
      Math.min(MAX_ALTITUDE_OFFSET, Math.round(value * 10) / 10),
    );
    onSettingsChange({
      altitudeOffset: normalized,
      ...(decision ? { departureAlignmentDecision: decision } : {}),
    });
  };
  const snapOffset =
    renderedElevation === null || groundElevation === null
      ? null
      : groundElevation - renderedElevation;
  const departurePoint = flight.points[0];
  const departureRenderedElevation =
    departurePoint.ellipsoidElevation ?? departurePoint.elevation ?? null;
  const departureSnapOffset =
    departureRenderedElevation === null || departureGroundElevation === null
      ? null
      : departureGroundElevation - departureRenderedElevation;
  const departureAgl =
    departureRenderedElevation === null || departureGroundElevation === null
      ? null
      : departureRenderedElevation + altitudeOffset - departureGroundElevation;
  const showDepartureAlignment =
    record.departureAlignmentDecision === undefined &&
    Math.abs(altitudeOffset) < 0.05 &&
    departureSnapOffset !== null &&
    Math.abs(departureSnapOffset) <= MAX_ALTITUDE_OFFSET &&
    Math.abs(departureSnapOffset) >= 1;
  const signedOffset = `${altitudeOffset >= 0 ? "+" : ""}${altitudeOffset.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} m`;
  const refreshBuildings = () => {
    const anchor = currentPoint ?? flight.points[0];
    setBuildingsAnchor({ latitude: anchor.latitude, longitude: anchor.longitude });
  };
  const buildingsStatus =
    buildingsInfo.status === "loading"
      ? "Chargement autour de l’appareil…"
      : buildingsInfo.status === "ready"
        ? `${buildingsInfo.count.toLocaleString("fr-FR")} bâtiments affichés`
        : buildingsInfo.status === "empty"
          ? "Aucun bâtiment OSM trouvé dans cette zone."
          : buildingsInfo.status === "error"
            ? "Le service OpenStreetMap est temporairement indisponible."
            : "Affichage désactivé";

  return (
    <main className={`flight-viewer charts-${showCharts ? "open" : "closed"}`}>
      <GlobeView
        flight={flight}
        currentPoint={currentPoint}
        cameraMode={cameraMode}
        trackMetric={trackMetric}
        altitudeOffset={altitudeOffset}
        aircraftModelId={aircraftModelId}
        pilotLookResetKey={pilotLookResetKey}
        buildingsEnabled={buildingsEnabled}
        buildingsAnchor={buildingsAnchor}
        onMapStatus={setMapStatus}
        onGroundElevation={setGroundElevation}
        onDepartureGroundElevation={setDepartureGroundElevation}
        onBuildingsStatus={handleBuildingsStatus}
      />
      <div className="map-vignette" aria-hidden="true" />

      <header className="viewer-header">
        <button
          className="icon-action back-action"
          type="button"
          onClick={onBack}
          aria-label="Retour à la bibliothèque"
        >
          <ArrowLeft size={19} />
        </button>
        <a
          className="viewer-brand"
          href={import.meta.env.BASE_URL}
          onClick={(event) => {
            event.preventDefault();
            onBack();
          }}
        >
          GPX<sup>3D</sup>
        </a>
        <div className="flight-ident">
          <span>Vol actif</span>
          <strong>{record.displayName}</strong>
          <em>{formatLocalDate(flight.summary.startTime)}</em>
        </div>
        <div className={`map-status status-${mapStatus}`}>
          <span />
          {mapStatus === "loading"
            ? "Terrain en cours"
            : mapStatus === "online"
              ? "Relief en ligne"
              : "Mode de secours"}
        </div>
        <button
          className="icon-action"
          type="button"
          onClick={() => setShowHelp(true)}
          aria-label="Afficher les raccourcis"
        >
          <HelpCircle size={18} />
        </button>
      </header>

      {showDepartureAlignment && departureSnapOffset !== null && (
        <aside
          className="departure-alignment-prompt"
          role="dialog"
          aria-modal="false"
          aria-live="polite"
          aria-labelledby="departure-alignment-title"
          aria-describedby="departure-alignment-description"
        >
          <div>
            <span>Calage du départ</span>
            <strong id="departure-alignment-title">
              Le point de départ est à {formatMetric(departureAgl, "m", 1)} du relief
            </strong>
            <p id="departure-alignment-description">
              Appliquer un décalage de {formatMetric(departureSnapOffset, "m", 1)} au rendu 3D ?
            </p>
          </div>
          <div className="departure-alignment-actions">
            <button type="button" onClick={() => setAltitudeOffset(departureSnapOffset, "aligned")}>
              Aligner le départ
            </button>
            <button
              type="button"
              onClick={() => onSettingsChange({ departureAlignmentDecision: "kept" })}
            >
              Conserver tel quel
            </button>
          </div>
        </aside>
      )}

      <div
        className="compass-ribbon"
        role="img"
        aria-label={`Cap ${course === null ? "indisponible" : `${Math.round(course)} degrés`}`}
      >
        <div
          className="compass-ticks"
          style={{ transform: `translateX(${course === null ? 0 : (180 - course) * 1.5}px)` }}
        >
          <span>N</span>
          <i>030</i>
          <i>060</i>
          <span>E</span>
          <i>120</i>
          <i>150</i>
          <span>S</span>
          <i>210</i>
          <i>240</i>
          <span>O</span>
          <i>300</i>
          <i>330</i>
          <span>N</span>
        </div>
        <strong>{course === null ? "—" : Math.round(course).toString().padStart(3, "0")}°</strong>
      </div>

      <aside className="instrument-tape altitude-tape" aria-label="Altitudes">
        <span className="tape-label">ALT GPS</span>
        <MetricReadout label="Altitude" value={currentPoint?.elevation ?? null} unit="m" accent />
        <div className="tape-secondary">
          <span>Sol indicatif</span>
          <strong>{formatMetric(agl, "m", 0)}</strong>
        </div>
        <div className="tape-scale" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
      </aside>

      <aside className="instrument-tape speed-tape" aria-label="Vitesse et vario">
        <span className="tape-label">V SOL</span>
        <MetricReadout
          label="Vitesse"
          value={displaySpeed === null ? null : displaySpeed * 3.6}
          unit="km/h"
          accent
        />
        <div className="dual-source">
          <span>SRC {formatMetric(sourceSpeed === null ? null : sourceSpeed * 3.6, "", 0)}</span>
          <span>
            CALC {formatMetric(calculatedSpeed === null ? null : calculatedSpeed * 3.6, "", 0)}
          </span>
        </div>
        <MetricReadout label="Vario 5 s" value={currentPoint?.verticalSpeed ?? null} unit="m/s" />
      </aside>

      <fieldset className="camera-dock" aria-label="Modes de caméra">
        {cameraModes.map(({ id, label, icon: Icon }) => (
          <button
            className={cameraMode === id ? "is-active" : ""}
            type="button"
            key={id}
            onClick={() => setCameraMode(id)}
            title={label}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </fieldset>

      {cameraMode === "pilot" && (
        <div className="pilot-look-control">
          <span>Glisser ou utiliser les flèches</span>
          <button
            type="button"
            onClick={() => setPilotLookResetKey((value) => value + 1)}
            aria-label="Recentrer la vue pilote vers l’avant"
          >
            <RotateCcw size={14} />
            Droit devant
          </button>
        </div>
      )}

      <div className="track-style-control">
        <Route size={14} />
        <label htmlFor="track-metric">Couleur</label>
        <select
          id="track-metric"
          aria-label="Coloration de la trajectoire"
          value={trackMetric}
          onChange={(event) => setTrackMetric(event.target.value as TrackMetric)}
        >
          <option value="altitude">Altitude</option>
          <option value="speed">Vitesse</option>
          <option value="time">Temps</option>
          <option value="heading">Cap</option>
        </select>
        <button
          className="offset-summary"
          type="button"
          onClick={() => setShowAdvanced(true)}
          aria-label={`Régler l’offset d’altitude, valeur actuelle ${signedOffset}`}
        >
          ALT {signedOffset}
        </button>
      </div>

      <div className="mobile-hud">
        <div>
          <span>ALT</span>
          <strong>
            {currentPoint?.elevation === null ? "—" : Math.round(currentPoint?.elevation ?? 0)}
          </strong>
          <small>m</small>
        </div>
        <div>
          <span>V SOL</span>
          <strong>{displaySpeed === null ? "—" : Math.round(displaySpeed * 3.6)}</strong>
          <small>km/h</small>
        </div>
        <div>
          <span>VARIO</span>
          <strong>
            {currentPoint?.verticalSpeed === null
              ? "—"
              : (currentPoint?.verticalSpeed ?? 0).toFixed(1)}
          </strong>
          <small>m/s</small>
        </div>
      </div>

      {showAdvanced && (
        <aside className="advanced-rail">
          <div className="rail-heading">
            <span>Instruments avancés</span>
            <button type="button" onClick={() => setShowAdvanced(false)} aria-label="Fermer">
              <X size={17} />
            </button>
          </div>
          <section className="scene-settings" aria-labelledby="scene-settings-title">
            <div className="scene-settings-heading">
              <Building2 size={16} />
              <span id="scene-settings-title">Appareil et décor 3D</span>
            </div>
            <label className="aircraft-model-control">
              <span>Modèle d’appareil</span>
              <select
                aria-label="Modèle d’appareil"
                value={aircraftModelId}
                onChange={(event) =>
                  onSettingsChange({ aircraftModelId: event.target.value as AircraftModelId })
                }
              >
                {aircraftModelOptions.map(({ id, label }) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="buildings-settings">
              <label>
                <input
                  type="checkbox"
                  checked={buildingsEnabled}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    if (enabled) refreshBuildings();
                    setBuildingsEnabled(enabled);
                  }}
                />
                <span>Bâtiments OpenStreetMap en 3D</span>
              </label>
              <button
                type="button"
                onClick={refreshBuildings}
                disabled={!buildingsEnabled || buildingsInfo.status === "loading"}
              >
                Actualiser ici
              </button>
              <small role="status" aria-live="polite">
                {buildingsStatus}
              </small>
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                © contributeurs OpenStreetMap
              </a>
            </div>
          </section>
          <section className="altitude-adjustment" aria-labelledby="altitude-adjustment-title">
            <div className="altitude-adjustment-heading">
              <div>
                <span id="altitude-adjustment-title">Calage vertical</span>
                <strong>{signedOffset}</strong>
              </div>
              <small>Rendu 3D uniquement</small>
            </div>
            <label className="offset-input">
              <span>Offset d’altitude</span>
              <input
                type="number"
                min={-MAX_ALTITUDE_OFFSET}
                max={MAX_ALTITUDE_OFFSET}
                step="0.5"
                value={altitudeOffset}
                onChange={(event) => setAltitudeOffset(Number(event.target.value), "kept")}
              />
              <em>m</em>
            </label>
            <div className="altitude-adjustment-actions">
              <button
                type="button"
                onClick={() => setAltitudeOffset(0)}
                disabled={altitudeOffset === 0}
              >
                Réinitialiser
              </button>
              <button
                className="snap-ground-action"
                type="button"
                onClick={() => snapOffset !== null && setAltitudeOffset(snapOffset, "aligned")}
                disabled={snapOffset === null}
              >
                Coller ce point au sol
              </button>
            </div>
            <p>
              {snapOffset === null
                ? "Le relief sous le point courant est encore indisponible."
                : `Le point courant est à ${formatMetric(agl, "m", 1)} du relief. Le calage conserve tous les écarts du vol.`}
            </p>
          </section>
          <div className="advanced-grid">
            <MetricReadout
              label="Distance"
              value={currentPoint?.distance === undefined ? null : currentPoint.distance / 1_000}
              unit="km"
            />
            <MetricReadout label="Taux virage" value={currentPoint?.turnRate ?? null} unit="°/s" />
            <MetricReadout label="Gain cumulé" value={flight.summary.elevationGain} unit="m" />
            <MetricReadout label="Perte cumulée" value={flight.summary.elevationLoss} unit="m" />
            <MetricReadout
              label="Vitesse max SRC"
              value={
                flight.summary.maximumSourceSpeed === null
                  ? null
                  : flight.summary.maximumSourceSpeed * 3.6
              }
              unit="km/h"
            />
            <MetricReadout
              label="Vitesse max CALC"
              value={
                flight.summary.maximumCalculatedSpeed === null
                  ? null
                  : flight.summary.maximumCalculatedSpeed * 3.6
              }
              unit="km/h"
            />
          </div>
          <dl className="flight-details">
            <div>
              <dt>Points</dt>
              <dd>{flight.summary.pointCount.toLocaleString("fr-FR")}</dd>
            </div>
            <div>
              <dt>Segments</dt>
              <dd>{flight.summary.segmentCount}</dd>
            </div>
            <div>
              <dt>Satellites</dt>
              <dd>{currentPoint?.satellites ?? "—"}</dd>
            </div>
            <div>
              <dt>Référence verticale</dt>
              <dd>
                {flight.verticalReference.basis === "orthometric"
                  ? (flight.verticalReference.geoidModel ?? "Orthométrique")
                  : flight.verticalReference.basis === "ellipsoidal"
                    ? "Ellipsoïdale"
                    : "Inconnue"}
              </dd>
            </div>
            <div>
              <dt>Enregistreur</dt>
              <dd>{flight.creator ?? "Non indiqué"}</dd>
            </div>
          </dl>
          {flight.warnings.length > 0 && (
            <div className="data-warning">
              <Info size={15} />
              {flight.warnings.join(" ")}
            </div>
          )}
        </aside>
      )}

      <section className="playback-console" aria-label="Lecture du vol">
        {showCharts && <FlightCharts flight={flight} currentTime={currentTime} onSeek={seek} />}
        <div className="timeline-row">
          <div className="transport-controls">
            <button type="button" onClick={() => seek(start)} aria-label="Revenir au début">
              <SkipBack size={17} />
            </button>
            <button
              className="play-action"
              type="button"
              onClick={() => setPlaying((value) => !value)}
              aria-label={playing ? "Pause" : "Lecture"}
              disabled={end <= start}
            >
              {playing ? (
                <Pause size={20} fill="currentColor" />
              ) : (
                <Play size={20} fill="currentColor" />
              )}
            </button>
            <button type="button" onClick={() => seek(end)} aria-label="Aller à la fin">
              <SkipForward size={17} />
            </button>
          </div>
          <time className="elapsed-time">{formatDuration(elapsed)}</time>
          <div className="timeline-input">
            <input
              type="range"
              min={start}
              max={Math.max(start + 1, end)}
              step="100"
              value={currentTime}
              onChange={(event) => seek(Number(event.target.value))}
              aria-label="Position dans le vol"
            />
            <div
              className="timeline-progress"
              style={{
                width: `${end > start ? ((currentTime - start) / (end - start)) * 100 : 0}%`,
              }}
            />
          </div>
          <time className="total-time">{formatDuration(flight.summary.duration)}</time>
          <label className="rate-control">
            <span>Vitesse</span>
            <select
              aria-label="Vitesse de lecture"
              value={rate}
              onChange={(event) => setRate(Number(event.target.value))}
            >
              {rates.map((value) => (
                <option key={value} value={value}>
                  {String(value).replace(".", ",")}×
                </option>
              ))}
            </select>
          </label>
          <div className="console-actions">
            <button
              className={showCharts ? "is-active" : ""}
              type="button"
              onClick={() => setShowCharts((value) => !value)}
              aria-label="Afficher ou masquer les courbes"
            >
              <BarChart3 size={17} />
            </button>
            <button
              className={showAdvanced ? "is-active" : ""}
              type="button"
              onClick={() => setShowAdvanced((value) => !value)}
              aria-label="Instruments avancés"
            >
              <SlidersHorizontal size={17} />
            </button>
          </div>
        </div>
      </section>

      {showHelp && (
        <div className="modal-backdrop">
          <section
            className="shortcut-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcut-title"
          >
            <div className="rail-heading">
              <span id="shortcut-title">Raccourcis de vol</span>
              <button type="button" onClick={() => setShowHelp(false)} aria-label="Fermer">
                <X size={17} />
              </button>
            </div>
            <div className="shortcut-list">
              <span>
                <kbd>Espace</kbd> Lecture / pause
              </span>
              <span>
                <kbd>← →</kbd> Reculer / avancer de 5 s
              </span>
              <span>
                <kbd>Maj + ← →</kbd> Reculer / avancer de 30 s
              </span>
              <span>
                <kbd>G</kbd> Vue de la trace
              </span>
              <span>
                <kbd>F</kbd> Mode poursuite / libre
              </span>
              <span>
                <kbd>C</kbd> Afficher les courbes
              </span>
              <span>
                <kbd>I</kbd> Instruments avancés
              </span>
              <span>
                <kbd>?</kbd> Cette aide
              </span>
            </div>
            <p>
              Les altitudes GPX et le relief sont indicatifs. Ne pas utiliser pour la navigation ou
              la sécurité du vol.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}
