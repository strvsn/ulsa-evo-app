import { useCallback, useEffect, useRef, useState } from 'react';

export type OtaPreparationStep = {
  id: 'download' | 'connect' | 'upload' | 'probe';
  done: boolean;
  available: boolean;
  run: () => Promise<unknown>;
};

/** Advance only non-destructive preparation. Writing is never a step here. */
export const useOtaPreparation = ({
  steps, busy, bindingKey, onError,
}: {
  steps: OtaPreparationStep[];
  busy: boolean;
  bindingKey: string;
  onError: (error: unknown) => void;
}) => {
  const [running, setRunning] = useState(false);
  const [activeStep, setActiveStep] = useState<OtaPreparationStep['id'] | null>(null);
  const attempted = useRef(new Set<string>());
  const inFlight = useRef(false);
  const generation = useRef(0);
  const binding = useRef(bindingKey);

  const stop = useCallback(() => {
    generation.current += 1;
    setRunning(false);
    setActiveStep(null);
  }, []);

  const start = useCallback(() => {
    if (inFlight.current) return;
    attempted.current.clear();
    setRunning(true);
  }, []);

  useEffect(() => {
    if (binding.current === bindingKey) return;
    binding.current = bindingKey;
    stop();
  }, [bindingKey, stop]);

  useEffect(() => () => { generation.current += 1; }, []);

  useEffect(() => {
    if (!running || busy || inFlight.current) return;
    const next = steps.find((step) => !step.done);
    // A completed request with no matching result is a failed attempt, not a
    // reason to retry forever. Only another explicit start clears the attempts.
    if (!next || attempted.current.has(next.id) || !next.available) {
      setRunning(false);
      return;
    }
    const epoch = generation.current;
    attempted.current.add(next.id);
    inFlight.current = true;
    setActiveStep(next.id);
    void next.run().catch((error: unknown) => {
      if (epoch === generation.current) onError(error);
    }).finally(() => {
      inFlight.current = false;
      if (epoch === generation.current) setActiveStep(null);
    });
  }, [activeStep, busy, onError, running, steps]);

  return { running, activeStep, start, stop };
};
