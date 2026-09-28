import { describe, expect, it } from 'vitest';
import { BLEParseError, parseCurrentTimeData, parseCardLogDetailStatus, parseCardStatus, parseSensorStatus, parseSoundSpeed, parseWindDirection, parseWindSpeed, } from './bleDataParser';
const viewFromBytes = (...bytes: number[]) => new DataView(Uint8Array.from(bytes).buffer);
describe('bleDataParser', () => {
    it('reads durable SD counters and never invents absent notification counters', () => {
        const bytes = new Uint8Array(36);
        const value = new DataView(bytes.buffer);
        value.setUint8(0, 2);
        value.setUint8(5, 7);
        value.setUint32(6, 1000, true);
        value.setUint32(20, 980, true);
        value.setUint32(24, 12, true);
        value.setUint32(28, 8, true);
        value.setUint16(32, 5, true);
        expect(parseCardLogDetailStatus(value)).toMatchObject({
            recordingRequested: true, inputPaused: true, recovering: true,
            logCount: 1000, syncedLogCount: 980, droppedLogCount: 12,
            uncertainLogCount: 8, queueDepth: 5,
        });
        expect(parseCardLogDetailStatus(new DataView(bytes.buffer, 0, 20))).toMatchObject({
            inputPaused: true, syncedLogCount: null, droppedLogCount: null,
            uncertainLogCount: null, queueDepth: null,
        });
    });
    it('throws typed errors for invalid ranges', () => {
        expect(() => parseWindDirection(viewFromBytes(0xff, 0xff))).toThrow(BLEParseError);
        expect(() => parseWindSpeed(viewFromBytes(0xff, 0xff))).toThrow(BLEParseError);
        expect(() => parseSoundSpeed(viewFromBytes(0x10, 0x27))).toThrow(BLEParseError);
        expect(() => parseCardStatus(viewFromBytes(3, 101, 0, 1, 0, 2))).toThrow(BLEParseError);
        expect(() => parseCardStatus(viewFromBytes(3, 50, 0, 3, 0, 2))).toThrow(BLEParseError);
        expect(() => parseSensorStatus(viewFromBytes(1, 1, 2, 0x80, 0, 0, 0))).toThrow(BLEParseError);
        expect(() => parseSensorStatus(viewFromBytes(1, 1, 2, 0xc0, 0, 3, 0))).toThrow(BLEParseError);
        expect(() => parseSensorStatus(viewFromBytes(1, 1, 2, 0xc0, 0, 2, 0))).toThrow(BLEParseError);
        expect(() => parseSensorStatus(viewFromBytes(1, 1, 3, 0xc0, 0, 3, 0))).toThrow(BLEParseError);
    });
    it('parses Current Time Service payloads without using them for app sync writes', () => {
        expect(parseCurrentTimeData(viewFromBytes(0xea, 0x07, 7, 3, 12, 34, 56, 5, 0, 0))).toEqual(new Date(2026, 6, 3, 12, 34, 56, 0));
    });
    it('rejects invalid Current Time Service payloads', () => {
        expect(() => parseCurrentTimeData(viewFromBytes(0xea, 0x07, 2, 30, 12, 0, 0, 1, 0, 0))).toThrow(BLEParseError);
        expect(() => parseCurrentTimeData(viewFromBytes(0xea, 0x07, 7, 3, 12, 34, 56, 5, 0))).toThrow(BLEParseError);
    });
});
