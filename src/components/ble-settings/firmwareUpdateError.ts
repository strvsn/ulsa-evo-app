/** User-facing explanations; raw protocol diagnostics belong in engineering logs. */
export const firmwareUpdateError = (message: string | null): string | null => {
  if (!message) return null;
  if (/revision_rollback|古い.*revision|revision.*古い/.test(message)) {
    return 'この本体より古い更新は使用できません。新しいバージョンを選んでください。';
  }
  if (/Initialの更新は|Local Network Access対応Chromium/i.test(message)) {
    return 'この端末では更新できません。iPhoneアプリか対応するパソコンのブラウザを使用してください。';
  }
  if (/許可時間|authorizationExpired/i.test(message)) {
    return '本体ボタンの受付時間が終了しました。更新準備からやり直してください。';
  }
  if (/本体ボタンで更新を許可|物理認可待ち/.test(message)) {
    return '画面の案内に従い、本体ボタンを押してください。';
  }
  if (/BLE identity|Demo.*BLE|更新後.*BLE/i.test(message)) {
    return '更新後の本体へ接続できませんでした。本体の再起動を待ってから、接続を確認してください。';
  }
  if (/Recovery portal|recovery_required/i.test(message)) {
    return '本体が復旧待ちです。電源を切らず、更新状態を再確認してください。';
  }
  if (/中止.*不明|中止.*確認でき/.test(message)) {
    return '中止できたか確認できませんでした。更新データは保持しています。接続して状態を確認してください。';
  }
  if (/状態は不明|状態が不明|書込み開始.*タイムアウト|監視時間/.test(message)) {
    return '本体からの応答が途切れました。更新が続いている可能性があります。電源を切らずに、更新状態を確認してください。';
  }
  if (/binding|sessionまたは選択release|session.*一致|SHA|hash|署名/.test(message)) {
    return '本体と更新データの組み合わせを確認できませんでした。接続と選択したバージョンを確認して、準備をやり直してください。';
  }
  if (/secure_|bootloader|非消去確認/.test(message)) {
    return '本体の更新準備を確認できませんでした。電源と接続を確認して、準備をやり直してください。';
  }
  if (/token|session|endpoint|status|HTTP|invalid|timeout|OTA Control|SoftAP|Portal/i.test(message)) {
    return '本体との接続を確認できませんでした。Wi-Fiの接続先を確認して、もう一度お試しください。';
  }
  if (/取消|キャンセル|許可|拒否/.test(message)) return message;
  if (!/[\u3040-\u30ff\u3400-\u9fff]/.test(message)) return '更新の準備に失敗しました。接続を確認して、もう一度お試しください。';
  return message.replace(/firmware\.bin|STM32 FW package|package/gi, '更新データ');
};
