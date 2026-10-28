import { readFile, readdir } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, join } from "node:path"
import type { ServerEndpoint } from "@opencode/plugin/gui/main"
import type { CgroupMemory, MemoryProcess, MemorySample, ProcessKind } from "./contract"

const CGROUP_ROOT = "/sys/fs/cgroup"
const SERVICE_STATE = join(homedir(), ".local/state/opencode/service.json")

interface ProcessEntry {
  ppid: number
  comm: string
}

interface ProcessReading {
  args: string[]
  memory: MemoryProcess
}

interface ServiceState {
  pid: number
  url?: string
}

let inFlight: Promise<MemorySample> | undefined

export function sampleMemory(endpoint?: ServerEndpoint) {
  if (inFlight) return inFlight

  const pending = collect(endpoint)
  inFlight = pending
  const clear = () => {
    if (inFlight === pending) inFlight = undefined
  }
  pending.then(clear, clear)
  return pending
}

async function collect(endpoint?: ServerEndpoint): Promise<MemorySample> {
  const [table, cgroup, appName] = await Promise.all([readProcessTable(), readCgroup(), readAppName()])
  const serverPid = await resolveServerPid(table, endpoint)
  const children = childrenByParent(table)
  const serverPids = serverPid === undefined ? [] : tree(serverPid, children)
  const serverSet = new Set(serverPids)
  const appPids = tree(process.pid, children, serverSet)
  const appSet = new Set(appPids)

  const app = await readProcesses(appPids, table, appName)
  const helpers = await findHelpers(table, appSet, serverSet, app, appName)
  const appReadings = [...app, ...helpers]
  const serverReadings = serverPid === undefined ? [] : await readProcesses(serverPids, table, appName, serverPid)
  const serverRoot = serverReadings.find((reading) => reading.memory.pid === serverPid)
  const sidecar = serverRoot ? serverReadings : []

  return {
    at: Date.now(),
    app: totalPss(appReadings),
    server: totalPss(sidecar),
    serverPid: serverRoot?.memory.pid ?? null,
    serverRunning: serverRoot !== undefined,
    processes: [...appReadings, ...sidecar].map((reading) => reading.memory),
    cgroup: cgroup ?? null,
  }
}

function totalPss(readings: ProcessReading[]) {
  return readings.reduce((total, reading) => total + reading.memory.pss, 0)
}

async function readProcessTable() {
  const pids = await listPids()
  const rows = await Promise.all(
    pids.map(async (pid) => {
      const stat = await readText(`/proc/${pid}/stat`)
      if (!stat) return undefined
      const entry = parseStat(stat)
      if (!entry) return undefined
      return [pid, entry] as const
    }),
  )

  return new Map(rows.filter((row): row is readonly [number, ProcessEntry] => row !== undefined))
}

function parseStat(stat: string): ProcessEntry | undefined {
  const open = stat.indexOf("(")
  const close = stat.lastIndexOf(")")
  if (open < 0 || close < open) return undefined

  const rest = stat.slice(close + 2).trim().split(/\s+/)
  const ppid = Number(rest[1])
  if (!Number.isInteger(ppid)) return undefined

  return { comm: stat.slice(open + 1, close), ppid }
}

function childrenByParent(table: Map<number, ProcessEntry>) {
  const children = new Map<number, number[]>()
  for (const [pid, entry] of table) {
    const siblings = children.get(entry.ppid)
    if (siblings) siblings.push(pid)
    else children.set(entry.ppid, [pid])
  }
  return children
}

function tree(root: number, children: Map<number, number[]>, blocked?: Set<number>) {
  const result: number[] = []
  const queue = [root]

  for (let index = 0; index < queue.length; index++) {
    const pid = queue[index]
    if (blocked?.has(pid)) continue
    result.push(pid)
    queue.push(...(children.get(pid) ?? []))
  }

  return result
}

async function readProcesses(
  pids: number[],
  table: Map<number, ProcessEntry>,
  appName: string | undefined,
  serverPid?: number,
) {
  const readings = await Promise.all(
    pids.map(async (pid) => {
      const args = await readCmdline(pid)
      const kind = pid === serverPid ? "cli" : classify(pid, args, table.get(pid)?.comm)
      return readProcess(pid, table, args, appName, kind)
    }),
  )

  return readings.filter((reading): reading is ProcessReading => reading !== undefined)
}

async function findHelpers(
  table: Map<number, ProcessEntry>,
  app: Set<number>,
  server: Set<number>,
  readings: ProcessReading[],
  appName: string | undefined,
) {
  const userDataDirs = new Set<string>()
  for (const reading of readings) {
    const dir = argument(reading.args, "--user-data-dir=")
    if (dir) userDataDirs.add(trimSlash(dir))
  }
  if (userDataDirs.size === 0) return []

  const candidates = new Set<number>()
  for (const reading of readings) {
    const crashpad = argument(reading.args, "--crashpad-handler-pid=")
    if (crashpad && /^\d+$/.test(crashpad)) candidates.add(Number(crashpad))
  }
  for (const [pid, entry] of table) {
    if (app.has(pid) || server.has(pid)) continue
    if (entry.comm.includes("crashpad") || entry.comm === "electron" || entry.comm === "opencode-desktop") {
      candidates.add(pid)
    }
  }

  const helpers = await Promise.all(
    [...candidates].map(async (pid) => {
      if (app.has(pid) || server.has(pid) || !table.has(pid)) return undefined
      const args = await readCmdline(pid)
      if (!isAssociatedHelper(args, userDataDirs)) return undefined
      return readProcess(pid, table, args, appName)
    }),
  )

  return helpers.filter((reading): reading is ProcessReading => reading !== undefined)
}

function isAssociatedHelper(args: string[], userDataDirs: Set<string>) {
  const database = argument(args, "--database=")
  if (database && [...userDataDirs].some((dir) => database === `${dir}/Crashpad` || database.startsWith(`${dir}/`))) {
    return true
  }

  const dir = argument(args, "--user-data-dir=")
  return dir !== undefined && userDataDirs.has(trimSlash(dir))
}

async function readProcess(
  pid: number,
  table: Map<number, ProcessEntry>,
  args: string[],
  appName: string | undefined,
  kind?: ProcessKind,
) {
  const pss = await readPss(pid)
  if (pss === undefined) return undefined

  const resolved = kind ?? classify(pid, args, table.get(pid)?.comm)
  return {
    args,
    memory: {
      pid,
      name: processName(pid, table.get(pid)?.comm, args, appName, resolved),
      kind: resolved,
      pss,
    },
  } satisfies ProcessReading
}

function processName(
  pid: number,
  comm: string | undefined,
  args: string[],
  appName: string | undefined,
  kind: ProcessKind,
) {
  const executable = basename(args[0] ?? "")
  if (kind === "main") {
    if (appName) return appName
    return executable || comm?.trim() || String(pid)
  }
  if (kind !== "cli" && kind !== "other" && appName) return `${appName} ${kind}`
  return executable || comm?.trim() || String(pid)
}

function classify(pid: number, args: string[], comm: string | undefined): ProcessKind {
  if (pid === process.pid) return "main"

  const command = args.join(" ")
  if (command.includes("--type=crashpad-handler") || comm?.includes("crashpad")) return "crashpad"
  if (command.includes("--type=zygote")) return "zygote"
  if (command.includes("--type=renderer")) return "renderer"
  if (command.includes("--type=gpu-process")) return "gpu"
  if (command.includes("--type=utility")) {
    return command.includes("network.mojom.NetworkService") ? "network" : "utility"
  }
  return "other"
}

async function readPss(pid: number) {
  const text = await readText(`/proc/${pid}/smaps_rollup`)
  if (!text) return undefined

  const match = /^Pss:\s*(\d+)\s*kB$/m.exec(text)
  return match ? Number(match[1]) * 1024 : undefined
}

async function readCmdline(pid: number) {
  const text = await readText(`/proc/${pid}/cmdline`)
  return text?.split("\0").filter((part) => part.length > 0) ?? []
}

async function readAppName() {
  const args = await readCmdline(process.pid)
  return electronName(args)
}

function electronName(args: string[]) {
  const appPath = argument(args, "--app-path=")
  if (appPath) return basename(appPath)

  const path = args.find((arg, index) => index > 0 && !arg.startsWith("-"))
  return path ? basename(path) : undefined
}

async function resolveServerPid(table: Map<number, ProcessEntry>, endpoint?: ServerEndpoint) {
  const service = await readService()
  if (!service || !table.has(service.pid)) return undefined

  const args = await readCmdline(service.pid)
  if (!isManagedService(args)) return undefined
  if (endpoint && service.url && !sameEndpoint(service.url, endpoint.url)) return undefined

  return service.pid
}

async function readService(): Promise<ServiceState | undefined> {
  const text = await readText(SERVICE_STATE)
  if (!text) return undefined

  const value = parseJson(text)
  if (typeof value !== "object" || value === null) return undefined

  const record = value as Record<string, unknown>
  const pid = record.pid
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) return undefined

  return { pid, url: typeof record.url === "string" ? record.url : undefined }
}

function isManagedService(args: string[]) {
  if (!args.includes("serve") || !args.includes("--service")) return false
  return args.some((arg) => basename(arg).includes("opencode"))
}

function sameEndpoint(left: string, right: string) {
  const first = parseEndpoint(left)
  const second = parseEndpoint(right)
  if (!first || !second) return false

  const host = first.hostname === second.hostname || (isLoopback(first.hostname) && isLoopback(second.hostname))
  return host && first.port === second.port
}

function parseEndpoint(value: string) {
  try {
    return new URL(value)
  } catch {
    return undefined
  }
}

function isLoopback(host: string) {
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]"
}

function argument(args: string[], prefix: string) {
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
}

function trimSlash(path: string) {
  return path.replace(/\/+$/, "")
}

async function readCgroup(): Promise<CgroupMemory | undefined> {
  const text = await readText("/proc/self/cgroup")
  if (!text) return undefined

  const lines = text.split("\n").filter((line) => line.length > 0)
  const v2 = lines.find((line) => line.startsWith("0::"))
  const v1 = lines
    .map((line) => {
      const [id, controllers, path] = line.split(":")
      return { id, controllers, path }
    })
    .find((entry) => entry.controllers?.split(",").includes("memory") && entry.path !== undefined)

  if (v2) {
    const group = await readCgroupV2(v2.slice(3))
    if (group.current !== null || group.peak !== null) return group
    return v1?.path ? readCgroupV1(v1.path) : group
  }
  if (v1?.path) return readCgroupV1(v1.path)

  return undefined
}

async function readCgroupV2(relative: string): Promise<CgroupMemory> {
  const root = join(CGROUP_ROOT, relative.replace(/^\/+/, ""))
  const [current, peak] = await Promise.all([
    readNumber(join(root, "memory.current")),
    readNumber(join(root, "memory.peak")),
  ])

  return { version: 2, path: relative || "/", current: current ?? null, peak: peak ?? null }
}

async function readCgroupV1(relative: string): Promise<CgroupMemory> {
  const root = join(CGROUP_ROOT, "memory", relative.replace(/^\/+/, ""))
  const [current, peak] = await Promise.all([
    readNumber(join(root, "memory.usage_in_bytes")),
    readNumber(join(root, "memory.max_usage_in_bytes")),
  ])

  return { version: 1, path: relative, current: current ?? null, peak: peak ?? null }
}

async function readNumber(file: string) {
  const text = await readText(file)
  if (text === undefined) return undefined

  const value = Number(text.trim())
  return Number.isFinite(value) && value >= 0 ? value : undefined
}

async function listPids() {
  const entries = await readdir("/proc", { withFileTypes: true }).catch(() => [])
  return entries.flatMap((entry) => (/^\d+$/.test(entry.name) ? [Number(entry.name)] : []))
}

async function readText(file: string) {
  return readFile(file, "utf8").catch(() => undefined)
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}
