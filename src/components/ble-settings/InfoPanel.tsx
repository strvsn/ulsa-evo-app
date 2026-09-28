import { useEffect, useState } from 'react';
import { BookOpen, ExternalLink, Info, ShieldCheck, TriangleAlert } from 'lucide-react';
import { PRODUCT_INFORMATION, type ProductInformation, type PublicPageConfiguration, } from '../../config/appInformation';
import { getRuntimeAppInfo, type RuntimeAppInfo, } from '../../services/nativeAppInfo';
import { requestInitialFirmwareOnboarding } from '../../services/initialFirmwareOnboardingPreference';
import { IonicControlButton } from '../controls';
import { InfoGrid, SectionCard } from './primitives';
type InfoPanelProps = {
    productInformation?: ProductInformation;
    loadRuntimeInfo?: () => Promise<RuntimeAppInfo>;
};
const configurationMessage = (page: PublicPageConfiguration, label: string, envKey: string): string | null => {
    void envKey;
    if (page.state === 'configured')
        return null;
    return `${label}は現在準備中です。しばらくしてからもう一度お試しください。`;
};
const PublicPageAction = ({ page, label, envKey, }: {
    page: PublicPageConfiguration;
    label: string;
    envKey: string;
}) => {
    const message = configurationMessage(page, label, envKey);
    if (message) {
        return (<div className="ble-settings-message warning app-information-warning" role="status">
        <TriangleAlert className="ulsa-icon" size={18} strokeWidth={1.8} aria-hidden="true"/>
        <span>{message}</span>
      </div>);
    }
    return (<div className="app-information-actions">
      <IonicControlButton controlSize="M44" controlVariant="secondary" fill="outline" className="app-information-button" href={page.url ?? undefined} target="_blank" rel="noreferrer noopener">
        {label}を開く
        <ExternalLink className="ulsa-icon" size={17} strokeWidth={1.9} aria-hidden="true"/>
      </IonicControlButton>
    </div>);
};
export const InfoPanel = ({ productInformation = PRODUCT_INFORMATION, loadRuntimeInfo = getRuntimeAppInfo, }: InfoPanelProps) => {
    const [runtimeInfo, setRuntimeInfo] = useState<RuntimeAppInfo | null>(null);
    useEffect(() => {
        let disposed = false;
        void loadRuntimeInfo().then((info) => {
            if (!disposed)
                setRuntimeInfo(info);
        });
        return () => {
            disposed = true;
        };
    }, [loadRuntimeInfo]);
    return (<>
      <SectionCard title="アプリ情報" icon={<Info className="ulsa-icon" size={19} strokeWidth={1.8} aria-hidden="true"/>}>
        <InfoGrid rows={[
            { label: 'アプリ名', value: runtimeInfo?.name || productInformation.appName },
            { label: 'アプリバージョン（iOS / Web共通）', value: runtimeInfo?.version || '取得中' },
            ...([]),
            ...([])
        ]}/>
        {false}
        <div className="app-information-actions">
          <IonicControlButton controlSize="M44" controlVariant="secondary" fill="outline" className="app-information-button" onClick={requestInitialFirmwareOnboarding}>
            初回セットアップガイド
          </IonicControlButton>
        </div>
      </SectionCard>

      <SectionCard title="Open Source / 利用案内" icon={<BookOpen className="ulsa-icon" size={19} strokeWidth={1.8} aria-hidden="true"/>}>
        <p className="app-information-copy">
          このアプリとデモファームウェアはオープンソース・無保証です。利用条件と免責事項は、各配布物のライセンスをご確認ください。
        </p>
        <p className="app-information-copy">
          個別サポート・動作保証・機能追加対応は原則行いません。使い方や対応環境は公開ドキュメントをご確認ください。
        </p>
        <PublicPageAction page={productInformation.support} label="公開ドキュメント" envKey="VITE_SUPPORT_URL"/>
        {false}
      </SectionCard>

      <SectionCard title="Privacy / データ取扱い" icon={<ShieldCheck className="ulsa-icon" size={19} strokeWidth={1.8} aria-hidden="true"/>}>
        <ul className="app-information-list">
          <li>BLE計測ログは端末内に最長30日・合計100MiBまで保存し、設定から個別または全削除できます。</li>
          <li>位置、方位、Motionは真北表示、移動風補正、画面方向のため端末内で使用します。</li>
          <li>現行アプリは計測ログ、位置情報、利用状況をanalytics・広告・tracking目的で外部送信しません。</li>
          <li>ZIP共有/保存はユーザーが明示操作した場合だけ実行します。</li>
        </ul>
        <PublicPageAction page={productInformation.privacyPolicy} label="Privacy Policy" envKey="VITE_PRIVACY_POLICY_URL"/>
        {false}
      </SectionCard>
    </>);
};
