import type { AircraftModelId } from "@/domain/types";

type Vector3 = [number, number, number];
type Quaternion = [number, number, number, number];
type Part = {
  color: number;
  position: Vector3;
  size: Vector3;
  rotation?: Quaternion;
  mesh?: "box" | "wing";
};

const CUBE_BUFFER =
  "AAAAvwAAAL8AAAC/AAAAPwAAAL8AAAC/AAAAPwAAAD8AAAC/AAAAvwAAAD8AAAC/AAAAvwAAAL8AAAA/AAAAPwAAAL8AAAA/AAAAPwAAAD8AAAA/AAAAvwAAAD8AAAA/AAACAAEAAAADAAIABAAFAAYABAAGAAcAAAABAAUAAAAFAAQAAQACAAYAAQAGAAUAAgADAAcAAgAHAAYAAwAAAAQAAwAEAAcA";
const WING_BUFFER =
  "MzMzQAAAAADNzMw9zcwswJqZmUAAAAAAMzPzv5qZGUAAAAA/AADAvwAAAADNzEw/MzPzv5qZGcAAAAA/zcwswJqZmcAAAAAAAAABAAIAAAADAAQAAAACAAMAAAAEAAUA";

const rotate = (axis: "x" | "y" | "z", degrees: number): Quaternion => {
  const angle = (degrees * Math.PI) / 360;
  const sine = Math.sin(angle);
  return [
    axis === "x" ? sine : 0,
    axis === "y" ? sine : 0,
    axis === "z" ? sine : 0,
    Math.cos(angle),
  ];
};

const box = (color: number, position: Vector3, size: Vector3, rotation?: Quaternion): Part => ({
  color,
  position,
  size,
  rotation,
});

const wing = (position: Vector3): Part => ({
  color: 0,
  position,
  size: [1, 1, 1],
  mesh: "wing",
});

const palettes: Record<AircraftModelId, Array<[number, number, number, number]>> = {
  cessna: [
    [1, 0.61, 0.12, 1],
    [0.95, 0.95, 0.9, 1],
    [0.05, 0.12, 0.14, 1],
    [0.25, 0.65, 0.72, 0.8],
  ],
  ultralight: [
    [0.2, 0.85, 0.75, 1],
    [0.96, 0.72, 0.2, 1],
    [0.06, 0.12, 0.13, 1],
    [0.7, 0.82, 0.8, 1],
  ],
  paramotor: [
    [0.98, 0.35, 0.18, 1],
    [0.55, 0.25, 0.8, 1],
    [0.05, 0.09, 0.12, 1],
    [0.95, 0.75, 0.2, 1],
  ],
  helicopter: [
    [0.28, 0.62, 0.32, 1],
    [0.92, 0.78, 0.18, 1],
    [0.04, 0.09, 0.1, 1],
    [0.22, 0.55, 0.64, 0.82],
  ],
  a380: [
    [0.88, 0.92, 0.94, 1],
    [0.08, 0.3, 0.68, 1],
    [0.08, 0.11, 0.14, 1],
    [0.2, 0.55, 0.72, 0.82],
  ],
  mirage: [
    [0.48, 0.54, 0.56, 1],
    [0.76, 0.8, 0.8, 1],
    [0.08, 0.1, 0.11, 1],
    [0.24, 0.48, 0.58, 0.86],
  ],
};

const models: Record<AircraftModelId, Part[]> = {
  cessna: [
    box(0, [0, 0, 0], [7, 1.15, 1.15]),
    box(1, [3.55, 0, 0], [1.3, 1.35, 1.25]),
    box(1, [0.45, 0, 0.15], [1.7, 11, 0.22]),
    box(0, [-3.2, 0, 0.15], [1.2, 4.1, 0.18]),
    box(0, [-3.15, 0, 0.78], [1.4, 0.18, 1.5]),
    box(3, [1.25, 0, 0.45], [1.45, 1.22, 0.48]),
    box(2, [3.9, 0, 0], [0.15, 2.5, 0.12]),
  ],
  ultralight: [
    box(0, [0, 0, -0.95], [3.2, 0.65, 0.55]),
    box(2, [-1.25, 0, -0.65], [0.8, 0.9, 0.9]),
    box(3, [0.65, 0, -0.45], [0.8, 0.75, 0.7]),
    wing([0, 0, 1.35]),
    box(2, [-0.05, 2.4, 1.45], [7.1, 0.12, 0.1], rotate("z", -42)),
    box(2, [-0.05, -2.4, 1.45], [7.1, 0.12, 0.1], rotate("z", 42)),
    box(2, [-2.65, 0, 1.42], [0.12, 9.5, 0.1]),
    box(2, [0.65, 0, 1.56], [4.4, 0.12, 0.1]),
    box(2, [0, 0, 0.05], [0.16, 0.16, 2.5]),
    box(3, [0, 1, 0.42], [0.1, 0.1, 2.65], rotate("x", -49)),
    box(3, [0, -1, 0.42], [0.1, 0.1, 2.65], rotate("x", 49)),
    box(2, [-0.2, 0.52, -1.25], [2.4, 0.12, 0.12]),
    box(2, [-0.2, -0.52, -1.25], [2.4, 0.12, 0.12]),
  ],
  paramotor: [
    box(2, [0, 0, -0.95], [0.45, 0.55, 1.25]),
    box(0, [-0.35, 0, -0.75], [0.65, 0.95, 0.75]),
    box(3, [0.2, 0, -1.55], [0.65, 0.35, 0.4]),
    box(0, [0, 0, 2.2], [1.8, 1.7, 0.18]),
    box(1, [0, 1.55, 2.05], [1.7, 1.55, 0.18], rotate("x", -8)),
    box(1, [0, -1.55, 2.05], [1.7, 1.55, 0.18], rotate("x", 8)),
    box(0, [0, 2.9, 1.65], [1.55, 1.25, 0.16], rotate("x", -16)),
    box(0, [0, -2.9, 1.65], [1.55, 1.25, 0.16], rotate("x", 16)),
    box(3, [0, 1.55, 0.2], [0.06, 0.06, 3.6], rotate("x", -20)),
    box(3, [0, -1.55, 0.2], [0.06, 0.06, 3.6], rotate("x", 20)),
  ],
  helicopter: [
    box(0, [0.8, 0, 0], [4.2, 1.55, 1.55]),
    box(3, [2.35, 0, 0.15], [1.45, 1.58, 1.25]),
    box(0, [-2.55, 0, 0.15], [4.3, 0.38, 0.38]),
    box(1, [-4.65, 0, 0.45], [0.2, 0.2, 2.1]),
    box(1, [-4.65, 0, 0.45], [0.2, 2.1, 0.2]),
    box(2, [0.25, 0, 1.25], [0.18, 0.18, 1.2]),
    box(2, [0.25, 0, 1.85], [0.18, 10.5, 0.09]),
    box(2, [0.25, 0, 1.85], [8.5, 0.18, 0.09]),
    box(2, [0.4, 0.8, -1], [3.2, 0.12, 0.12]),
    box(2, [0.4, -0.8, -1], [3.2, 0.12, 0.12]),
  ],
  a380: [
    box(0, [0, 0, 0], [18, 2.3, 2.45]),
    box(0, [9.1, 0, 0], [2.2, 2.15, 2.15]),
    box(1, [0.2, 0, 0.1], [5.3, 24, 0.38]),
    box(0, [-8, 0, 0.3], [2.8, 8, 0.25]),
    box(1, [-8.4, 0, 1.75], [2.4, 0.28, 3.6]),
    box(3, [6.5, 0, 0.65], [3.5, 2.2, 0.5]),
    box(2, [1.2, 4.2, -0.75], [2.1, 1.2, 1.2]),
    box(2, [1.2, -4.2, -0.75], [2.1, 1.2, 1.2]),
    box(2, [-0.2, 8.3, -0.65], [2.1, 1.2, 1.2]),
    box(2, [-0.2, -8.3, -0.65], [2.1, 1.2, 1.2]),
  ],
  mirage: [
    box(0, [0, 0, 0], [9.2, 1.05, 1.05]),
    box(1, [5.2, 0, 0], [3.2, 0.72, 0.72]),
    box(0, [-1, 2.1, 0], [5.2, 1.25, 0.2], rotate("z", -28)),
    box(0, [-1, -2.1, 0], [5.2, 1.25, 0.2], rotate("z", 28)),
    box(0, [-2.4, 0, 0], [3.4, 7.5, 0.22]),
    box(0, [-3.4, 0, 1], [1.8, 0.2, 2.2]),
    box(3, [2.2, 0, 0.6], [2, 0.9, 0.55]),
    box(2, [-4.6, 0, 0], [0.22, 0.85, 0.7]),
  ],
};

function createModelUri(id: AircraftModelId) {
  const materials = palettes[id].map((color) => ({
    pbrMetallicRoughness: {
      baseColorFactor: color,
      metallicFactor: 0,
      roughnessFactor: 0.82,
    },
    doubleSided: true,
    alphaMode: color[3] < 1 ? "BLEND" : "OPAQUE",
    extensions: { KHR_materials_unlit: {} },
  }));
  const gltf = {
    asset: { version: "2.0", generator: "GPX3D low-poly aircraft" },
    extensionsUsed: ["KHR_materials_unlit"],
    buffers: [
      {
        uri: `data:application/octet-stream;base64,${CUBE_BUFFER}`,
        byteLength: 168,
      },
      {
        uri: `data:application/octet-stream;base64,${WING_BUFFER}`,
        byteLength: 96,
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 96, target: 34962 },
      { buffer: 0, byteOffset: 96, byteLength: 72, target: 34963 },
      { buffer: 1, byteOffset: 0, byteLength: 72, target: 34962 },
      { buffer: 1, byteOffset: 72, byteLength: 12, target: 34963 },
      { buffer: 1, byteOffset: 84, byteLength: 12, target: 34963 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 8,
        type: "VEC3",
        min: [-0.5, -0.5, -0.5],
        max: [0.5, 0.5, 0.5],
      },
      { bufferView: 1, componentType: 5123, count: 36, type: "SCALAR" },
      {
        bufferView: 2,
        componentType: 5126,
        count: 6,
        type: "VEC3",
        min: [-2.7, -4.8, 0],
        max: [2.8, 4.8, 0.8],
      },
      { bufferView: 3, componentType: 5123, count: 6, type: "SCALAR" },
      { bufferView: 4, componentType: 5123, count: 6, type: "SCALAR" },
    ],
    materials,
    meshes: [
      ...materials.map((_, material) => ({
        primitives: [{ attributes: { POSITION: 0 }, indices: 1, material }],
      })),
      {
        primitives: [
          { attributes: { POSITION: 2 }, indices: 3, material: 0 },
          { attributes: { POSITION: 2 }, indices: 4, material: 1 },
        ],
      },
    ],
    nodes: models[id].map((part) => ({
      mesh: part.mesh === "wing" ? materials.length : part.color,
      translation: part.position,
      scale: part.size,
      ...(part.rotation ? { rotation: part.rotation } : {}),
    })),
    scenes: [{ nodes: models[id].map((_, index) => index) }],
    scene: 0,
  };
  return `data:model/gltf+json;charset=utf-8,${encodeURIComponent(JSON.stringify(gltf))}`;
}

export const aircraftModelOptions: Array<{ id: AircraftModelId; label: string }> = [
  { id: "cessna", label: "Petit Cessna" },
  { id: "ultralight", label: "ULM pendulaire" },
  { id: "paramotor", label: "Parapente / paramoteur" },
  { id: "helicopter", label: "Hélicoptère" },
  { id: "a380", label: "Airbus A380" },
  { id: "mirage", label: "Mirage" },
];

export const aircraftModelUris = Object.fromEntries(
  aircraftModelOptions.map(({ id }) => [id, createModelUri(id)]),
) as Record<AircraftModelId, string>;
