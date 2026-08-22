import { useEffect, useState } from "react";
import { Landing } from "@/components/Landing";
import type { FlightRecord } from "@/domain/types";
import { importFlightFile, loadDemoFlight } from "@/import/importFlight";
import {
  deleteFlight,
  listFlights,
  renameFlight,
  requestPersistentStorage,
  saveFlight,
} from "@/storage/database";

export default function App() {
  const [flights, setFlights] = useState<FlightRecord[]>([]);
  const [activeFlight, setActiveFlight] = useState<FlightRecord | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshFlights = async () => setFlights(await listFlights());

  useEffect(() => {
    listFlights()
      .then(setFlights)
      .catch(() => setError("La bibliothèque locale n’est pas accessible."));
  }, []);

  const storeAndOpen = async (record: FlightRecord) => {
    await saveFlight(record);
    await requestPersistentStorage();
    await refreshFlights();
    setActiveFlight(record);
  };

  const handleImport = async (files: FileList | File[]) => {
    setImporting(true);
    setError(null);
    try {
      let latest: FlightRecord | null = null;
      for (const file of Array.from(files)) {
        latest = await importFlightFile(file);
        await saveFlight(latest);
      }
      await requestPersistentStorage();
      await refreshFlights();
      if (latest) setActiveFlight(latest);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "L’import GPX a échoué.");
    } finally {
      setImporting(false);
    }
  };

  const handleDemo = async () => {
    setImporting(true);
    setError(null);
    try {
      await storeAndOpen(await loadDemoFlight());
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Impossible de charger la démonstration.",
      );
    } finally {
      setImporting(false);
    }
  };

  if (activeFlight) {
    return (
      <div className="viewer-placeholder">
        <button type="button" onClick={() => setActiveFlight(null)}>
          Retour aux vols
        </button>
        <h1>{activeFlight.displayName}</h1>
        <p>Scène 3D en préparation.</p>
      </div>
    );
  }

  return (
    <Landing
      flights={flights}
      importing={importing}
      error={error}
      onImport={handleImport}
      onDemo={handleDemo}
      onOpen={setActiveFlight}
      onRename={async (id, name) => {
        await renameFlight(id, name);
        await refreshFlights();
      }}
      onDelete={async (id) => {
        await deleteFlight(id);
        await refreshFlights();
      }}
      onClearError={() => setError(null)}
    />
  );
}
