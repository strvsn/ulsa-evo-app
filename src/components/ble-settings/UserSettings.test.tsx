import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BLESettingsDrawer from '../BLESettingsDrawer';
import { drawerLayoutFixtureProps } from '../../../cypress/support/drawer-layout-fixture';
afterEach(() => vi.unstubAllEnvs());
describe('User settings without engineering controls', () => {
    it('uses the combined ESP32/STM32 refresh action and exposes busy/failure states', () => {
        const refresh = vi.fn();
        const legacyStm32Refresh = vi.fn();
        const { rerender } = render(<BLESettingsDrawer {...drawerLayoutFixtureProps} onRefreshFirmwareVersions={refresh} onRefreshStm32FirmwareVersion={legacyStm32Refresh}/>);
        fireEvent.click(screen.getByRole('button', { name: /FW更新/ }));
        fireEvent.click(screen.getByRole('button', { name: 'バージョンを再確認' }));
        expect(refresh).toHaveBeenCalledOnce();
        expect(legacyStm32Refresh).not.toHaveBeenCalled();
        rerender(<BLESettingsDrawer {...drawerLayoutFixtureProps} firmwareInfoBusy onRefreshFirmwareVersions={refresh}/>);
        expect(screen.getByRole('button', { name: 'バージョンを取得中…' })).toBeDisabled();
        rerender(<BLESettingsDrawer {...drawerLayoutFixtureProps} firmwareInfoError="ESP32のバージョンを取得できませんでした。" onRefreshFirmwareVersions={refresh}/>);
        expect(screen.getByRole('alert')).toHaveTextContent('ESP32のバージョンを取得できません');
        expect(screen.getByRole('button', { name: 'バージョンを再確認' })).toBeEnabled();
    });
    it('explains that version acquisition requires BLE rather than implying the model was read', () => {
        render(<BLESettingsDrawer {...drawerLayoutFixtureProps} connectionState="disconnected"/>);
        fireEvent.click(screen.getByRole('button', { name: /FW更新/ }));
        expect(screen.getByText('本体にBLE接続すると、バージョンを取得できます。')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'バージョンを再確認' })).toBeDisabled();
    });
    it('orders the user settings categories by the requested workflow', () => {
        render(<BLESettingsDrawer {...drawerLayoutFixtureProps}/>);
        const navigation = screen.getByRole('navigation', { name: '設定カテゴリ' });
        expect(Array.from(navigation.querySelectorAll('button > span'), (element) => element.textContent))
            .toEqual(['概要', 'FW更新', 'カード/ログ', '時刻', '計測設定', '表示', '情報']);
    });
    it('moves device information and LED brightness to their task categories', () => {
        render(<BLESettingsDrawer {...drawerLayoutFixtureProps}/>);
        expect(screen.queryByRole('button', { name: /サンプル/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^デバイス/ })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /計測設定/ })).toBeInTheDocument();
        expect(screen.queryByText(/Device ID:/)).not.toBeInTheDocument();
        expect(screen.queryByText('Secure')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /FW更新/ }));
        expect(screen.getByText('本体情報')).toBeInTheDocument();
        expect(screen.getByText('ESP32ファームウェア')).toBeInTheDocument();
        expect(screen.getByText('STM32ファームウェア')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /計測設定/ }));
        expect(screen.getByText('LEDの明るさ')).toBeInTheDocument();
        expect(screen.getByText('接続や計測がうまくいかないとき')).toBeInTheDocument();
        expect(screen.queryByText('風速LED連動')).not.toBeInTheDocument();
        expect(screen.queryByText('通信ファームウェア')).not.toBeInTheDocument();
        expect(screen.queryByText('計測ファームウェア')).not.toBeInTheDocument();
        for (const label of ['ESP32 Build', 'STM32 Raw', 'ESP32モード', 'デバイスヘルス', 'BLE機能', 'リセット操作', 'Notify']) {
            expect(screen.queryByText(label)).not.toBeInTheDocument();
        }
    });
    it('keeps the wind-reactive feature hidden without invoking its setter', () => {
        const onSetLedWindReactive = vi.fn();
        render(<BLESettingsDrawer {...drawerLayoutFixtureProps} onSetLedWindReactive={onSetLedWindReactive}/>);
        fireEvent.click(screen.getByRole('button', { name: /計測設定/ }));
        expect(screen.queryByLabelText('風速LED連動')).not.toBeInTheDocument();
        expect(screen.queryByText(/風の強さを色で知らせる/)).not.toBeInTheDocument();
        expect(onSetLedWindReactive).not.toHaveBeenCalled();
    });
    it('keeps Node ID and measurement settings without raw protocol diagnostics', () => {
        render(<BLESettingsDrawer {...drawerLayoutFixtureProps} i2cConfigStatus={{ ...drawerLayoutFixtureProps.i2cConfigStatus!, configFlags: 0 }}/>);
        fireEvent.click(screen.getByRole('button', { name: /計測設定/ }));
        expect(screen.getByTestId('i2c-node-id-input')).toBeInTheDocument();
        expect(screen.getByText('センサーを見分けるため、0〜255の任意の番号を設定できます。')).toBeInTheDocument();
        expect(screen.queryByTestId('i2c-address-input')).not.toBeInTheDocument();
        expect(screen.queryByText('I2C Address')).not.toBeInTheDocument();
        expect(screen.queryByText('REG_VERSION / Target')).not.toBeInTheDocument();
        expect(screen.queryByText('I2C詳細')).not.toBeInTheDocument();
        expect(screen.getAllByText('保存')).toHaveLength(3);
        expect(screen.getByTestId('i2c-node-id-set')).toHaveClass('device-setting-save');
        expect(screen.getByTestId('i2c-node-id-set').querySelector('ion-icon')).not.toBeNull();
        expect(screen.getByText('デフォルトに復元')).toBeInTheDocument();
        expect(screen.getByText(/風速計測に使用する移動平均フィルターの回数/)).toBeInTheDocument();
        expect(screen.getByText(/天面を反転して設置する場合はInverted/)).toBeInTheDocument();
        expect(screen.queryByText('設定を保存')).not.toBeInTheDocument();
        expect(screen.queryByText('更新')).not.toBeInTheDocument();
        expect(screen.queryByText('破棄')).not.toBeInTheDocument();
        expect(screen.queryByText('変更を取り消す')).not.toBeInTheDocument();
    });
    it('sets and persists a measurement setting in one user action', async () => {
        const onWriteI2cConfig = vi.fn().mockResolvedValue(true);
        render(<BLESettingsDrawer {...drawerLayoutFixtureProps} i2cConfigStatus={{ ...drawerLayoutFixtureProps.i2cConfigStatus!, configFlags: 0 }} onWriteI2cConfig={onWriteI2cConfig}/>);
        fireEvent.click(screen.getByRole('button', { name: /計測設定/ }));
        fireEvent.click(screen.getByTestId('i2c-node-id-set'));
        await waitFor(() => expect(onWriteI2cConfig).toHaveBeenCalledTimes(2));
        expect(onWriteI2cConfig).toHaveBeenNthCalledWith(1, { op: 'setNodeId', value: 101 });
        expect(onWriteI2cConfig).toHaveBeenNthCalledWith(2, { op: 'save' });
    });
    it('shows card used and free capacity with the shared visual meter', () => {
        render(<BLESettingsDrawer {...drawerLayoutFixtureProps}/>);
        fireEvent.click(screen.getByRole('button', { name: /カード\/ログ/ }));
        expect(screen.getByRole('progressbar', { name: 'カード容量使用率' }))
            .toHaveAttribute('aria-valuenow', '68.4');
        expect(screen.getByLabelText('カード保存容量')).toHaveTextContent(/使用済み\s*5472 MB/);
        expect(screen.getByLabelText('カード保存容量')).toHaveTextContent(/空き\s*2528 MB/);
        expect(screen.queryByText('使用容量')).not.toBeInTheDocument();
        expect(screen.queryByText('空き容量')).not.toBeInTheDocument();
        expect(screen.queryByText('総容量')).not.toBeInTheDocument();
    });
    it('orders card features before app logs and uses the simplified auto-start row', () => {
        render(<BLESettingsDrawer {...drawerLayoutFixtureProps}/>);
        fireEvent.click(screen.getByRole('button', { name: /カード\/ログ/ }));
        const cardSection = screen.getByRole('heading', { name: 'カード' }).closest('section')!;
        const appLogSection = screen.getByRole('heading', { name: 'アプリ内ログ' }).closest('section')!;
        expect(cardSection.compareDocumentPosition(appLogSection) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
        expect(screen.getByText('電源オンでログ自動開始')).toBeInTheDocument();
        expect(screen.getByLabelText('電源オンでログ自動開始')).toBeInTheDocument();
        expect(screen.queryByText('有効')).not.toBeInTheDocument();
        expect(screen.queryByText('無効')).not.toBeInTheDocument();
    });
});
