import { useEffect, useState } from "react";
import { FlightViewer } from "@/components/FlightViewer";
import { Landing } from "@/components/Landing";
import type { FlightRecord } from "@/domain/types";
import { importFlightFile, loadDemoFlight } from "@/import/importFlight";
import {
  deleteFlight,
  listFlights,
  renameFlight,
  requestPersistentStorage,
  saveFlight,
  setFlightAltitudeOffset,
} from "@/storage/database";

async function loadLibrary() {
  const stored = await listFlights();
  const migrated: FlightRecord[] = [];
  for (const record of stored) {
    if (Number(record.data.schemaVersion) === 2) {
      migrated.push(record);
      continue;
    }
    try {
      const upgraded = await importFlightFile(
        new File([record.originalGpx], record.sourceFilename, { type: "application/gpx+xml" }),
      );
      const preserved = {
        ...upgraded,
        displayName: record.displayName,
        importedAt: record.importedAt,
        altitudeOffset: record.altitudeOffset ?? 0,
      };
      await saveFlight(preserved);
      migrated.push(preserved);
    } catch {
      migrated.push(record);
    }
  }
  return migrated;
}

export default function App() {
  const [flights, setFlights] = useState<FlightRecord[]>([]);
  const [activeFlight, setActiveFlight] = useState<FlightRecord | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshFlights = async () => setFlights(await loadLibrary());

  useEffect(() => {
    loadLibrary()
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
      <FlightViewer
        record={activeFlight}
        onBack={() => setActiveFlight(null)}
        onAltitudeOffsetChange={(altitudeOffset) => {
          setActiveFlight((current) => (current ? { ...current, altitudeOffset } : current));
          setFlights((current) =>
            current.map((flight) =>
              flight.id === activeFlight.id ? { ...flight, altitudeOffset } : flight,
            ),
          );
          setFlightAltitudeOffset(activeFlight.id, altitudeOffset).catch(() =>
            setError("L’offset d’altitude n’a pas pu être enregistré."),
          );
        }}
      />
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
