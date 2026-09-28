import { memo, type ReactNode, type RefObject } from 'react';
import { useSensorData, type SensorDataSource } from '../../hooks/useSensorData';
import type { DisplaySampleListener, TimelineSampleListener } from '../../hooks/ble/types';
import type { LineChartRef } from '../../components/charts';
import type { UseSensorDataReturn } from '../../types/sensor';

export const WIND_ROSE_SLIDE_INDEX = 0;
export const GAUGE_SLIDE_INDEX = 1;
export const CHART_SLIDE_INDEX = 2;
export const NOOP_SENSOR_NOTIFICATION_TRANSITION: (paused: boolean) => Promise<void> = async () => undefined;
export const NOOP_TIMELINE_SUBSCRIPTION = () => () => undefined;
export const NOOP_DISPLAY_SUBSCRIPTION = () => () => undefined;

interface SensorDataBoundaryProps {
  dataSource: SensorDataSource;
  subscribeDisplaySamples: (listener: DisplaySampleListener) => () => void;
  subscribeTimelineSamples: (listener: TimelineSampleListener) => () => void;
  lineChartRef: RefObject<LineChartRef | null>;
  reactiveValues: boolean;
  children: (sensor: UseSensorDataReturn) => ReactNode;
}

export const SensorDataBoundary = memo(({
  dataSource,
  subscribeDisplaySamples,
  subscribeTimelineSamples,
  lineChartRef,
  reactiveValues,
  children,
}: SensorDataBoundaryProps) => children(useSensorData({
  dataSource,
  subscribeDisplaySamples,
  subscribeTimelineSamples,
  lineChartRef,
  reactiveValues,
})));
