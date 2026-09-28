import { memo } from 'react';
import { getBLESignalStrengthLabel, getBLESignalStrengthLevel } from './bleSignalStrengthUtils';
import './BLESignalStrength.css';

type BLESignalStrengthProps = {
  rssi?: number;
  className?: string;
  unavailable?: boolean;
};

/**
 * Four cellular-style bars. RSSI itself stays an adapter diagnostic and is
 * intentionally not exposed in the product UI.
 */
const BLESignalStrength = memo<BLESignalStrengthProps>(({ rssi, className = '', unavailable = false }) => {
  const level = unavailable ? 0 : getBLESignalStrengthLevel(rssi);
  const label = unavailable ? 'ブラウザーでは取得不可' : getBLESignalStrengthLabel(rssi);
  const classes = ['ble-signal-strength', className].filter(Boolean).join(' ');

  return (
    <span
      className={classes}
      data-level={level}
      data-available={unavailable ? 'false' : 'true'}
      role="img"
      aria-label={`BLE電波強度: ${label}`}
      title={label}
    >
      {[1, 2, 3, 4].map((bar) => (
        <span
          key={bar}
          className="ble-signal-strength-bar"
          data-active={bar <= level ? 'true' : 'false'}
          aria-hidden="true"
        />
      ))}
    </span>
  );
});

export default BLESignalStrength;
