import {
  ArrowUpRight,
  ChevronRight,
  Clock3,
  FileUp,
  Gauge,
  MapPinned,
  Pencil,
  Plane,
  Play,
  Route,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatDistance, formatDuration, formatLocalDate } from "@/domain/format";
import type { FlightRecord } from "@/domain/types";

type LandingProps = {
  flights: FlightRecord[];
  importing: boolean;
  error: string | null;
  onImport: (files: FileList | File[]) => void;
  onDemo: () => void;
  onOpen: (record: FlightRecord) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onClearError: () => void;
};

export function Landing({
  flights,
  importing,
  error,
  onImport,
  onDemo,
  onOpen,
  onRename,
  onDelete,
  onClearError,
}: LandingProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (editingId) renameInputRef.current?.focus();
  }, [editingId]);

  const acceptDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length) onImport(event.dataTransfer.files);
  };

  return (
    <main className="landing-shell">
      <div className="landing-atmosphere" aria-hidden="true">
        <div className="horizon-glow" />
        <div className="terrain-grid terrain-grid-left" />
        <div className="terrain-grid terrain-grid-right" />
        <div className="radar-sweep" />
      </div>

      <header className="landing-header">
        <a className="brand" href={import.meta.env.BASE_URL} aria-label="GPX3D, accueil">
          <span className="brand-mark">
            <Plane size={18} strokeWidth={1.7} />
          </span>
          <span>
            GPX<sup>3D</sup>
          </span>
        </a>
        <div className="header-status">
          <span className="status-dot" />
          Traitement local
        </div>
      </header>

      <section className="landing-hero">
        <div className="eyebrow">
          <span>01</span> Carnet de vol tridimensionnel
        </div>
        <h1>
          Reprenez
          <br />
          de l’altitude.
        </h1>
        <p className="hero-copy">
          Rejouez vos vols depuis le cockpit ou prenez de la hauteur pour lire chaque trajectoire
          dans son relief.
        </p>

        <fieldset
          className={`drop-runway ${dragging ? "is-dragging" : ""}`}
          aria-label="Import d’une trace GPX"
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (event.currentTarget === event.target) setDragging(false);
          }}
          onDrop={acceptDrop}
        >
          <div className="runway-lights" aria-hidden="true" />
          <div className="drop-icon">
            <FileUp size={24} strokeWidth={1.5} />
          </div>
          <div>
            <strong>{importing ? "Analyse du vol…" : "Déposez votre trace GPX"}</strong>
            <span>Le fichier reste dans ce navigateur</span>
          </div>
          <button
            className="primary-action"
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={importing}
          >
            <Upload size={17} /> Parcourir
          </button>
          <input
            ref={inputRef}
            className="visually-hidden"
            type="file"
            aria-label="Choisir une ou plusieurs traces GPX"
            accept=".gpx,application/gpx+xml,application/xml,text/xml"
            multiple
            onChange={(event) => {
              if (event.target.files) onImport(event.target.files);
              event.target.value = "";
            }}
          />
        </fieldset>

        <button className="demo-action" type="button" onClick={onDemo} disabled={importing}>
          <Play size={14} fill="currentColor" /> Explorer la trace de démonstration
        </button>
      </section>

      <aside className="hero-readouts" aria-label="Capacités de l’application">
        <div>
          <MapPinned size={17} />
          <span>Terrain</span>
          <strong>3D réel</strong>
        </div>
        <div>
          <Gauge size={17} />
          <span>Mesures</span>
          <strong>Source + calcul</strong>
        </div>
        <div>
          <Route size={17} />
          <span>Caméras</span>
          <strong>4 modes</strong>
        </div>
      </aside>

      <section className="flight-log" aria-labelledby="flight-log-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">
              <span>02</span> Stockage navigateur
            </span>
            <h2 id="flight-log-title">Vos derniers vols</h2>
          </div>
          <span className="flight-count">{flights.length.toString().padStart(2, "0")}</span>
        </div>

        {flights.length === 0 ? (
          <div className="empty-log">
            <Plane size={28} strokeWidth={1.2} />
            <p>Aucun vol enregistré. Votre première trace apparaîtra ici.</p>
          </div>
        ) : (
          <div className="flight-list">
            {flights.map((flight, index) => (
              <article className="flight-strip" key={flight.id}>
                <button className="flight-open" type="button" onClick={() => onOpen(flight)}>
                  <span className="strip-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="strip-main">
                    <strong>{flight.displayName}</strong>
                    <span>{formatLocalDate(flight.data.summary.startTime)}</span>
                  </span>
                  <span className="strip-stat">
                    <Clock3 size={13} />
                    {formatDuration(flight.data.summary.duration)}
                  </span>
                  <span className="strip-stat">
                    <Route size={13} />
                    {formatDistance(flight.data.summary.distance)}
                  </span>
                  <ChevronRight className="strip-arrow" size={20} />
                </button>
                {editingId === flight.id && (
                  <div className="rename-panel">
                    <input
                      ref={renameInputRef}
                      aria-label={`Nouveau nom de ${flight.displayName}`}
                      defaultValue={flight.displayName}
                      onBlur={(event) => {
                        onRename(flight.id, event.target.value);
                        setEditingId(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                        if (event.key === "Escape") setEditingId(null);
                      }}
                    />
                  </div>
                )}
                <div className="strip-actions">
                  <button
                    type="button"
                    aria-label={`Renommer ${flight.displayName}`}
                    onClick={() => setEditingId(flight.id)}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Supprimer ${flight.displayName}`}
                    onClick={() => setPendingDeleteId(flight.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                {pendingDeleteId === flight.id && (
                  <div
                    className="delete-confirm"
                    role="alertdialog"
                    aria-label={`Confirmer la suppression de ${flight.displayName}`}
                  >
                    <span>Supprimer ce vol local ?</span>
                    <button type="button" onClick={() => setPendingDeleteId(null)}>
                      Annuler
                    </button>
                    <button
                      className="confirm-danger"
                      type="button"
                      onClick={() => {
                        setPendingDeleteId(null);
                        onDelete(flight.id);
                      }}
                    >
                      Supprimer
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <footer className="landing-footer">
        <span>GPX3D / Données de terrain indicatives</span>
        <span>
          Les fonds en ligne reçoivent les coordonnées des tuiles affichées{" "}
          <ArrowUpRight size={12} />
        </span>
      </footer>

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button type="button" aria-label="Fermer" onClick={onClearError}>
            <X size={18} />
          </button>
        </div>
      )}
    </main>
  );
}
