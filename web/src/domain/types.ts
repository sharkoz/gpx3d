export type VerticalReference = {
  basis: "orthometric" | "ellipsoidal" | "unknown";
  geoidModel: "EGM96" | "EGM2008" | null;
  correctionApplied: boolean | null;
  evidence: string[];
};

export type FlightPoint = {
  index: number;
  segmentIndex: number;
  latitude: number;
  longitude: number;
  elevation: number | null;
  ellipsoidElevation: number | null;
  time: number | null;
  sourceSpeed: number | null;
  sourceCourse: number | null;
  satellites: number | null;
  calculatedSpeed: number | null;
  calculatedCourse: number | null;
  verticalSpeed: number | null;
  turnRate: number | null;
  distance: number;
  gapBefore: boolean;
};

export type FlightBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
  minElevation: number | null;
  maxElevation: number | null;
};

export type FlightSummary = {
  pointCount: number;
  segmentCount: number;
  startTime: number | null;
  endTime: number | null;
  duration: number | null;
  distance: number;
  movingDuration: number | null;
  averageCalculatedSpeed: number | null;
  maximumCalculatedSpeed: number | null;
  maximumSourceSpeed: number | null;
  elevationGain: number | null;
  elevationLoss: number | null;
  maximumClimb: number | null;
  maximumSink: number | null;
};

export type FlightData = {
  schemaVersion: 2;
  name: string;
  creator: string | null;
  gpxVersion: string | null;
  verticalReference: VerticalReference;
  points: FlightPoint[];
  segmentStarts: number[];
  bounds: FlightBounds;
  summary: FlightSummary;
  warnings: string[];
};

export type FlightRecord = {
  id: string;
  displayName: string;
  sourceFilename: string;
  importedAt: number;
  originalGpx: string;
  data: FlightData;
};
