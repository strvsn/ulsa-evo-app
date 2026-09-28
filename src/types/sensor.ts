import type { NumericRingBuffer, RingBuffer } from '../utils/RingBuffer';
import type { ReferenceWindSpeedWindow } from '../utils/derivedWindMetrics';
import type { SensorDisplayUpdate } from '../hooks/ble/types';
export interface SensorValues {
    windSpeed: number | null;
    windSpeedAverage10m: number | null;
    windDirection: number | null;
    windDirectionContinuous: number;
    headingSpeed: number | null;
    temperature: number | null;
    soundSpeed: number | null;
}
export interface SensorSetters {
    setWindSpeed: React.Dispatch<React.SetStateAction<number>>;
    setWindDirection: React.Dispatch<React.SetStateAction<number>>;
    setWindDirectionContinuous: React.Dispatch<React.SetStateAction<number>>;
    setTemperature: React.Dispatch<React.SetStateAction<number>>;
    setSoundSpeed: React.Dispatch<React.SetStateAction<number>>;
}
export interface SensorBufferRefs {
    referenceWindSpeedWindowRef?: React.MutableRefObject<ReferenceWindSpeedWindow>;
    windSpeedBufferRef: React.MutableRefObject<NumericRingBuffer>;
    windSpeedABufferRef: React.MutableRefObject<NumericRingBuffer>;
    windSpeedBBufferRef: React.MutableRefObject<NumericRingBuffer>;
    windDirectionBufferRef: React.MutableRefObject<NumericRingBuffer>;
    temperatureBufferRef: React.MutableRefObject<NumericRingBuffer>;
    soundSpeedBufferRef: React.MutableRefObject<NumericRingBuffer>;
    timestampBufferRef: React.MutableRefObject<RingBuffer<string>>;
    timestampMsBufferRef: React.MutableRefObject<RingBuffer<number>>;
}
export interface SensorBuffers {
    windSpeedBuffer: NumericRingBuffer;
    windSpeedABuffer: NumericRingBuffer;
    windSpeedBBuffer: NumericRingBuffer;
    windDirectionBuffer: NumericRingBuffer;
    temperatureBuffer: NumericRingBuffer;
    soundSpeedBuffer: NumericRingBuffer;
    timestampBuffer: RingBuffer<string>;
    timestampMsBuffer: RingBuffer<number>;
}
export interface UseSensorDataReturn {
    values: SensorValues;
    getPresentationValues: () => SensorValues;
    subscribePresentationValues: (listener: (values: SensorValues) => void) => () => void;
    bufferRefs: SensorBufferRefs;
    lastDebugLogTime: React.MutableRefObject<number>;
    displayUpdateRef: React.MutableRefObject<SensorDisplayUpdate | null>;
}
