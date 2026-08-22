const MAX_BANK = 0.44;
const MAX_PITCH = 0.35;

export function bankAngle(speed: number | null, turnRateDegrees: number | null) {
  if (speed === null || turnRateDegrees === null) return 0;
  const turnRate = (turnRateDegrees * Math.PI) / 180;
  return Math.max(-MAX_BANK, Math.min(MAX_BANK, Math.atan((speed * turnRate) / 9.81)));
}

export function trajectoryPitch(verticalSpeed: number | null, horizontalSpeed: number | null) {
  if (verticalSpeed === null || horizontalSpeed === null) return 0;
  return Math.max(
    -MAX_PITCH,
    Math.min(MAX_PITCH, Math.atan2(verticalSpeed, Math.max(1, horizontalSpeed))),
  );
}
