import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('ios/App/App/ULSAEvoBridgeViewController.swift', 'utf8');

describe('native device-motion energy lifecycle', () => {
  it('runs raw motion only for an active iPhone and stops it when the app resigns active', () => {
    expect(source).toContain('UIApplication.willResignActiveNotification');
    expect(source).toContain('UIApplication.didBecomeActiveNotification');
    expect(source).toMatch(
      /private func startPhysicalOrientationPublisher\(\)[\s\S]*?guard shouldUseManualUpsideDownTransform,[\s\S]*?UIApplication\.shared\.applicationState == \.active,[\s\S]*?!motionManager\.isDeviceMotionActive/,
    );
    expect(source).toMatch(
      /@objc private func applicationWillResignActive\(\)[\s\S]*?stopPhysicalOrientationPublisher\(\)/,
    );
    expect(source).toMatch(
      /@objc private func applicationDidBecomeActive\(\)[\s\S]*?startPhysicalOrientationPublisher\(\)/,
    );
  });

  it('has one idempotent stop path shared by lifecycle and deinit', () => {
    expect(source).toMatch(
      /private func stopPhysicalOrientationPublisher\(\)[\s\S]*?guard motionManager\.isDeviceMotionActive[\s\S]*?motionManager\.stopDeviceMotionUpdates\(\)/,
    );
    expect(source).toMatch(/deinit[\s\S]*?stopPhysicalOrientationPublisher\(\)/);
  });
});
