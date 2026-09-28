import Foundation

struct ULSAWindRoseMotionFrame {
    let speedMps: Double
    let normalizedSpeed: Double
    let peakDirectionDegrees: Double
    let angularVelocityDegreesPerSecond: Double
    let movementDirection: Int
    let rayActivity: [Double]
    let needsAnimation: Bool
}

private struct ULSAWindRoseMeasurement {
    let timestamp: TimeInterval
    let speedMps: Double
    let unitX: Double
    let unitY: Double
}

/// Critically damped wind-vector response plus a passive 120-ray wake field.
/// The arithmetic order mirrors the TypeScript model used by the Canvas gauge.
final class ULSAWindRoseMotionModel {
    static let barStepDegrees = 3.0
    static let barCount = 120

    private let fixedStepSeconds = 1.0 / 120.0
    private let maxElapsedSeconds = 0.5
    private let speedRiseNaturalFrequency = 30.0
    private let speedFallNaturalFrequency = 18.0
    private let vectorLowConfidenceNaturalFrequency = 16.0
    private let vectorHighConfidenceNaturalFrequency = 30.0
    private let confidenceLowSpeedMps = 0.035
    private let confidenceHighSpeedMps = 0.18
    private let calmTargetPrefilterSeconds = 0.45
    private let minimumDirectionMagnitudeMps = 0.015
    private let directionReacquireCoherence = 0.12
    private let angularVelocitySmoothingSeconds = 0.06
    private let movementStartDegreesPerSecond = 6.0
    private let movementStopDegreesPerSecond = 2.0
    private let variabilityWindowSeconds = 0.60
    private let historyCutoffToleranceSeconds = 0.000_000_001
    private let fieldAdvectionFactor = 0.20
    private let fieldBaseDiffusionDegreesSquaredPerSecond = 55.0
    private let fieldVariableDiffusionDegreesSquaredPerSecond = 35.0
    private let fieldLowSpeedTauSeconds = 0.30
    private let fieldHighSpeedTauSeconds = 0.52
    private let fieldVariabilityTauSeconds = 0.06
    private let fieldMaximumTauSeconds = 0.58
    private let fieldLeadingTauSeconds = 0.14
    private let fieldLowSpeedMps = 0.15
    private let fieldHighSpeedMps = 0.50
    private let fieldSourceBaseSigmaDegrees = 4.2
    private let fieldSourceVariableSigmaDegrees = 5.4
    private let fieldSourceMaximumRatio = 0.84
    private let fieldSourceBuildSeconds = 0.055
    private let fieldForwardSourceMaximumSuppression = 0.80
    private let fullMotionDegreesPerSecond = 90.0
    private let coreCoherenceFloor = 0.32

    private var targetSpeed = 0.0
    private var targetVectorX = 0.0
    private var targetVectorY = 0.0
    private var hasLiveData = false
    private var initialized = false
    private var lastAdvanceAt: TimeInterval?
    private var accumulatorSeconds = 0.0
    private var lastSampleTimestamp: TimeInterval?

    private var filteredVectorX = 0.0
    private var filteredVectorY = 0.0
    private var filteredVectorVelocityX = 0.0
    private var filteredVectorVelocityY = 0.0
    private var filteredSpeed = 0.0
    private var filteredSpeedVelocity = 0.0
    private var filteredDirection = 0.0
    private var angularVelocity = 0.0
    private var movementDirection = 0
    private var directionSuppressed = false
    private var variability = 0.0
    private var measurements: [ULSAWindRoseMeasurement] = []

    private var field = Array(repeating: 0.0, count: ULSAWindRoseMotionModel.barCount)
    private var advectedField = Array(repeating: 0.0, count: ULSAWindRoseMotionModel.barCount)
    private var nextField = Array(repeating: 0.0, count: ULSAWindRoseMotionModel.barCount)
    private var finalActivity = Array(repeating: 0.0, count: ULSAWindRoseMotionModel.barCount)
    private var lastFieldDelta = 0.0

    func setTarget(
        speedMps: Double?,
        directionDegrees: Double?,
        isLive: Bool,
        now: TimeInterval,
        sampleTimestamp: TimeInterval
    ) {
        guard isLive, let speedMps, let directionDegrees,
              speedMps.isFinite, directionDegrees.isFinite,
              sampleTimestamp.isFinite else {
            reset()
            initialized = false
            targetSpeed = 0
            targetVectorX = 0
            targetVectorY = 0
            hasLiveData = false
            lastAdvanceAt = now
            return
        }

        let nextSpeed = max(0, speedMps)
        let normalizedDirection = Self.normalizeDegrees(directionDegrees)
        let radians = normalizedDirection * Double.pi / 180
        let rawUnitX = sin(radians)
        let rawUnitY = cos(radians)
        let rawVectorX = rawUnitX * nextSpeed
        let rawVectorY = rawUnitY * nextSpeed

        if !initialized {
            reset(initialDirection: normalizedDirection)
            initialized = true
            lastAdvanceAt = now
            targetVectorX = rawVectorX
            targetVectorY = rawVectorY
        } else {
            advanceState(to: now)
            if let lastSampleTimestamp, sampleTimestamp <= lastSampleTimestamp { return }
            let sampleDelta = lastSampleTimestamp == nil
                ? 0
                : Self.clamp(sampleTimestamp - (lastSampleTimestamp ?? sampleTimestamp),
                             minimum: 0, maximum: 0.25)
            let confidence = directionConfidence(nextSpeed)
            let calmAlpha = sampleDelta <= 0
                ? 1
                : 1 - exp(-sampleDelta / calmTargetPrefilterSeconds)
            let targetAlpha = confidence + (1 - confidence) * calmAlpha
            targetVectorX += (rawVectorX - targetVectorX) * targetAlpha
            targetVectorY += (rawVectorY - targetVectorY) * targetAlpha
        }

        targetSpeed = nextSpeed
        hasLiveData = true
        lastSampleTimestamp = sampleTimestamp
        recordMeasurement(ULSAWindRoseMeasurement(
            timestamp: sampleTimestamp,
            speedMps: nextSpeed,
            unitX: rawUnitX,
            unitY: rawUnitY
        ))
    }

    func advance(now: TimeInterval) -> ULSAWindRoseMotionFrame {
        guard hasLiveData else { return Self.emptyFrame() }
        advanceState(to: now)
        composeFinalActivity()

        let maximumActivity = finalActivity.max() ?? 0
        let vectorError = hypot(targetVectorX - filteredVectorX, targetVectorY - filteredVectorY)
        let velocityEnergy = hypot(filteredVectorVelocityX, filteredVectorVelocityY)
        return ULSAWindRoseMotionFrame(
            speedMps: filteredSpeed,
            normalizedSpeed: Self.normalizeSpeed(filteredSpeed),
            peakDirectionDegrees: Self.normalizeDegrees(filteredDirection),
            angularVelocityDegreesPerSecond: angularVelocity,
            movementDirection: movementDirection,
            rayActivity: finalActivity,
            needsAnimation: abs(targetSpeed - filteredSpeed) >= 0.0015
                || abs(filteredSpeedVelocity) >= 0.004
                || vectorError >= 0.0015
                || velocityEnergy >= 0.004
                || abs(angularVelocity) >= 0.08
                || (maximumActivity > 0 && lastFieldDelta >= 0.000_08)
        )
    }

    func reset(initialDirection: Double = 0) {
        targetSpeed = 0
        targetVectorX = 0
        targetVectorY = 0
        hasLiveData = false
        initialized = false
        lastAdvanceAt = nil
        accumulatorSeconds = 0
        lastSampleTimestamp = nil
        targetVectorX = 0
        targetVectorY = 0
        filteredVectorX = 0
        filteredVectorY = 0
        filteredVectorVelocityX = 0
        filteredVectorVelocityY = 0
        filteredSpeed = 0
        filteredSpeedVelocity = 0
        filteredDirection = Self.normalizeDegrees(initialDirection)
        angularVelocity = 0
        movementDirection = 0
        directionSuppressed = false
        variability = 0
        measurements.removeAll(keepingCapacity: true)
        field = Array(repeating: 0, count: Self.barCount)
        advectedField = Array(repeating: 0, count: Self.barCount)
        nextField = Array(repeating: 0, count: Self.barCount)
        finalActivity = Array(repeating: 0, count: Self.barCount)
        lastFieldDelta = 0
    }

    private func advanceState(to now: TimeInterval) {
        guard let lastAdvanceAt else {
            self.lastAdvanceAt = now
            return
        }
        let rawElapsed = max(0, now - lastAdvanceAt)
        self.lastAdvanceAt = now
        accumulatorSeconds += min(rawElapsed, maxElapsedSeconds)
        while accumulatorSeconds >= fixedStepSeconds {
            step(deltaSeconds: fixedStepSeconds)
            accumulatorSeconds -= fixedStepSeconds
        }
    }

    private func step(deltaSeconds: Double) {
        let confidence = directionConfidence(targetSpeed)
        let vectorNaturalFrequency = vectorLowConfidenceNaturalFrequency
            + (vectorHighConfidenceNaturalFrequency - vectorLowConfidenceNaturalFrequency)
                * confidence
        (filteredVectorX, filteredVectorVelocityX) = Self.criticalDampedStep(
            position: filteredVectorX,
            velocity: filteredVectorVelocityX,
            target: targetVectorX,
            naturalFrequency: vectorNaturalFrequency,
            deltaSeconds: deltaSeconds
        )
        (filteredVectorY, filteredVectorVelocityY) = Self.criticalDampedStep(
            position: filteredVectorY,
            velocity: filteredVectorVelocityY,
            target: targetVectorY,
            naturalFrequency: vectorNaturalFrequency,
            deltaSeconds: deltaSeconds
        )
        let speedNaturalFrequency = targetSpeed >= filteredSpeed
            ? speedRiseNaturalFrequency : speedFallNaturalFrequency
        (filteredSpeed, filteredSpeedVelocity) = Self.criticalDampedStep(
            position: filteredSpeed,
            velocity: filteredSpeedVelocity,
            target: targetSpeed,
            naturalFrequency: speedNaturalFrequency,
            deltaSeconds: deltaSeconds
        )
        filteredSpeed = max(0, filteredSpeed)

        updateDirection(deltaSeconds: deltaSeconds)
        updateWakeField(deltaSeconds: deltaSeconds)
    }

    private func updateDirection(deltaSeconds: Double) {
        let vectorMagnitude = hypot(filteredVectorX, filteredVectorY)
        let coherence = Self.clamp(vectorMagnitude / (filteredSpeed + 0.001))
        if vectorMagnitude < minimumDirectionMagnitudeMps
            || coherence < directionReacquireCoherence {
            directionSuppressed = true
            angularVelocity *= exp(-deltaSeconds / angularVelocitySmoothingSeconds)
            updateMovementDirection()
            return
        }

        let candidateDirection = Self.normalizeDegrees(
            atan2(filteredVectorX, filteredVectorY) * 180 / Double.pi
        )
        let directionDelta = Self.shortestSignedAngularDistance(
            from: filteredDirection,
            to: candidateDirection
        )
        var instantaneousVelocity = 0.0
        if directionSuppressed && abs(directionDelta) > 120 {
            filteredDirection += directionDelta
        } else {
            let reliability = directionConfidence(filteredSpeed) * coherence
            let directionRate = 5 + 25 * reliability
            let alpha = 1 - exp(-directionRate * deltaSeconds)
            let appliedDelta = directionDelta * alpha
            filteredDirection += appliedDelta
            instantaneousVelocity = appliedDelta / deltaSeconds
        }
        directionSuppressed = false
        let velocityAlpha = 1 - exp(-deltaSeconds / angularVelocitySmoothingSeconds)
        angularVelocity += (instantaneousVelocity - angularVelocity) * velocityAlpha
        updateMovementDirection()
    }

    private func updateMovementDirection() {
        if movementDirection == 0 {
            if angularVelocity > movementStartDegreesPerSecond { movementDirection = 1 }
            if angularVelocity < -movementStartDegreesPerSecond { movementDirection = -1 }
        } else if abs(angularVelocity) < movementStopDegreesPerSecond {
            movementDirection = 0
        } else if angularVelocity * Double(movementDirection) < -movementStartDegreesPerSecond {
            movementDirection = angularVelocity > 0 ? 1 : -1
        }
    }

    private func updateWakeField(deltaSeconds: Double) {
        let advectionBins = angularVelocity * fieldAdvectionFactor
            * deltaSeconds / Self.barStepDegrees
        for index in 0..<Self.barCount {
            advectedField[index] = Self.sampleCircular(field, at: Double(index) - advectionBins)
        }

        let diffusion = fieldBaseDiffusionDegreesSquaredPerSecond
            + fieldVariableDiffusionDegreesSquaredPerSecond * variability
        let diffusionCoefficient = diffusion * deltaSeconds
            / (Self.barStepDegrees * Self.barStepDegrees)
        let speedRatio = Self.smoothstep(
            (filteredSpeed - fieldLowSpeedMps) / (fieldHighSpeedMps - fieldLowSpeedMps)
        )
        let normalTau = min(
            fieldMaximumTauSeconds,
            fieldLowSpeedTauSeconds
                + (fieldHighSpeedTauSeconds - fieldLowSpeedTauSeconds) * speedRatio
                + fieldVariabilityTauSeconds * variability
        )
        let motionStrength = Self.smoothstep(
            (abs(angularVelocity) - movementStartDegreesPerSecond)
                / (fullMotionDegreesPerSecond - movementStartDegreesPerSecond)
        )
        let flowDirection = angularVelocity >= 0 ? 1.0 : -1.0
        let sourceSigma = fieldSourceBaseSigmaDegrees
            + fieldSourceVariableSigmaDegrees * variability
        let sourcePeak = Self.normalizeSpeed(filteredSpeed) * fieldSourceMaximumRatio
        let sourceAlpha = 1 - exp(-deltaSeconds / fieldSourceBuildSeconds)
        var maximumDelta = 0.0

        for index in 0..<Self.barCount {
            let previous = advectedField[index]
            let left = advectedField[(index - 1 + Self.barCount) % Self.barCount]
            let right = advectedField[(index + 1) % Self.barCount]
            var value = max(0, previous + diffusionCoefficient * (left - 2 * previous + right))
            let binAngle = Double(index) * Self.barStepDegrees
            let signedDistance = Self.shortestSignedAngularDistance(
                from: filteredDirection,
                to: binAngle
            )
            let isForward = motionStrength > 0 && signedDistance * flowDirection > 0
            let tau = isForward
                ? normalTau * (1 - motionStrength) + fieldLeadingTauSeconds * motionStrength
                : normalTau
            value *= exp(-deltaSeconds / tau)

            var sourceTarget = sourcePeak * exp(-0.5 * pow(signedDistance / sourceSigma, 2))
            if isForward {
                sourceTarget *= 1 - fieldForwardSourceMaximumSuppression * motionStrength
            }
            if sourceTarget > value {
                value += (sourceTarget - value) * sourceAlpha
            }
            value = Self.clamp(value)
            nextField[index] = value
            maximumDelta = max(maximumDelta, abs(value - field[index]))
        }
        swap(&field, &nextField)
        lastFieldDelta = maximumDelta
    }

    private func composeFinalActivity() {
        finalActivity = Array(repeating: 0, count: Self.barCount)
        let normalizedSpeed = Self.normalizeSpeed(filteredSpeed)
        let vectorMagnitude = hypot(filteredVectorX, filteredVectorY)
        let coherence = Self.clamp(vectorMagnitude / (filteredSpeed + 0.001))
        let coreAmplitude = normalizedSpeed
            * (coreCoherenceFloor + (1 - coreCoherenceFloor) * coherence)
        let fractionalIndex = Self.normalizeDegrees(filteredDirection) / Self.barStepDegrees
        let lowerFloor = floor(fractionalIndex)
        let lowerIndex = Int(lowerFloor) % Self.barCount
        let upperIndex = (lowerIndex + 1) % Self.barCount
        let blend = Self.smoothstep(fractionalIndex - lowerFloor)
        var lowerWeight = 1 - blend
        var upperWeight = blend
        let strongestWeight = max(lowerWeight, upperWeight, Double.leastNonzeroMagnitude)
        lowerWeight /= strongestWeight
        upperWeight /= strongestWeight

        for index in 0..<Self.barCount {
            var core = 0.0
            if index == lowerIndex { core = coreAmplitude * lowerWeight }
            if index == upperIndex { core = max(core, coreAmplitude * upperWeight) }
            finalActivity[index] = max(field[index], core)
        }
    }

    private func recordMeasurement(_ measurement: ULSAWindRoseMeasurement) {
        measurements.append(measurement)
        let cutoff = measurement.timestamp - variabilityWindowSeconds
        // JS keeps a sample exactly on the integer-millisecond cutoff. Account
        // for the binary fraction introduced by converting capturedAtMs to
        // seconds so Swift makes the same inclusive-boundary decision.
        while let first = measurements.first,
              first.timestamp + historyCutoffToleranceSeconds < cutoff {
            measurements.removeFirst()
        }
        guard measurements.count >= 2 else {
            variability = 0
            return
        }

        var weightedX = 0.0
        var weightedY = 0.0
        var totalWeight = 0.0
        var speedSum = 0.0
        for entry in measurements {
            let weight = max(entry.speedMps, 0.001)
            weightedX += entry.unitX * weight
            weightedY += entry.unitY * weight
            totalWeight += weight
            speedSum += entry.speedMps
        }
        let meanSpeed = speedSum / Double(measurements.count)
        var speedVariance = 0.0
        for entry in measurements {
            speedVariance += pow(entry.speedMps - meanSpeed, 2)
        }
        speedVariance /= Double(measurements.count)
        let concentration = totalWeight <= Double.leastNonzeroMagnitude
            ? 1
            : Self.clamp(hypot(weightedX, weightedY) / totalWeight)
        let circularVariability = Self.clamp((1 - concentration) * 4)
        let coefficientOfVariation = sqrt(speedVariance) / max(meanSpeed, 0.001)
        let speedVariability = Self.clamp(coefficientOfVariation / 0.65)
        variability = directionConfidence(meanSpeed)
            * (0.8 * circularVariability + 0.2 * speedVariability)
    }

    private func directionConfidence(_ speedMps: Double) -> Double {
        Self.smoothstep(
            (speedMps - confidenceLowSpeedMps)
                / (confidenceHighSpeedMps - confidenceLowSpeedMps)
        )
    }

    static func normalizeSpeed(_ speed: Double) -> Double {
        guard speed > 0 else { return 0 }
        return min(1, log1p(speed / 0.02) / log1p(25 / 0.02))
    }

    static func normalizeDegrees(_ value: Double) -> Double {
        let normalized = value.truncatingRemainder(dividingBy: 360)
        return normalized < 0 ? normalized + 360 : normalized
    }

    static func shortestSignedAngularDistance(from: Double, to: Double) -> Double {
        var difference = normalizeDegrees(to) - normalizeDegrees(from)
        if difference > 180 { difference -= 360 }
        if difference < -180 { difference += 360 }
        return difference == -180 ? 180 : difference
    }

    private static func criticalDampedStep(
        position: Double,
        velocity: Double,
        target: Double,
        naturalFrequency: Double,
        deltaSeconds: Double
    ) -> (Double, Double) {
        let error = position - target
        let helper = velocity + naturalFrequency * error
        let decay = exp(-naturalFrequency * deltaSeconds)
        return (
            target + (error + helper * deltaSeconds) * decay,
            (velocity - naturalFrequency * helper * deltaSeconds) * decay
        )
    }

    private static func sampleCircular(_ values: [Double], at position: Double) -> Double {
        let count = Double(values.count)
        let remainder = position.truncatingRemainder(dividingBy: count)
        // Apply modulo a second time after adding the period. A tiny negative
        // remainder can otherwise round to exactly `count`, producing an
        // out-of-range lower index at the 0/360-degree boundary.
        let wrapped = (remainder + count).truncatingRemainder(dividingBy: count)
        let lower = Int(floor(wrapped))
        let upper = (lower + 1) % values.count
        let fraction = wrapped - Double(lower)
        return values[lower] * (1 - fraction) + values[upper] * fraction
    }

    private static func smoothstep(_ value: Double) -> Double {
        let clamped = clamp(value)
        return clamped * clamped * (3 - 2 * clamped)
    }

    private static func clamp(_ value: Double, minimum: Double = 0, maximum: Double = 1) -> Double {
        min(max(value, minimum), maximum)
    }

    private static func emptyFrame() -> ULSAWindRoseMotionFrame {
        ULSAWindRoseMotionFrame(
            speedMps: 0,
            normalizedSpeed: 0,
            peakDirectionDegrees: 0,
            angularVelocityDegreesPerSecond: 0,
            movementDirection: 0,
            rayActivity: Array(repeating: 0, count: barCount),
            needsAnimation: false
        )
    }
}
