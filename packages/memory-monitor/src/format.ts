const MIB = 1024 * 1024
const GIB = 1024 * MIB

export function formatBytes(bytes: number) {
  if (bytes >= GIB) return `${(bytes / GIB).toFixed(bytes >= 10 * GIB ? 0 : 1)} GiB`
  if (bytes >= 10 * MIB) return `${Math.round(bytes / MIB)} MiB`
  return `${(bytes / MIB).toFixed(1)} MiB`
}

export function compactBytes(bytes: number) {
  if (bytes >= GIB) return `${(bytes / GIB).toFixed(bytes >= 10 * GIB ? 0 : 1)}G`
  return `${Math.round(bytes / MIB)}M`
}

export function formatSampleTime(at: number) {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}
