import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pluginSource = readFileSync('ios/App/App/ULSAWindPiPPlugin.swift', 'utf8');
const rendererSource = readFileSync('ios/App/App/ULSAWindPiPRenderer.swift', 'utf8');
const infoPlist = readFileSync('ios/App/App/Info.plist', 'utf8');

describe('native Wind PiP background lifecycle', () => {
  it('bounds PiP start and releases the audio session on every terminal path', () => {
    expect(pluginSource).toContain('private var audioSessionActive = false');
    expect(pluginSource).toContain('private let startLifecycleTimeout: TimeInterval = 5');
    expect(pluginSource).toContain('scheduleStartLifecycleWatchdog(controller)');
    expect(pluginSource).toContain('guard phase == "starting" else {');
    expect(pluginSource).toContain('PIP_START_CANCELLED');
    expect(pluginSource).toContain('self.phase == "starting"');
    expect(pluginSource).toContain('private var startAttemptExpired = false');
    expect(pluginSource).toContain('guard !startAttemptExpired else {');
    expect(pluginSource).toContain('pictureInPictureController.stopPictureInPicture()');
    expect(pluginSource).toContain('cancelStartLifecycleWatchdog()');
    expect(pluginSource).toContain('deactivateAudioSession()');
    expect(pluginSource).toContain('.notifyOthersOnDeactivation');
  });

  it('uses the Audio/PiP capability without silent playback engines', () => {
    expect(pluginSource).toContain('setCategory(.playback, mode: .moviePlayback, options: [.mixWithOthers])');
    expect(pluginSource).toContain('pictureInPictureControllerShouldProhibitBackgroundAudioPlayback');
    expect(pluginSource).not.toMatch(/\bAVAudioPlayer\s*\(/);
    expect(pluginSource).not.toMatch(/\bAVAudioEngine\s*\(/);
    expect(pluginSource).not.toMatch(/\bAVPlayer\s*\(/);
  });

  it('declares only the reviewed audio and central BLE background modes', () => {
    const backgroundModes = infoPlist.match(
      /<key>UIBackgroundModes<\/key>\s*<array>([\s\S]*?)<\/array>/,
    )?.[1] ?? '';
    expect(backgroundModes).toContain('<string>audio</string>');
    expect(backgroundModes).toContain('<string>bluetooth-central</string>');
    expect(backgroundModes.match(/<string>/g)).toHaveLength(2);
  });

  it('keeps direction and speed inside the gauge and the requested four metrics in the left column', () => {
    expect(rendererSource).toContain('drawGaugeCenterMetrics(');
    expect(rendererSource).toContain('let direction = live ? "\\(Int(frame.peakDirectionDegrees.rounded()))°" : "--"');
    expect(rendererSource).toContain('let speed = live ? formatSpeed(frame.speedMps, unit: snapshot.windSpeedUnit) : "--"');
    for (const label of ['音速', '音仮温度', '正面風速成分', '10分平均風速']) {
      expect(rendererSource).toContain(`label: "${label}"`);
    }
    expect(rendererSource).toContain('font: .monospacedDigitSystemFont(ofSize: 50, weight: .bold)');
    expect(rendererSource).toContain('font: .systemFont(ofSize: 30, weight: .bold)');
    expect(rendererSource).toContain('font: .systemFont(ofSize: 21, weight: .semibold)');
    expect(rendererSource).toContain('font: .systemFont(ofSize: 23, weight: .semibold)');
    expect(rendererSource).toContain('font: .monospacedDigitSystemFont(ofSize: 35, weight: .bold)');
    expect(rendererSource).toContain('font: .systemFont(ofSize: status.text == "LIVE" ? 39 : 22, weight: .bold)');
    expect(rendererSource).toContain('let font = UIFont.systemFont(ofSize: state == .error && detail != nil ? 18 : 23, weight: .bold)');
    const logBadgeSource = rendererSource.split('private func drawLogBadge(', 2)[1]
      .split('private func semanticColors(', 1)[0];
    expect(logBadgeSource).not.toContain('fillEllipse');
    expect(rendererSource).toContain('x: CGFloat(Self.width) - Self.overlayStatusRightPadding - Self.overlayStatusWidth');
    expect(rendererSource).toContain('private static let overlayStatusRightPadding: CGFloat = 35');
    expect(rendererSource).toContain('alignment: .center');
    expect(rendererSource).toContain('private static let overlaySidePadding: CGFloat = 28');
    expect(rendererSource).toContain('private static let overlayLogBadgeWidth: CGFloat = 150');
    expect(pluginSource).toContain('call.getDouble("headingSpeedMps")');
    expect(pluginSource).toContain('call.getDouble("windSpeedAverage10mMps")');
  });
});
