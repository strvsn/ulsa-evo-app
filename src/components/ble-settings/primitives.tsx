import type { ReactNode } from 'react';
import { IonIcon } from '@ionic/react';

export interface InfoRow {
  label: string;
  value: ReactNode;
}

export const SectionCard = ({
  title,
  icon,
  children,
  actions,
}: {
  title: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) => (
  <section className="ble-settings-card">
    <header className="ble-settings-card-header">
      <h3>
        {icon && (typeof icon === 'string' ? <IonIcon icon={icon} /> : icon)}
        {title}
      </h3>
      {actions && <div className="ble-settings-card-actions">{actions}</div>}
    </header>
    <div className="ble-settings-card-body">{children}</div>
  </section>
);

export const InfoGrid = ({ rows }: { rows: InfoRow[] }) => (
  <dl className="ble-settings-info-grid">
    {rows.map((row) => (
      <div className="ble-settings-info-row" key={row.label}>
        <dt>{row.label}</dt>
        <dd>{row.value}</dd>
      </div>
    ))}
  </dl>
);

export type StatusTone = 'neutral' | 'attention' | 'critical';

export const StatusSummary = ({ children }: { children: ReactNode }) => (
  <div className="ble-settings-status-summary">{children}</div>
);

export const StatusItem = ({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: StatusTone;
}) => (
  <span className="ble-settings-status-item" data-tone={tone}>{children}</span>
);

export const AdvancedDetails = ({
  title = '詳細',
  children,
  open = false,
}: {
  title?: string;
  children: ReactNode;
  open?: boolean;
}) => (
  <details className="ble-settings-advanced" open={open}>
    <summary>{title}</summary>
    <div className="ble-settings-advanced-body">{children}</div>
  </details>
);
