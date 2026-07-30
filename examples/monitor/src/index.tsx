// System monitor — the point of this example in one sentence: the UI is the
// React Native API, the data is the plain Node runtime (node:os, node:fs,
// timers), and the window is native GTK4/Adwaita. No bindings, no bridge
// modules, no permissions dance — on this platform "native modules" are
// just Node.
import { readFileSync } from "node:fs"
import { cpus, freemem, loadavg, release, totalmem, uptime } from "node:os"
import { useEffect, useState } from "react"
import { Appearance, AppRegistry, StyleSheet, Text, View } from "react-native"

const palette = {
  window: "#241f31",
  card: "#3d3846",
  cardAlt: "#4a4458",
  text: "#ffffff",
  textDim: "#c0bfbc",
  accent: "#3584e4",
  green: "#33d17a",
  yellow: "#f6d32d",
  red: "#f66151",
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 20,
    gap: 14,
    backgroundColor: palette.window,
  },
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
  },
  title: {
    color: palette.text,
    fontSize: 22,
    fontWeight: "700",
  },
  subtitle: {
    color: palette.textDim,
    fontSize: 13,
  },
  card: {
    backgroundColor: palette.card,
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  cardTitle: {
    color: palette.text,
    fontSize: 13,
    fontWeight: "700",
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  barLabel: {
    color: palette.textDim,
    fontSize: 12,
    width: 52,
  },
  barTrack: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: palette.cardAlt,
    overflow: "hidden",
  },
  barValue: {
    color: palette.textDim,
    fontSize: 12,
    width: 44,
    textAlign: "right",
  },
  chipsRow: {
    flexDirection: "row",
    gap: 10,
  },
  chip: {
    flex: 1,
    backgroundColor: palette.card,
    borderRadius: 12,
    padding: 14,
    gap: 2,
  },
  chipValue: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "700",
  },
  chipLabel: {
    color: palette.textDim,
    fontSize: 12,
  },
})

type CpuTimes = { idle: number; total: number }

const readCpuTimes = (): CpuTimes[] =>
  cpus().map((cpu) => {
    const { user, nice, sys, idle, irq } = cpu.times
    return { idle, total: user + nice + sys + idle + irq }
  })

const usageColor = (used: number): string => {
  if (used >= 0.85) {
    return palette.red
  }
  if (used >= 0.55) {
    return palette.yellow
  }
  return palette.green
}

const osPrettyName = (): string => {
  try {
    const release = readFileSync("/etc/os-release", "utf8")
    const match = /^PRETTY_NAME="?([^"\n]+)"?/m.exec(release)
    if (match) {
      return match[1]
    }
  } catch {
    // Fall through to the generic label.
  }
  return "Linux"
}

const formatUptime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${String(minutes).padStart(2, "0")}m`
}

const gib = (bytes: number): string => (bytes / 1024 ** 3).toFixed(1)

const Bar = ({ label, used }: { label: string; used: number }) => (
  <View style={styles.barRow}>
    <Text style={styles.barLabel}>{label}</Text>
    <View style={styles.barTrack}>
      <View
        style={{
          width: `${Math.round(used * 100)}%`,
          height: "100%",
          borderRadius: 5,
          backgroundColor: usageColor(used),
        }}
      />
    </View>
    <Text style={styles.barValue}>{`${Math.round(used * 100)}%`}</Text>
  </View>
)

const App = () => {
  const [cores, setCores] = useState<number[]>(() =>
    readCpuTimes().map(() => 0),
  )
  const [memoryUsed, setMemoryUsed] = useState(0)
  const [now, setNow] = useState(() => ({
    uptime: uptime(),
    load: loadavg(),
  }))

  useEffect(() => {
    let previous = readCpuTimes()
    const timer = setInterval(() => {
      const current = readCpuTimes()
      setCores(
        current.map((core, index) => {
          const before = previous[index] ?? core
          const total = core.total - before.total
          const idle = core.idle - before.idle
          return total > 0 ? 1 - idle / total : 0
        }),
      )
      previous = current
      setMemoryUsed(1 - freemem() / totalmem())
      setNow({ uptime: uptime(), load: loadavg() })
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>{osPrettyName()}</Text>
        <Text style={styles.subtitle}>{`Linux ${release()}`}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{`CPU — ${cores.length} cores`}</Text>
        {cores.map((used, index) => (
          <Bar
            key={index}
            label={`core ${index}`}
            used={used}
          />
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {`Memory — ${gib(totalmem() - freemem())} / ${gib(totalmem())} GiB`}
        </Text>
        <Bar
          label="used"
          used={memoryUsed}
        />
      </View>

      <View style={styles.chipsRow}>
        <View style={styles.chip}>
          <Text style={styles.chipValue}>{formatUptime(now.uptime)}</Text>
          <Text style={styles.chipLabel}>uptime</Text>
        </View>
        <View style={styles.chip}>
          <Text style={styles.chipValue}>{now.load[0]!.toFixed(2)}</Text>
          <Text style={styles.chipLabel}>load 1m</Text>
        </View>
        <View style={styles.chip}>
          <Text style={styles.chipValue}>{now.load[1]!.toFixed(2)}</Text>
          <Text style={styles.chipLabel}>load 5m</Text>
        </View>
      </View>

      <Text style={styles.subtitle}>
        React Native components, the whole Node runtime (node:os, node:fs,
        timers) and a native GTK4 window — in one file.
      </Text>
    </View>
  )
}

Appearance.setColorScheme("dark")
AppRegistry.registerComponent("monitor", () => App)
AppRegistry.runApplication("monitor", {
  title: "System Monitor",
  width: 560,
  height: 545,
})
