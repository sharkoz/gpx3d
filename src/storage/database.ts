import Dexie, { type EntityTable } from "dexie";
import type { FlightRecord } from "@/domain/types";

const database = new Dexie("gpx3d") as Dexie & {
  flights: EntityTable<FlightRecord, "id">;
};

database.version(1).stores({
  flights: "id, importedAt, displayName",
});

export async function listFlights() {
  return database.flights.orderBy("importedAt").reverse().toArray();
}

export async function getFlight(id: string) {
  return database.flights.get(id);
}

export async function saveFlight(record: FlightRecord) {
  await database.flights.put(record);
}

export async function renameFlight(id: string, displayName: string) {
  const normalized = displayName.trim();
  if (!normalized) return;
  await database.flights.update(id, { displayName: normalized });
}

export async function deleteFlight(id: string) {
  await database.flights.delete(id);
}

export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
}
