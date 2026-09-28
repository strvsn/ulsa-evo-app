import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const typescriptMotionPath = path.join(root, 'src/components/charts/windRoseMotionModel.ts');
const typescriptThemePath = path.join(root, 'src/components/charts/windRoseTheme.ts');
const swiftMotionPath = path.join(root, 'ios/App/App/ULSAWindRoseMotionModel.swift');
const swiftThemePath = path.join(root, 'ios/App/App/ULSAWindRoseTheme.swift');
const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'ulsa-wind-rose-parity-'));

const sharedMotionConstants = [
  ['WIND_ROSE_BAR_STEP_DEGREES', 'barStepDegrees'],
  ['FIXED_STEP_SECONDS', 'fixedStepSeconds'],
  ['MAX_ELAPSED_SECONDS', 'maxElapsedSeconds'],
  ['SPEED_RISE_OMEGA', 'speedRiseNaturalFrequency'],
  ['SPEED_FALL_OMEGA', 'speedFallNaturalFrequency'],
  ['VECTOR_CALM_OMEGA', 'vectorLowConfidenceNaturalFrequency'],
  ['VECTOR_FULL_OMEGA', 'vectorHighConfidenceNaturalFrequency'],
  ['DIRECTION_CONFIDENCE_LOW_MPS', 'confidenceLowSpeedMps'],
  ['DIRECTION_CONFIDENCE_HIGH_MPS', 'confidenceHighSpeedMps'],
  ['CALM_TARGET_PREFILTER_SECONDS', 'calmTargetPrefilterSeconds'],
  ['DIRECTION_HOLD_MAGNITUDE_MPS', 'minimumDirectionMagnitudeMps'],
  ['DIRECTION_REACQUIRE_COHERENCE', 'directionReacquireCoherence'],
  ['ANGULAR_VELOCITY_TAU_SECONDS', 'angularVelocitySmoothingSeconds'],
  ['MOVEMENT_START_DEGREES_PER_SECOND', 'movementStartDegreesPerSecond'],
  ['MOVEMENT_STOP_DEGREES_PER_SECOND', 'movementStopDegreesPerSecond'],
  ['SAMPLE_HISTORY_SECONDS', 'variabilityWindowSeconds'],
  ['WAKE_ADVECTION_RATIO', 'fieldAdvectionFactor'],
  ['WAKE_DIFFUSION_BASE_DEGREES_SQUARED_PER_SECOND', 'fieldBaseDiffusionDegreesSquaredPerSecond'],
  ['WAKE_DIFFUSION_VARIABILITY_DEGREES_SQUARED_PER_SECOND', 'fieldVariableDiffusionDegreesSquaredPerSecond'],
  ['WAKE_LOW_SPEED_TAU_SECONDS', 'fieldLowSpeedTauSeconds'],
  ['WAKE_HIGH_SPEED_TAU_SECONDS', 'fieldHighSpeedTauSeconds'],
  ['WAKE_VARIABILITY_TAU_SECONDS', 'fieldVariabilityTauSeconds'],
  ['WAKE_MAX_TAU_SECONDS', 'fieldMaximumTauSeconds'],
  ['WAKE_FORWARD_TAU_SECONDS', 'fieldLeadingTauSeconds'],
  ['WAKE_SPEED_LOW_MPS', 'fieldLowSpeedMps'],
  ['WAKE_SPEED_HIGH_MPS', 'fieldHighSpeedMps'],
  ['SOURCE_SIGMA_STABLE_DEGREES', 'fieldSourceBaseSigmaDegrees'],
  ['SOURCE_SIGMA_VARIABILITY_DEGREES', 'fieldSourceVariableSigmaDegrees'],
  ['SOURCE_PEAK_RATIO', 'fieldSourceMaximumRatio'],
  ['SOURCE_RISE_TAU_SECONDS', 'fieldSourceBuildSeconds'],
  ['SOURCE_FORWARD_SUPPRESSION', 'fieldForwardSourceMaximumSuppression'],
  ['FULL_MOTION_DEGREES_PER_SECOND', 'fullMotionDegreesPerSecond'],
  ['CORE_COHERENCE_FLOOR', 'coreCoherenceFloor'],
];

const sharedLuminousConstants = [
  ['WIND_ROSE_HIGHLIGHT_LIGHTNESS_DELTA', 'highlightLightnessDelta'],
  ['WIND_ROSE_GLOW_ALPHA', 'glowAlpha'],
  ['WIND_ROSE_DARK_GLOW_LIGHTNESS_DELTA', 'darkGlowLightnessDelta'],
  ['WIND_ROSE_LIGHT_GLOW_LIGHTNESS_DELTA', 'lightGlowLightnessDelta'],
  ['WIND_ROSE_GLOW_CHROMA_MULTIPLIER', 'glowChromaMultiplier'],
  ['WIND_ROSE_MINIMUM_STROKE_ALPHA', 'minimumStrokeAlpha'],
  ['WIND_ROSE_GLOW_BLUR_RATIO', 'glowBlurRatio'],
  ['WIND_ROSE_INNER_GLOW_BLUR_RATIO', 'innerGlowBlurRatio'],
  ['WIND_ROSE_INNER_GLOW_OPACITY', 'innerGlowOpacity'],
  ['WIND_ROSE_CORE_WIDTH_RATIO', 'coreWidthRatio'],
  ['WIND_ROSE_CORE_OPACITY', 'coreOpacity'],
];

const parseNumericExpression = (source, name) => {
  const normalized = source.replaceAll('_', '').trim();
  const terms = normalized.split('/').map((term) => Number(term.trim()));
  if (terms.some((term) => !Number.isFinite(term))) {
    throw new Error(`Cannot parse numeric constant ${name}: ${source}`);
  }
  return terms.slice(1).reduce((value, divisor) => value / divisor, terms[0]);
};

const extractTypeScriptConstant = (source, name) => {
  const match = source.match(new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*([^;]+);`));
  if (!match) throw new Error(`TypeScript motion constant is missing: ${name}`);
  return parseNumericExpression(match[1], name);
};

const extractSwiftConstant = (source, name) => {
  const match = source.match(new RegExp(`(?:static|private)\\s+let\\s+${name}\\s*=\\s*([^\\n]+)`));
  if (!match) throw new Error(`Swift motion constant is missing: ${name}`);
  return parseNumericExpression(match[1], name);
};

const verifySharedMotionConstants = () => {
  const typescriptSource = readFileSync(typescriptMotionPath, 'utf8');
  const swiftSource = readFileSync(swiftMotionPath, 'utf8');
  sharedMotionConstants.forEach(([typescriptName, swiftName]) => {
    const typescriptValue = extractTypeScriptConstant(typescriptSource, typescriptName);
    const swiftValue = extractSwiftConstant(swiftSource, swiftName);
    if (Math.abs(typescriptValue - swiftValue) > 1e-12) {
      throw new Error(
        `Motion constant differs: ${typescriptName}=${typescriptValue}, ${swiftName}=${swiftValue}`,
      );
    }
  });
};

const verifySharedLuminousConstants = () => {
  const typescriptSource = readFileSync(typescriptThemePath, 'utf8');
  const swiftSource = readFileSync(swiftThemePath, 'utf8');
  sharedLuminousConstants.forEach(([typescriptName, swiftName]) => {
    const typescriptValue = extractTypeScriptConstant(typescriptSource, typescriptName);
    const swiftValue = extractSwiftConstant(swiftSource, swiftName);
    if (Math.abs(typescriptValue - swiftValue) > 1e-12) {
      throw new Error(
        `Luminous constant differs: ${typescriptName}=${typescriptValue}, `
          + `${swiftName}=${swiftValue}`,
      );
    }
  });
};

const liveSample = (atMs, speedMps, directionDegrees) => ({
  atMs,
  speedMps,
  directionDegrees,
  isLive: true,
  sampleTimestampMs: atMs,
});

const traceDefinitions = [
  {
    name: 'calm-jitter',
    events: [358, 1, 359, 2, 357, 0, 3, 359, 1, 358, 2, 0, 359].map((direction, index) =>
      liveSample(index * 50, 0.042 + (index % 3) * 0.004, direction)),
    checkpointsMs: [0, 100, 250, 400, 600, 850],
  },
  {
    name: 'wrap-359-to-1',
    events: [
      liveSample(0, 2, 359),
      liveSample(100, 2, 359),
      liveSample(200, 2, 1),
      liveSample(300, 2, 1),
    ],
    checkpointsMs: [0, 120, 200, 260, 400, 700],
  },
  {
    name: 'clockwise-sweep',
    events: Array.from({ length: 21 }, (_, index) => {
      const atMs = index * 50;
      return liveSample(atMs, 3, 300 + atMs * 0.12);
    }),
    checkpointsMs: [0, 250, 500, 750, 1000, 1300],
  },
  {
    name: 'reversal-180-degrees',
    events: [
      liveSample(0, 3, 45),
      liveSample(100, 3, 45),
      liveSample(200, 3, 45),
      liveSample(300, 3, 225),
      liveSample(400, 3, 225),
      liveSample(500, 3, 225),
      liveSample(650, 3, 225),
    ],
    checkpointsMs: [0, 200, 300, 360, 500, 700, 1000],
  },
  {
    name: 'gust-attack-release',
    events: [
      liveSample(0, 0.08, 120),
      liveSample(150, 0.20, 120),
      liveSample(300, 6.00, 120),
      liveSample(400, 6.00, 121),
      liveSample(500, 6.00, 120),
      liveSample(650, 0.30, 120),
      liveSample(800, 0.30, 119),
      liveSample(950, 0.08, 120),
    ],
    checkpointsMs: [0, 150, 300, 360, 500, 650, 760, 950, 1250],
  },
  {
    name: 'steady-identical-samples',
    events: Array.from({ length: 9 }, (_, index) => liveSample(index * 250, 2.5, 73)),
    checkpointsMs: [0, 250, 500, 1000, 1500, 2000, 2500],
  },
  {
    name: 'disconnect',
    events: [
      liveSample(0, 4, 210),
      liveSample(150, 4, 212),
      liveSample(300, 4, 214),
      {
        atMs: 500,
        speedMps: null,
        directionDegrees: null,
        isLive: false,
        sampleTimestampMs: 500,
      },
    ],
    checkpointsMs: [0, 300, 450, 500, 650, 1000],
  },
];

const runnerSource = `
import Foundation

struct TraceEvent: Decodable {
    let atMs: Int
    let speedMps: Double?
    let directionDegrees: Double?
    let isLive: Bool
    let sampleTimestampMs: Int
}

struct TraceDefinition: Decodable {
    let name: String
    let events: [TraceEvent]
    let checkpointsMs: [Int]
}

struct FramePayload: Encodable {
    let speedMps: Double
    let normalizedSpeed: Double
    let peakDirectionDegrees: Double
    let angularVelocityDegreesPerSecond: Double
    let movementDirection: Int
    let needsAnimation: Bool
    let rayActivity: [Double]
}

struct CheckpointPayload: Encodable {
    let trace: String
    let checkpointMs: Int
    let frame: FramePayload
}

let traceURL = URL(fileURLWithPath: CommandLine.arguments[1])
let definitions = try JSONDecoder().decode(
    [TraceDefinition].self,
    from: Data(contentsOf: traceURL)
)
var results: [CheckpointPayload] = []

for definition in definitions {
    let model = ULSAWindRoseMotionModel()
    let eventsByTime = Dictionary(grouping: definition.events, by: \\.atMs)
    let checkpoints = Set(definition.checkpointsMs)
    let timeline = Set(definition.events.map(\\.atMs) + definition.checkpointsMs).sorted()

    for timeMs in timeline {
        for event in eventsByTime[timeMs] ?? [] {
            model.setTarget(
                speedMps: event.speedMps,
                directionDegrees: event.directionDegrees,
                isLive: event.isLive,
                now: Double(event.atMs) / 1000.0,
                sampleTimestamp: Double(event.sampleTimestampMs) / 1000.0
            )
        }
        if checkpoints.contains(timeMs) {
            let frame = model.advance(now: Double(timeMs) / 1000.0)
            results.append(CheckpointPayload(
                trace: definition.name,
                checkpointMs: timeMs,
                frame: FramePayload(
                    speedMps: frame.speedMps,
                    normalizedSpeed: frame.normalizedSpeed,
                    peakDirectionDegrees: frame.peakDirectionDegrees,
                    angularVelocityDegreesPerSecond: frame.angularVelocityDegreesPerSecond,
                    movementDirection: frame.movementDirection,
                    needsAnimation: frame.needsAnimation,
                    rayActivity: frame.rayActivity
                )
            ))
        }
    }
}

let encoder = JSONEncoder()
encoder.outputFormatting = [.sortedKeys]
let data = try encoder.encode(results)
print(String(data: data, encoding: .utf8)!)
`;

const compareNumber = (name, first, second, tolerance = 1e-7) => {
  if (!Number.isFinite(first) || !Number.isFinite(second)) {
    throw new Error(`${name} is non-finite: TypeScript (${first}), Swift (${second})`);
  }
  if (Math.abs(first - second) > tolerance) {
    throw new Error(`${name} differs between TypeScript (${first}) and Swift (${second})`);
  }
};

const replayTypeScriptTrace = (WindRoseMotionModel, definition) => {
  const model = new WindRoseMotionModel();
  const eventsByTime = new Map();
  definition.events.forEach((event) => {
    const events = eventsByTime.get(event.atMs) ?? [];
    events.push(event);
    eventsByTime.set(event.atMs, events);
  });
  const checkpoints = new Set(definition.checkpointsMs);
  const timeline = [...new Set([
    ...definition.events.map(({ atMs }) => atMs),
    ...definition.checkpointsMs,
  ])].sort((first, second) => first - second);
  const results = [];

  timeline.forEach((timeMs) => {
    (eventsByTime.get(timeMs) ?? []).forEach((event) => {
      model.setTarget(
        event.speedMps,
        event.directionDegrees ?? 0,
        event.isLive,
        event.atMs,
        event.sampleTimestampMs,
      );
    });
    if (checkpoints.has(timeMs)) {
      const frame = model.advance(timeMs);
      results.push({ trace: definition.name, checkpointMs: timeMs, frame });
    }
  });
  return results;
};

const compareCheckpoint = (typescriptResult, swiftResult) => {
  const prefix = `${typescriptResult.trace}@${typescriptResult.checkpointMs}ms`;
  if (typescriptResult.trace !== swiftResult?.trace
      || typescriptResult.checkpointMs !== swiftResult?.checkpointMs) {
    throw new Error(`${prefix} has no matching Swift checkpoint`);
  }
  const typescriptFrame = typescriptResult.frame;
  const swiftFrame = swiftResult.frame;
  compareNumber(`${prefix}.speedMps`, typescriptFrame.speedMps, swiftFrame.speedMps);
  compareNumber(
    `${prefix}.normalizedSpeed`,
    typescriptFrame.normalizedSpeed,
    swiftFrame.normalizedSpeed,
  );
  compareNumber(
    `${prefix}.peakDirectionDegrees`,
    typescriptFrame.peakDirectionDegrees,
    swiftFrame.peakDirectionDegrees,
  );
  compareNumber(
    `${prefix}.angularVelocityDegreesPerSecond`,
    typescriptFrame.angularVelocityDegreesPerSecond,
    swiftFrame.angularVelocityDegreesPerSecond,
  );
  if (typescriptFrame.movementDirection !== swiftFrame.movementDirection) {
    throw new Error(`${prefix}.movementDirection differs between TypeScript and Swift`);
  }
  if (typescriptFrame.needsAnimation !== swiftFrame.needsAnimation) {
    throw new Error(`${prefix}.needsAnimation differs between TypeScript and Swift`);
  }
  if (typescriptFrame.rayActivity.length !== 120 || swiftFrame.rayActivity.length !== 120) {
    throw new Error(`${prefix}.rayActivity must contain all 120 discrete rays`);
  }
  typescriptFrame.rayActivity.forEach((activity, index) => {
    compareNumber(`${prefix}.rayActivity[${index}]`, activity, swiftFrame.rayActivity[index], 1e-6);
  });
};

let vite;
try {
  verifySharedMotionConstants();
  verifySharedLuminousConstants();
  const mainPath = path.join(temporaryDirectory, 'main.swift');
  const tracePath = path.join(temporaryDirectory, 'traces.json');
  const executablePath = path.join(temporaryDirectory, 'wind-rose-parity');
  writeFileSync(mainPath, runnerSource);
  writeFileSync(tracePath, JSON.stringify(traceDefinitions));
  execFileSync('xcrun', [
    'swiftc',
    '-module-cache-path', path.join(temporaryDirectory, 'module-cache'),
    swiftMotionPath,
    mainPath,
    '-o', executablePath,
  ], { stdio: 'pipe' });
  const swiftResults = JSON.parse(execFileSync(executablePath, [tracePath], { encoding: 'utf8' }));

  vite = await createServer({ root, logLevel: 'silent', server: { middlewareMode: true } });
  const { WindRoseMotionModel } = await vite.ssrLoadModule(
    '/src/components/charts/windRoseMotionModel.ts',
  );
  const typescriptResults = traceDefinitions.flatMap((definition) =>
    replayTypeScriptTrace(WindRoseMotionModel, definition));

  if (typescriptResults.length !== swiftResults.length) {
    throw new Error(
      `Checkpoint count differs: TypeScript (${typescriptResults.length}), Swift (${swiftResults.length})`,
    );
  }
  typescriptResults.forEach((result, index) => compareCheckpoint(result, swiftResults[index]));

  const swiftTheme = readFileSync(swiftThemePath, 'utf8');
  const expectedAnchors = [
    '#00E6C7', '#00D9FF', '#6E8BFF', '#D96CFF', '#FF3B30',
  ];
  expectedAnchors.forEach((color) => {
    if (!swiftTheme.includes(color)) throw new Error(`Swift theme is missing ${color}`);
  });
  process.stdout.write(
    `Wind rose TypeScript/Swift parity: ${traceDefinitions.length} traces, `
      + `${typescriptResults.length} checkpoints, 120 rays each, `
      + `${sharedMotionConstants.length} motion constants, `
      + `${sharedLuminousConstants.length} luminous constants and palette anchors OK\n`,
  );
} finally {
  await vite?.close();
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
