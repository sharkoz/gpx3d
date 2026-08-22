import { useEffect, useState } from "react";
import { FlightViewer } from "@/components/FlightViewer";
import { Landing } from "@/components/Landing";
import type { FlightRecord, FlightSettingsPatch } from "@/domain/types";
import { importFlightFile, loadDemoFlight } from "@/import/importFlight";
import {
  deleteFlight,
  getFlight,
  listFlights,
  renameFlight,
  requestPersistentStorage,
  saveFlight,
  updateFlightSettings,
} from "@/storage/database";

async function preserveFlightSettings(record: FlightRecord) {
  const existing = await getFlight(record.id);
  if (!existing) return record;
  return {
    ...record,
    displayName: existing.displayName,
    altitudeOffset: existing.altitudeOffset ?? 0,
    aircraftModelId: existing.aircraftModelId,
    departureAlignmentDecision: existing.departureAlignmentDecision,
  };
}

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
        aircraftModelId: record.aircraftModelId,
        departureAlignmentDecision: record.departureAlignmentDecision,
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
    const preserved = await preserveFlightSettings(record);
    await saveFlight(preserved);
    await requestPersistentStorage();
    await refreshFlights();
    setActiveFlight(preserved);
  };

  const handleImport = async (files: FileList | File[]) => {
    setImporting(true);
    setError(null);
    try {
      let latest: FlightRecord | null = null;
      for (const file of Array.from(files)) {
        latest = await preserveFlightSettings(await importFlightFile(file));
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
        onSettingsChange={(patch: FlightSettingsPatch) => {
          setActiveFlight((current) => (current ? { ...current, ...patch } : current));
          setFlights((current) =>
            current.map((flight) =>
              flight.id === activeFlight.id ? { ...flight, ...patch } : flight,
            ),
          );
          updateFlightSettings(activeFlight.id, patch).catch(() =>
            setError("Les réglages du vol n’ont pas pu être enregistrés."),
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
