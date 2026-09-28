# BLE通信実装仕様書

## 1. 概要

本仕様書は、Ionic Reactアプリケーションにおける超音波風速計（ULSA）とのBLE（Bluetooth Low Energy）通信機能の実装について記述します。

Web ブラウザ版と Capacitor/iOS native 版の挙動互換性は [`WEB_CAPACITOR_IOS_COMPATIBILITY_RULES.md`](./WEB_CAPACITOR_IOS_COMPATIBILITY_RULES.md) を優先する。BLE 仕様変更時は、platform 差分を adapter 層へ閉じ込め、接続状態、標準計測 notify、計測値表示、parse error の意味を両 platform で揃える。

### 1.1 対象デバイス

| 項目 | 値 |
|------|-----|
| 製造者名 | StratoVision LLC |
| モデル番号 | ULSA EVO |
| ESP32ファームウェアバージョン | canonical `MAJOR.MINOR.PATCH`（例`1.0.0`） |

### 1.2 セキュリティ設定

| 項目 | 設定 |
|------|------|
| ボンディング | 無効（ペアリング情報保存なし） |
| ペアリング方式 | Just Works（PINコード不要） |
| LE Secure Connections | 無効 |
| MITM保護 | 無効（入力デバイスなし） |
| IO Capability | NoInputNoOutput |

---

## 2. GATTプロファイル

### 2.1 サービス一覧

| サービス名 | UUID | 説明 |
|-----------|------|------|
| Environmental Sensing | `0x181A` | 風向・風速・温度の標準センシング |
| Current Time Service | `0x1805` | 選択地域の現地時刻とUTC差の参照 |
| Device Information Service | `0x180A` | デバイス情報 |
| ULSA Wind Service | カスタム | 独自拡張サービス（音速、Heading等） |

### 2.2 キャラクタリスティック一覧

#### Environmental Sensing Service (0x181A)

| 名称 | UUID | 型 | 単位 | プロパティ |
|------|------|-----|------|-----------|
| Apparent Wind Direction | `0x2A73` | uint16 | 0.01° | Read, Notify |
| Apparent Wind Speed | `0x2A72` | uint16 | 0.01 m/s | Read, Notify |
| Temperature | `0x2A6E` | int16 | 0.01 ℃ | Read, Notify |

#### Current Time Service (0x1805)

| 名称 | UUID | 型 | プロパティ |
|------|------|-----|-----------|
| Current Time | `0x2A2B` | 10バイト構造体 | Read, Write, Notify |
| Local Time Information | `0x2A0F` (`00002a0f-0000-1000-8000-00805f9b34fb`) | 2バイトCTS標準構造体 | Read |

#### Device Information Service (0x180A)

| 名称 | UUID | 型 | プロパティ |
|------|------|-----|-----------|
| Firmware Revision | `0x2A26` | string | Read |
| Software Revision | `0x2A28` (`00002a28-0000-1000-8000-00805f9b34fb`) | string | Read |
| Manufacturer Name | `0x2A29` | string | Read |
| Model Number | `0x2A24` | string | Read |

#### ULSA Wind Service (カスタム)

ULSA独自拡張は製品固有の128-bit UUID namespace `e147a12a-67ff-4249-930b-c35d372ba0xx` を使用する。末尾 `00` をService、`01` 以降をCharacteristicに割り当てる。

| 名称 | UUID | 型 | 単位 | プロパティ |
|------|------|-----|------|-----------|
| Sound Speed | `e147a12a-67ff-4249-930b-c35d372ba001` | uint16 | 0.01 m/s | Read, Notify |
| Heading Speed | `e147a12a-67ff-4249-930b-c35d372ba002` | int16 | 0.01 m/s | Read, Notify |
| Wind Axis Speeds | `e147a12a-67ff-4249-930b-c35d372ba015` | int16 x 2 | 0.01 m/s | Read, Notify |
| Sensor Status | `e147a12a-67ff-4249-930b-c35d372ba003` | 7バイト Device Status v2 | - | Read, Notify |
| Sample Metadata | `e147a12a-67ff-4249-930b-c35d372ba009` | 12バイトstatus | - | Read, Notify |
| SD Status | `e147a12a-67ff-4249-930b-c35d372ba004` | 8バイト構造体 | - | Read, Notify |
| SD Log Control | `e147a12a-67ff-4249-930b-c35d372ba008` | 6バイトstatus / 1バイトcommand | - | Read, Write, Notify |
| SD Log Detail | `e147a12a-67ff-4249-930b-c35d372ba00c` | v2: 36バイトRead／20バイトNotify | - | Read, Notify |
| SD Log Settings | `e147a12a-67ff-4249-930b-c35d372ba00d` | 20バイトstatus / 1, 2, or 5バイトcommand | - | Read, Write, Notify |
| Device Identify | `e147a12a-67ff-4249-930b-c35d372ba00e` | 1バイトcommand | - | Write, Write Without Response |
| LED Brightness | `e147a12a-67ff-4249-930b-c35d372ba00f` | 1バイトstatus/command | 8段階 | Read, Write, Notify |
| LED Wind Reactive | `e147a12a-67ff-4249-930b-c35d372ba018` | 6バイトstatus / 1または3バイトcommand | 5テーマ | Read, Write, Notify |
| RTC Timezone Control | `e147a12a-67ff-4249-930b-c35d372ba019` | 28バイトstatus / 6または14バイトcommand | UTC・IANA地域 | Read, Write |
| OTA Control | `e147a12a-67ff-4249-930b-c35d372ba010` | 可変長status / 1バイトcommand | - | Read, Write, Notify |
| STM32 Update Control | `e147a12a-67ff-4249-930b-c35d372ba016` | 可変長status / 互換1バイトまたは拡張prepare command | - | Read, Write, Notify |
| Reset Control | `e147a12a-67ff-4249-930b-c35d372ba013` | 6バイトstatus / 1バイトcommand | - | Read, Write, Notify |
| I2C Config Control | `e147a12a-67ff-4249-930b-c35d372ba005` | v1: 16バイト / v2: 18バイトstatus、1-2バイトcommand | - | Read, Write, Notify |
| Device Mode | `e147a12a-67ff-4249-930b-c35d372ba006` | 4バイトstatus | - | Read, Notify |
| STM32 Firmware Version | `e147a12a-67ff-4249-930b-c35d372ba007` | protocol v2: 12バイトstatus | - | Read, Notify |
| Device Health Summary | `e147a12a-67ff-4249-930b-c35d372ba00a` | 12バイトstatus | - | Read, Notify |
| BLE Capabilities | `e147a12a-67ff-4249-930b-c35d372ba00b` | 8バイトstatus | - | Read |


#### 計測Notify周期


ESP32は主要データを診断値より優先するが、アプリは風向、風速、標準Temperature (`0x2A6E`) の各Notifyを独立した更新として扱う。いずれか1項目を受信した時点で待機状態からliveへ移り、別項目の初回受信や通知順序を待たない。

1. adapterは `changedField + latestSnapshot + receivedAt` を共通イベントとして出力し、項目ごとの最終受信時刻を保持する。
2. まだ受信していない値は実測 `0` ではなく欠損値とし、UIでは `--`、CSVでは空欄、chartでは欠損点として扱う。
3. グラフbufferとブラウザCSVは風速Notifyだけを1サンプルの基準とし、その時点の最新風向、温度、optional値を同じ行へ写す。風向、温度、診断Notifyだけでは行を増やさない。
4. 1項目のNotifyが一時的に欠落しても受信済み状態をリセットせず、受信できている項目の表示を継続する。
5. optional characteristicは独立したbest-effort機能であり、初回Read、Notify開始、timeout、未対応が標準計測の購読、live遷移、ログを止めてはならない。

この契約は通知を1つの独自payloadへ統合するものではない。各CharacteristicのRead/Notify、UUID、単位、符号は上表の仕様を維持し、Sample Metadataも診断情報に限定する。

#### Node IDの表示契約

Node IDはユーザーが任意に設定できる`0..255`の表示ラベルであり、個体を一意に識別するsecurity identityではない。Sensor Statusは`[nodeId, dataValid, version, status, serviceStatus, activeCause, ntcReadingStatus]`の7バイトとする。v2を後方互換で受理し、現行v3は`dataValid=1`と`activeCause=LOW_TEMPERATURE`の組合せを計測可能な低温警告として許可する。`status`と`serviceStatus`はSTM32公開I2Cの同名レジスタ、`activeCause`は`ACTIVE_CAUSE`をそのまま転送する。各計測更新で標準値より先にNotifyし、接続直後はReadでも初期値を取得する。Notify開始に失敗してもRead可能なら2秒pollへ退避する。任意Characteristicとして扱い、取得失敗が標準計測notifyやBLE接続を妨げてはならない。

`activeCause`は`0=NONE`、`1=HIGH_WIND_LIMIT`、`2=LOW_TEMPERATURE`、`3=OVER_TEMPERATURE`、`4=TEMPERATURE_SENSOR_FAULT`、`5=MEASUREMENT_FAULT`、`6=CONFIGURATION_FAULT`、`7=STARTUP_HARDWARE_FAULT`、`8=EEPROM_FAULT`、`9=INTEGRITY_FAULT`、`10=IDENTITY_FAULT`、`11=PERSISTENCE_FAULT`、`12=RESTORED_UNKNOWN_LATCH`である。

Sensor Statusで`dataValid=0`でも標準計測Notifyの最新値、画面表示、CSV記録は更新する。エラー原因と無効状態を併記し、直前の正常値を現在値としてフリーズ表示しない。無効sampleは10分平均、合否、制御などの派生値から除外する。LOWTEMP v3は`dataValid=1`なので通常計測値と派生値を継続し、「低温警告」を表示する。

#### Wind Axis Speeds payload

A方向/B方向のセンサー軸別風速を、風速グラフの追加系列として表示するためのoptional characteristic。未対応firmwareではアプリはA/B系列を欠損扱いにし、既存の風速・風向・温度表示は継続する。


ESP32は現行STM32公開I2C snapshotの互換性を維持するため、STM32から受け取った絶対風速 `Vabs` と風向 `dir` から `A = Vabs * sin(dir)`, `B = Vabs * cos(dir)` として算出する。この向きはSTM32 calc仕様の `windDirection = atan2(A.Vair, B.Vair)` と整合する。

| Byte | 内容 | 型 | 変換 |
|------|------|-----|------|
| 0-1 | A direction wind speed | int16 LE | `m/s = raw / 100` |
| 2-3 | B direction wind speed | int16 LE | `m/s = raw / 100` |

## 3. データフォーマット

### 3.1 Current Time Service (CTS) フォーマット

PCF8563には常にUTCを保存する。Current Time Read/Notifyは保存UTCを本体に設定されたIANA地域へ変換した現地暦を返す。Local Time Information Readは標準UTC差と現在のDST差をBluetooth CTS標準形式で返す。

Current Time Writeは地域設定済みの場合だけ受理する。DST開始時の存在しない現地時刻、DST終了時の曖昧な現地時刻は推測せず拒否する。新アプリはCurrent Time Writeを使わず、RTC Timezone ControlでUnix秒と地域を同時に設定する。

| Byte | 内容 | 型 | 範囲 |
|------|------|-----|------|
| 0-1 | Year | uint16 (LE) | 2000-2099 |
| 2 | Month | uint8 | 1-12 |
| 3 | Day | uint8 | 1-31 |
| 4 | Hour | uint8 | 0-23 |
| 5 | Minute | uint8 | 0-59 |
| 6 | Second | uint8 | 0-59 |
| 7 | Day of Week | uint8 | 0=不明、1=月曜...7=日曜 |
| 8 | Fractions256 | uint8 | 無視 |
| 9 | Adjust Reason | uint8 | 無視 |

RTCがVL、STOP、I2C読出し失敗、またはUTC未確定のいずれかに該当する場合、ESP32は旧値を有効時刻として返さない。起動時にJSTやコンパイル時刻へfallbackしない。

### 3.2 SD Status データ構造

| Byte | 内容 | 型 | 説明 |
|------|------|-----|------|
| 0 | SD Card State | uint8 | `0=未初期化`, `1=カードなし`, `2=エラー`, `3=準備完了`, `4=記録中` |
| 1 | Usage Percentage | uint8 | 0-100% |
| 2-3 | Free Space | uint16 (LE) | 空き容量 [MB] |
| 4-5 | Total Space | uint16 (LE) | 総容量 [MB] |
| 6 | Card Type | uint8 | `0=None`, `1=Unknown`, `2=MMC`, `3=SD`, `4=SDHC/SDXC` |
| 7 | Reserved | uint8 | 将来拡張用。現在は0 |

アプリは接続直後に1回読み取り、その後は60秒ごとに再読み取りする。画面上の手動更新でも同じCharacteristicをReadする。旧firmware互換のため6バイトpayloadも受け付け、その場合の `Card Type` は `Unknown` として扱う。

`Card Type` はESP32 Arduino SD APIが返すカード種別であり、FAT32/exFATなどのファイルシステム形式を表す値ではない。アプリ上の表示も「カード形式」として扱い、ファイルシステム種別とは区別する。

`Free Space` と `Total Space` は互換性維持のためuint16 MBで表す。65535 MBを超える場合は `65535` に飽和する。

### 3.3 SD Log Control

SDカードへのログ記録開始/停止に使用する。SD Statusは容量・カード状態の読み取り、SD Log Controlはユーザー操作とログ有効状態の確認を担当する。

#### Write request

| Byte | 内容 | 型 | 説明 |
|------|------|-----|------|
| 0 | Operation | uint8 | `0=read`, `1=start`, `2=stop` |

#### Read / notify status

| Byte | 内容 | 型 | 説明 |
|------|------|-----|------|
| 0 | Protocol Version | uint8 | `0x01`=6バイトstatus（現行） |
| 1 | Last Operation | uint8 | 最後に受け付けた操作コード |
| 2 | Result | uint8 | `0=OK`, `1=QUEUED`, `2=BUSY`, `3=INVALID_LENGTH`, `4=INVALID_OP`, `5=UNAVAILABLE`, `6=FAILED`, `7=WRONG_MODE` |
| 3 | SD Card State | uint8 | SD Status byte0と同じ |
| 4 | Flags | uint8 | bit0: card available, bit1: logging enabled, bit2: can log now |
| 5 | Stop Reason | uint8 | `0=None`, `1=No Card`, `2=Slow Write`, `3=Write Error`, `4=File Error`, `5=User Disabled` |

アプリは接続直後およびSD Status更新時にこのCharacteristicもReadし、左上のSDログボタン状態へ反映する。通常はSD Log Detail Notifyで物理ボタン操作を即時反映し、Notify開始に失敗した場合だけこのCharacteristicを5秒周期でReadする。カード未検出、このCharacteristic未対応、Device ModeがBridge／Commandの場合は**新規開始**を無効にする。ただし、`loggingEnabled=1` の既存記録はカード異常後でも停止操作を優先し、BLE接続中は停止ボタンを無効化しない。

`start` はI2C計測中かつSDカードが利用可能な場合だけログ記録を有効化する。Bridge／Command中は`WRONG_MODE`を返し、アプリはI2C計測へ戻す案内を表示する。未初期化、カード未検出、マウントエラーの場合はESP32が再マウントを試行し、成功した場合のみ有効化する。`stop` は冪等な終端操作であり、カード未検出・マウントエラー・直前の書込み失敗後でも受理する。正常なファイルはflush/closeし、故障済みのSD書込みを再試行せずにファイルハンドルとRAMバッファを解放する。書込み失敗など既存の停止理由は `User Disabled` で上書きせず保持する。SDカード容量・カード形式は変更しない。

### 3.4 SD Log Detail

SDログが実際に進んでいるかを確認するための読み取り専用ステータス。SD Statusはカード容量、SD Log Controlは開始/停止操作、SD Log Detailは記録件数や書込み状態の確認を担当する。

| Byte | 内容 | 型 | 説明 |
|------|------|-----|------|
| 0 | Protocol Version | uint8 | status protocol version |
| 1 | Flags | uint8 | bit0: card available, bit1: logging enabled, bit2: can log now, bit3: log file open, bit4: RTC timestamping, bit5: slow write, bit6: error stop |
| 2 | SD Card State | uint8 | SD Status byte0と同じ |
| 3 | Stop Reason | uint8 | SD Log Control byte5と同じ |
| 4 | Log Rate | uint8 | 互換用の整数記録レート [Hz]。1秒超周期では0になる場合がある |
| 5 | Worker Flags | uint8 | v2: bit0記録要求、bit1入力pause、bit2復旧中、bit3停止・排出完了。v1は予約 |
| 6-9 | Log Count | uint32 (LE) | writerのCSVバッファへ受理した行数。同期確認済み件数とは異なる |
| 10-13 | Flush Count | uint32 (LE) | SDバッファflush回数 |
| 14-15 | Buffered Bytes | uint16 (LE) | 未flushバッファ量 [byte] |
| 16-17 | Last Write Duration | uint16 (LE) | 直近のSD書込み所要時間 [ms] |
| 18-19 | Last Log Age | uint16 (LE) | 直近ログからの経過秒。未記録時は `0xFFFF` |
| 20-23 | Synced Rows | uint32 (LE) | v2 Read: 同期成功を確認した行数 |
| 24-27 | Dropped Rows | uint32 (LE) | v2 Read: queue overflow／停止・復旧中に保存できなかった行数 |
| 28-31 | Uncertain Rows | uint32 (LE) | v2 Read: write／sync異常で保存完了を確認できない行数 |
| 32-33 | Queue Depth | uint16 (LE) | v2 Read: 保存待ち件数（上限256、制御要求を含む場合あり） |
| 34-35 | Reserved | uint16 | 0 |

v2は最小MTUに収まる20バイトprefixだけをNotifyし、36バイト全体はReadする。v1やprefixだけでは追加件数を0と推定せず未取得とする。Web／iOSは同じparserを使う。SD Log ControlのloggingEnabledは記録要求を表し、実際の記録状態はDetailのloggingEnabled／inputPaused／recoveringで区別する。停止理由6は容量reserve到達、7は自動復旧回数超過。

ESP32はBLE read直前と物理ボタンによる開始・停止時に最新値へ更新する。アプリは必須計測Notifyが成立した後に、このCharacteristicのNotifyをoptionalとして購読する。購読失敗はBLE接続や計測Notifyを失敗させず、SD Log Controlの5秒Readへフォールバックする。接続直後、SD Status更新時、SDログ開始/停止操作後、設定ドロワー表示中の約1.5秒周期pollでもReadする。未対応firmwareでは未取得表示に留め、既存のSD Log Control / SD Statusへフォールバックする。

`Last Write Duration` はSDカードへの実書込みが発生した時点の所要時間であり、CSV行をRAMバッファへ追加しただけのタイミングでは更新されない。`Last Log Age` はESP32 `millis()` に基づく相対値で、端末時刻やRTC時刻との差分ではない。

### 3.5 SD Log Settings

SDカードCSVログの記録周期と、次回の電源投入時だけ有効な内部ログ自動開始設定を読み書きする。設定値はESP32のNVSへ保存され、ESP32再起動後も維持される。周期は `interval_ms` が正であり、Hz表示はアプリ側で `1000 / interval_ms` から算出する。

STM32 I2Cの公開出力周期が取得できる場合、ESP32はその値を記録周期の基準として公開する。書込みはこの周期の正の整数倍だけを受理し、各CSV行を新規 `DATA_SEQ` に対応させる。公開出力周期が未取得の場合、ESP32は周期変更を `SOURCE_INTERVAL_UNKNOWN` として拒否する。アプリのHz選択肢はこの条件を満たす値だけで構成し、外部BLEクライアントから非整数倍が書き込まれた場合はESP32が `INTERVAL_NOT_ALIGNED` を返す。

#### Write request

| Byte | 内容 | 型 | 説明 |
|------|------|-----|------|
| 0 | Operation | uint8 | `0=read`, `1=set_interval_ms`, `2=restore_default`, `3=set_auto_start` |
| 1-4 | Interval | uint32 (LE) | `set_interval_ms` のみ。ログ周期 [ms] |
| 1 | Auto Start | uint8 | `set_auto_start` のみ。`0=無効`、`1=有効` |

`read` と `restore_default` は1バイト、`set_auto_start` は2バイト、`set_interval_ms` は5バイト固定。`set_auto_start` は `0` と `1` だけを受理し、他の値は `INVALID_VALUE` を返す。絶対許容範囲は `20..600000 ms`。`restore_default` は既定値100ms以上となる最小の整数倍を保存する。旧版から残った非整数倍のNVS値は、STM32出力周期の取得後、速くならない側の最小整数倍へ正規化する。

#### Read / notify status

| Byte | 内容 | 型 | 説明 |
|------|------|-----|------|
| 0 | Protocol Version | uint8 | status protocol version |
| 1 | Last Operation | uint8 | 最後に受け付けた操作コード |
| 2 | Result | uint8 | `0=OK`, `1=QUEUED`, `2=BUSY`, `3=INVALID_LENGTH`, `4=INVALID_OP`, `5=UNAVAILABLE`, `6=FAILED`, `7=OUT_OF_RANGE`, `8=SOURCE_INTERVAL_UNKNOWN`, `9=INTERVAL_NOT_ALIGNED`, `10=INVALID_VALUE` |
| 3 | Flags | uint8 | bit0: persisted, bit1: stm interval known, bit2: default interval, bit3: auto start enabled |
| 4-7 | Current Interval | uint32 (LE) | 現在のログ周期 [ms] |
| 8-11 | Minimum Allowed Interval | uint32 (LE) | 現在設定できる最短ログ周期 [ms] |
| 12-15 | Maximum Allowed Interval | uint32 (LE) | 現在 `600000` |
| 16-19 | I2C Output Interval | uint32 (LE) | STM32 I2C公開出力周期または `DATA_SEQ` 実測周期 [ms]。不明時0 |

アプリの表示単位は、1Hz以上の周期ではHzと秒間隔を併記し、1秒以上10分以下では秒と分を併記する。10分を超える周期はUIでは扱わない。

自動開始の既定値は無効である。有効時も現在のログ開始・停止状態は変えない。次回の通常電源投入でSDカードのマウントに成功した時だけ内部SDログを開始し、再マウント、BLE再接続、SD書込み障害後の同一電源投入中には自動再開しない。SD書込み障害で記録を安全停止しても、この設定値は維持する。

### 3.6 アドバタイジングデータ構造 (Service Data)

| Byte | 内容 | 型 | 説明 |
|------|------|-----|------|
| 0-1 | Service UUID | uint16 (LE) | 0x181A |
| 2 | Node ID | uint8 | ユーザー設定の表示ラベル（重複可） |
| 3 | Valid flag + reserved | uint8 | bit0: 有効フラグ |
| 4-5 | Wind Direction | uint16 (LE) | 0.01°単位 |
| 6-7 | Wind Speed | uint16 (LE) | 0.01 m/s単位 |
| 8-9 | Temperature | int16 (LE) | 0.01℃単位 |
| 10-11 | Sound Speed | uint16 (LE) | 0.01 m/s単位 |
| 12-13 | Heading Speed | int16 (LE) | 0.01 m/s単位 |

現行のBLE sensor payloadには measurement frame id や timestamp は含まれない。ESP32内部の `WindData.timestamp` と STM32 I2C snapshot の `DATA_SEQ` はBLE GATTの各 sensor characteristic には公開されていないため、アプリはBLE受信時刻を `SensorData.timestamp` として付与する。adapter層で同一physical cycleを推定してsampleを間引く変更は、BLE contract側でframe id/timestampを公開してから行う。

### 3.7 Sample Metadata

最新の計測サンプルがどの入力経路とseq/statusに対応するかを示す読み取り専用ステータス。既存の風向・風速・温度Characteristicのpayloadは変更しない。未対応firmwareではアプリはこの情報を表示しないだけで、計測表示は継続する。

| Byte | 内容 | 型 | 説明 |
|------|------|-----|------|
| 0 | Protocol Version | uint8 | status protocol version |
| 1 | Flags | uint8 | bit0: valid, bit1: source I2C, bit2: source UART, bit3: stale |
| 2-3 | Sequence | uint16 (LE) | STM32 I2C `DATA_SEQ` またはESP32ローカルsample seq |
| 4-7 | ESP32 Timestamp | uint32 (LE) | ESP32 `millis()` による受信時刻 |
| 8 | Source | uint8 | `0=unknown`, `1=I2C`, `2=UART`, `3=simulation` |
| 9 | Remote Status | uint8 | STM32 `STATUS`。I2C以外では0 |
| 10 | Remote Error | uint8 | STM32 `LAST_ERROR`。I2C以外では0 |
| 11 | Local Error | uint8 | ESP32 I2C/parser error |

ESP32は風速データ更新時にこのCharacteristicのread値を更新する。BLE接続中はSample MetadataもNotifyできるが、アプリは未通知・未対応でも接続失敗とは扱わない。設定ドロワー表示中は約1.5秒周期でReadし、`SEQ`、source、stale、remote/local errorを表示する。

### 3.8 Device Health Summary

Device Mode、STM32 I2C、RTC、SD、I2C設定の代表状態をまとめた読み取り専用ステータス。これは個別Characteristicの代替ではなく、ユーザーやサポートが「どこを確認すべきか」を素早く判断するための要約である。I2C設定やSDログ制御の可否判断は、引き続き各個別statusを優先する。

| Byte | 内容 | 型 | 説明 |
|------|------|-----|------|
| 0 | Protocol Version | uint8 | status protocol version |
| 1 | System Flags | uint8 | bit0: BLE connected, bit1: I2C detected, bit2: RTC available（今回のI2C snapshot読出し成功）, bit3: SD available, bit4: logging enabled, bit5: config dirty, bit6: reboot required, bit7: error active |
| 2 | ESP32 Mode | uint8 | Device Mode byte1と同じ |
| 3 | ESP32 Last Error | uint8 | 現在0。将来拡張用 |
| 4 | STM32 REG_VERSION | uint8 | 未検出時0 |
| 5 | STM32 STATUS | uint8 | 未検出時0 |
| 6 | STM32 LAST_ERROR | uint8 | 未検出時0 |
| 7 | I2C Local Error | uint8 | `UlsaEvoI2cClientError` |
| 8 | SD State | uint8 | `SdLoggerState` |
| 9 | SD Stop Reason | uint8 | `SdLoggerStopReason` |
| 10 | RTC Flags | uint8 | bit0: 起動時RTC検出, bit1: running（I2C読出し成功かつSTOP=0）, bit2: time valid, bit3: voltage low (VL), bit4: clock stopped (STOP) |
| 11 | Reserved | uint8 | 現在0 |

RTC Flagsのbit2-4はDevice Health protocol v2で追加した。v1 firmwareではbit0-1だけを使い、アプリは従来のrunning状態として表示する。bit0がありSystem Flags bit2がない場合は、RTCは起動時に検出済みだが現在のI2C読出しが失敗している状態である。

ESP32は接続/切断、Device Mode更新、I2C Config処理、SD Status/SD Log Control更新、STM32 FW読取などのタイミングでDevice Healthを更新する。センサー10Hz通知に余計な負荷を加えないため、アプリは設定ドロワー表示中に約1.5秒周期でReadする。

STM32 `REG_VERSION>=0x0D`では、`STM32 LAST_ERROR`の`0x0E`を`BOOT_EEPROM_READ`、`0x0F`を`BOOT_CRYPTO`、`0x10`を`BOOT_IDENTITY`として解釈する。アプリは工学表示だけでなく一般ユーザーのデバイス画面にも起動異常と「計測値は無効」を表示する。I2C設定画面では書込み操作を無効化する。Web BluetoothとCapacitor/iOSは同じformatterと共有UIを使用する。

### 3.9 BLE Capabilities

ESP32 firmwareがこの起動で公開しているBLE機能を示す読み取り専用ステータス。アプリはCharacteristicの存在確認とCapabilitiesの両方を使い、新旧FW混在時のUIを未対応/未取得として安全に出し分ける。

| Byte | 内容 | 型 | 説明 |
|------|------|-----|------|
| 0 | Protocol Version | uint8 | status protocol version |
| 1 | Feature Flags 0 | uint8 | bit0: Current Time, bit1: Device Info, bit2: SD Status, bit3: SD Log Control, bit4: Device Mode, bit5: STM32 FW Version, bit6: I2C Config Control, bit7: Sample Metadata |
| 2 | Feature Flags 1 | uint8 | bit0: Device Health, bit1: SD Log Detail, bit2: Capabilities, bit3: wind notifications, bit4: RTC read/write, bit5: I2C config write, bit6: SD log write, bit7: SD Log Settings |
| 3 | BLE Interface Revision | uint8 | ESP32 BLE拡張interface revision |
| 4 | Max Measurement Notify Rate | uint8 | 最大計測notifyレート [Hz] |
| 5 | Diagnostic Poll Hint | uint8 | 診断系readの推奨poll間隔 [秒] |
| 6 | Feature Flags 2 | uint8 | bit0: Device Identify, bit1: LED Brightness, bit2: OTA Control, bit3: Reset Control, bit4: STM32 Update Control, bit5: LED Wind Reactive |
| 7 | Feature Flags 3 | uint8 | bit0: RTC Timezone Control、bit1-7: 予約 |

Capabilitiesが読めない旧firmwareでも、アプリは既存Characteristicのbest-effort readを継続する。Capabilitiesは接続成功条件ではなく、表示と診断の補助情報として扱う。

RTC Timezone Control対応版のBLE Interface Revisionは`0x0E`とする。専用Characteristicがない旧firmwareでは、通常計測を維持したまま時刻・地域設定だけを無効表示し、CTS Writeへのfallbackや旧RTC値の移行は行わない。

### 3.9.1 RTC Timezone Control

UUIDは`e147a12a-67ff-4249-930b-c35d372ba019`、protocol versionは`1`、multi-byte値はすべてlittle-endianとする。

Write request:

| Operation | code | 長さ | payload |
|---|---:|---:|---|
| `SET_ZONE` | `0x01` | 6 | op, version, zoneId:uint32 |
| `SYNC_UTC_AND_ZONE` | `0x02` | 14 | op, version, zoneId:uint32, unixSeconds:int64 |

28-byte Read status:

| Byte | 内容 | 型 |
|---:|---|---|
| 0 | protocol version `1` | uint8 |
| 1 | bit0 RTC検出, bit1読出可, bit2 UTC有効, bit3 zone設定済, bit4 NVS保存済, bit5 DST中, bit6処理中, bit7 error | flags |
| 2 | last operation | uint8 |
| 3 | result | uint8 |
| 4-7 | AceTime stable zone ID | uint32 |
| 8-15 | RTCから読み戻したUnix秒 | int64 |
| 16-17 | 合計UTC offset [min] | int16 |
| 18-19 | 標準UTC offset [min] | int16 |
| 20-21 | DST offset [min] | int16 |
| 22-23 | operation generation | uint16 |
| 24-25 | TZDB year | uint16 |
| 26 | TZDB revision letter (`a`..`z`) | uint8 |
| 27 | reserved `0` | uint8 |

Result codeは順に`0x00 ok`、`0x01 invalid_length`、`0x02 invalid_version`、`0x03 invalid_op`、`0x04 unsupported_zone`、`0x05 time_out_of_range`、`0x06 nvs_failed`、`0x07 rtc_write_failed`、`0x08 readback_failed`、`0x09 busy`とする。

`busy`は処理継続ではなく、そのwrite要求が競合して拒否された終端結果である。同opでgenerationが更新されても、result=`ok`でない限りアプリは成功としない。

アプリはwrite前のgenerationと比較し、generation更新、op一致、result=`ok`、zone ID一致、UTC有効、NVS保存済、RTC読戻しと端末時刻の差が±2.5秒以内のすべてを満たした場合だけ同期成功とする。

### 3.10 Device Identify

接続先選択中に、対象ULSA EVOを物理的に見分けるための書き込み専用Characteristic。アプリは検出デバイス一覧の電球ボタン押下時に対象deviceIdへ短時間だけBLE接続し、ACK付きWriteで `0x01` を送信し、短いsettle待ちの後に切断する。これは本接続とは別の補助操作であり、成功しても `connectedDevice` や計測通知購読状態へは遷移しない。Native iOS/Androidでは検出済み候補が表示された時点で、スキャン完了待ちをせず識別操作を開始できる。

| Byte | 内容 | 型 | 説明 |
|------|------|-----|------|
| 0 | Operation | uint8 | `1=LEDで30秒間識別表示` |

ESP32はwrite callback内でLED制御を直接ブロックせず、識別要求をメインループ側へ渡して通常の `LedController.update()` で300 ms ON/OFFの識別点滅を最大30秒間進める。点滅中もBLE接続と計測通知を継続し、通常接続ボタンが押された場合はアプリが識別用の一時接続の切断完了を待ってから接続する。その接続が成立すると識別点滅を終了し、I2C計測中は接続時の水色LED表示へ戻る。未接続のまま30秒経過した場合は、その時点の通常LEDモード表示へ戻る。

旧firmwareでCharacteristicが存在しない場合、アプリは識別失敗として表示するが、デバイス一覧表示と通常接続は継続する。Native iOS/Android版は通常のACK付きWriteを優先し、これが使えない環境だけ `Write Without Response` へフォールバックする。Write Without Responseを使う場合も一時接続を即時切断せず、ESP32側のwrite callbackへ届く時間を確保する。Web Bluetooth版はブラウザ標準のデバイス選択UIを使うため、未接続候補一覧からの識別ボタンはNative iOS/Android版を主対象とする。

### 3.11 LED Brightness

ESP32内蔵LEDの輝度を読み書きするCharacteristic。アプリは設定ドロワーの8ノッチスライダー操作時に実効輝度値を書き込み、ESP32 firmwareはメインループ側で輝度を即時反映してNVSへ保存する。消灯後に点灯値へ変更した場合も、現在のモード色を再描画して復帰する。保存された値はESP32再起動後も保持される。BLE payloadは従来どおり1 byteで、旧NVSや旧アプリからの任意値は最寄り段階へ正規化する。

| Byte | 内容 | 型 | 説明 |
|------|------|-----|------|
| 0 | Brightness | uint8 | `0 / 16 / 32 / 50 / 75 / 110 / 170 / 255` のいずれか。0は消灯、1-7が明るさ段階。 |

旧firmwareでCharacteristicが存在しない場合、アプリはLED輝度UIを未対応表示にし、通常のBLE接続と計測表示は継続する。

### 3.12 LED Wind Reactive

I2C計測かつBLE接続中の水色定常LEDだけを、ESP32がすでに取得した風速に応じた連続色へ置換する設定。標準風速Characteristic、デバッグCharacteristic、通知周期は変更しない。Wi-Fi、OTA、STM32更新、識別、エラー表示は常に優先する。

| 項目 | 値 |
| --- | --- |
| UUID | `e147a12a-67ff-4249-930b-c35d372ba018` |
| protocol | `1` |
| NVS | `led_cfg/wind_reactive`。保存成功後のみ有効な設定へ更新 |
| 表示範囲 | `0.0-25.0 m/s`。25.0 m/s超は高風速色を維持し、120 msごとに点灯／消灯を切り替え |

Writeは `[op]` または `[op, enabled, theme]`。

| op | 長さ | 内容 |
| --- | ---: | --- |
| `0` read | 1 | 現在設定を返す |
| `1` set config | 3 | `enabled` は `0`/`1`、`theme` は `0-4` |

Statusは6 byteである。

| Byte | 内容 |
| --- | --- |
| 0 | protocol version (`1`) |
| 1 | last op (`0=read`, `1=set config`) |
| 2 | result (`0=ok`, `1=queued`, `2=busy`, `3=invalid length`, `4=invalid op`, `5=invalid value`, `6=failed`) |
| 3 | flags: bit0=enabled, bit1=active, bit2=persisted |
| 4 | theme (`0=Tide`, `1=Cividis`, `2=Viridis`, `3=Ember`, `4=Aurora`) |
| 5 | reserved (`0`) |

WebとCapacitorはともに書込み後80 ms間隔、最大1.5秒でstatusを読み、`set config + ok + 要求値一致`を完了条件とする。接続直後の設定取得はセンサー通知の開始後にbest-effortで行い、ライブデータ受信の成立条件に含めない。

### 3.13 OTA Control

ESP32のSoftAP OTAポータルを、BLE接続中に安全に準備・起動するための制御Characteristic。アプリはBLE経由で一時SSID、パスワード、HTTP upload token、SoftAP IPを受け取り、BLE切断後にユーザーがそのWi-Fiへ切り替えて `firmware.bin` を転送する。

このCharacteristicはESP32本体FW更新専用であり、STM32 FW更新やSDログ操作とは独立して扱う。SoftAP起動後はESP32 firmwareがBLEを停止するため、アプリは最後に取得したOTA session情報を保持してHTTP転送へ進む。

#### Write request

| Byte | 内容 | 型 | 説明 |
|------|------|-----|------|
| 0 | Operation | uint8 | `0=read`, `1=prepare_portal`, `2=activate_portal`, `3=stop_or_cancel` |

`prepare_portal` はBLE接続を維持したまま一時SSID、パスワード、purpose限定tokenを生成し、statusに公開する。通常/STM32 SoftAP SSIDは `ULSA-EVO-OTA-<hex3>`、Recoveryは既存Recovery prefix + `<hex3>`とし、`hex3`はsession token先頭3桁から生成する。直前sessionと同じsuffixになるtokenは再生成し、同じNode labelで毎回passwordだけが変わるiOS credential cache衝突を避ける。Node IDは任意表示ラベルとしてstatusに残すがSSIDには使わない。Initialだけは固定`ULSA-EVO-INITIAL`を維持する。`prepare_portal` を再実行した場合、ESP32は古い未起動sessionを破棄し、新しい資格情報を発行する。資格情報発行後は、アプリへ渡したSSIDと実際のSoftAP SSIDをsession中固定する。`activate_portal` はstatusをNotifyした後、短い待機を挟んでBLEを停止しSoftAP OTAポータルを開始する。アプリはcredential受理までのBLE peer/接続世代を照合するが、`activate_portal`後のBLE切断は期待される正常遷移とし、保持済みSSID/token/IPでWi-Fi接続とHTTP `/status` 確認へ進む。`stop_or_cancel` は準備中sessionを破棄し、SoftAP起動中はポータル停止要求として扱う。

#### Read / notify status

| Byte | 内容 | 型 | 説明 |
|------|------|-----|------|
| 0 | Protocol Version | uint8 | status protocol version |
| 1 | Last Operation | uint8 | 最後に受け付けた操作コード |
| 2 | Result | uint8 | `0=OK`, `1=QUEUED`, `2=BUSY`, `3=INVALID_LENGTH`, `4=INVALID_OP`, `5=UNAVAILABLE`, `6=FAILED` |
| 3 | OTA State | uint8 | ESP32 OTA manager state |
| 4 | Progress | uint8 | 転送進捗 `0..100` |
| 5 | Flags | uint8 | bit0: portal active, bit1: updating, bit2: has credentials, bit3: error |
| 6-9 | Uploaded Bytes | uint32 (LE) | HTTP OTAで受信済みのbyte数 |
| 10-13 | Total Bytes | uint32 (LE) | HTTP OTAの総byte数。不明時0 |
| 14-17 | Remaining Seconds | uint32 (LE) | SoftAPポータル自動停止までの残秒数 |
| 18 | Node ID | uint8 | SoftAP SSID表示に使った任意ラベル（security bindingではない） |
| 19 | SSID Length | uint8 | 後続SSID文字列長 |
| 20 | Password Length | uint8 | 後続password文字列長 |
| 21 | Token Length | uint8 | 後続HTTP token文字列長 |
| 22 | IP Length | uint8 | 後続IP文字列長 |
| 23.. | Strings | UTF-8 | SSID、password、token、IPをこの順に連結 |

ブラウザ版とCapacitor/iOS版は同じBLE payloadを使う。現行アプリは非空のSSID/token/IPを持つsessionを受理し、Node IDは欠落、`0`、重複、BLE/HTTP間の不一致があっても転送可否に使わない。差異を表示する場合は非blocking warningとする。ブラウザ版ではWeb Bluetoothでsessionを取得し、OSのWi-Fi設定でSoftAPへ切り替えた後、アプリ画面から `http://<ip>/doUpdate?token=<token>` へmultipart uploadする。iOS版は `joinOnce=true`の`NEHotspotConfiguration`で更新用Wi-Fiへの接続を要求する。`apply`前に同一SSID設定を削除せず追加/更新し、`alreadyAssociated`を成功としてHTTP確認へ進める。Native errorはreason/domain/codeを保持し、`userDenied`は自動再applyしない。`pending`、`systemConfiguration`、`internal`、`unknown`だけ同一sessionで最大1回再試行する。STM32 flowではerror後も2.5秒上限のtoken付き`/stm32/status`を1回確認し、session/release一致で到達した場合だけ接続済みとして扱う。到達しなければ原因別案内と、BLE切断後も保持sessionで使える明示Step 2再試行を表示する。重複join要求はNative呼出し前に拒否し、無限loopや二重ダイアログを作らない。

ESP32側はHTTP `/status?token=<token>` と `/doUpdate?token=<token>` を公開する。アプリはiOSのWi-Fi接続要求成功だけでは転送許可せず、purpose限定tokenで`/status?token=<token>` が成功し、BLE sessionと同じSSIDを返し、かつ `portalActive` または `updating` が真であることを確認してから `/doUpdate` へ進む。`nodeId`はABI/表示用であり、欠落や不一致を転送の拒否理由にしない。token不一致、SSID不一致、`.bin` 以外、OTA領域不足、Update API失敗はアップロード前後で拒否し、statusのerror flagまたはHTTP errorとしてアプリへ返す。

旧firmwareでCharacteristicが存在しない場合、アプリはOTA UIを未対応表示にし、通常のBLE接続、計測表示、SDログ操作は継続する。

#### Protocol v3 consumer contract

EVO_APPは物理ボタン認可を追加するESP32 OTA Control v3を先行実装する。v3は23byte headerと文字列offsetを変更せず、result `7=authorizationRequired`、`8=authorizationExpired`、`9=peerConflict`、flag bit4=`physicalAuthRequired`、bit5=`physicalAuthGranted`、bit6=`recoveryPortal`を追加する。

`prepare_portal`が`authorizationRequired`を返した場合、アプリはcredential長0を必須とし、簡潔な本体操作ガイドを表示する。ガイドは一度に一操作だけを示し、ESP32／STM32とも白のLED図と「白に変わったら離す」を主表示にする。firmwareの認可閾値は3秒である。要求前からのpre-holdやtimeout／再prepareをまたぐholdは認可されない。notifyまたは1秒read pollで`prepare_portal + ok + physicalAuthGranted + hasCredentials`を確認するまで`activate_portal`へ進まない。認可後に更新用AP接続が完了した状態の本体LEDは、ESP32／STM32ともオレンジに統一する。認可前disconnect、timeout、peer conflict、予約bit、認可前credentialsはfail-closedとする。byte単位の正本はESP32 repositoryの`docs/EVO_APP_OTA_COMPATIBILITY_CONTRACT.md`である。

v1/v2 firmwareは移行対象としてparser互換を維持するが、「旧FW・物理認可なし」を表示し、更新開始時に明示確認する。新appを先行配信してからv3 firmwareを公開する。

#### Initial→Demo（BLEなし）

Initial profileはBLE serviceを持たない。EVO_APPは初回起動時、ユーザー向けの内部profile名や「工場出荷時の状態」という見出しを使わず、「アプリ接続にはファームウェア更新が必要」と案内する。説明本文では、開梱時のULSA EVOに基本機能のみの「工場出荷ファーム」が入っており、アプリ連携によるワイヤレス接続やログ機能には「デモファームウェア」のインストールが必要なことを伝える。製品画像はランディングページと同じものを使い、架空の梱包箱や筐体図を表示しない。開始前に、(1)これからインストールするのは評価・開発用デモファームウェアであること、(2)ファームウェアおよび計測アプリの完全な動作は保証しないこと、(3)インストールや利用に起因する不具合・損害は補償できないこと（適用法令上免責できない責任を除く）、(4)ファームウェアおよび計測アプリのソースコードは公開され、各ライセンスの条件に従って自由に確認・改善・改変できること、の4項目を個別checkboxで確認し、全項目が選択されるまで開始操作を無効にする。4項目は左揃え、説明本文は中央揃えとする。初回セットアップウィザード内で、正式な`ulsa-evo-esp32-demo-firmware.bin`の取得とRelease SHA-256／埋込みidentity検査、白LEDまでのボタン操作、Initial SoftAP接続、転送進捗、Demo BLE identity確認までを一つの流れとして完結させる。設定の「情報」から同じガイドを再表示できる。

InitialとDemoのESP32 OTA操作は「通常表示のまま押し続け、白の点灯へ変わったら離す」に統一する。ウィザードはiPhoneでも画面全体を占有せず、四辺に余白を残した中央ポップアップとする。背景と本文色をモーダル内で明示し、通常本文4.5:1以上、操作境界3:1以上のcontrastを維持する。`次回から表示しない`は常時見える固定footerのチェック欄とする。チェック状態は変更時に端末内localStorageへ保存し、インストール開始、右上の閉じる、dismiss可能な状態でのbackdrop dismissのいずれで案内画面を離れても次回起動時に表示しない。チェックを外した場合は保存設定を解除する。storage利用不可、アプリ再インストール時は初回案内を再表示する。設定の「情報」からの手動再表示は常に可能とする。

InitialはI2C計測中の3000–5999 msのreleaseで固定`ULSA-EVO-INITIAL`、固定WPA2、一台限定、300秒timeoutのSoftAPを起動する。Bridge／Command中は2秒以上のreleaseでI2C計測へ戻り、3秒を超えてもDemo導入を起動しない。iOS版は自動接続し、Web版はLocal Network Access対応Chromiumで手動Wi-Fi切替を行う。アプリは`POST /initial/ota-session`をartifact identityとclient nonceでclaimし、返されたtokenを既存`/status`と`/doUpdate`へ使用する。InitialのNode ID 0は個体識別に使わず、周囲で一台だけを更新モードにする。


### 3.14 STM32 Update Control

アプリからESP32の共通SoftAP基盤を起動し、`/stm32/*` HTTP endpointでSTM32 FW packageを転送・書込みするための制御Characteristic。STM32更新専用の別SoftAP/別キャプティブポータルは作らず、ESP32自身の `OTA Control` と同じSoftAP、DNS、WebServer、token/password基盤を使う。混同は `purpose=stm32_update`、専用BLE Characteristic、専用HTTP endpoint、専用UI、package形式で防ぐ。

#### Write request

| Byte | 内容 | 型 | 説明 |
|------|------|-----|------|
| 0 | Operation | uint8 | `0=read`, `1=prepare_portal`, `2=activate_portal`, `3=stop_or_cancel` |

`prepare_portal` はtargetとreleaseTagを持つ拡張requestを受理する。現行アプリはtarget/releaseTagを必須で送り、BLEでNode ID labelを取得できている場合だけ旧ESP32とのwire互換のためbit0/byte 2にも載せる。取得できない場合はflags `0x06`のまま送信できる。expected Node IDの指定の有無または一致をsessionの認可・転送・書込み条件にしない。

| Byte | 内容 | 型 | 説明 |
|------|------|-----|------|
| 0 | Operation | uint8 | `1=prepare_portal` |
| 1 | Flags | uint8 | bit0: legacy expectedNodeIdあり（表示用）、bit1: targetあり、bit2: releaseTagあり |
| 2 | Expected Node ID | uint8 | 旧ABIの表示ラベル。bit0が立つ時だけ有効で、security bindingには使わない |
| 3 | Target Length | uint8 | target UTF-8 byte length、最大32 |
| 4 | ReleaseTag Length | uint8 | releaseTag UTF-8 byte length、最大64 |
| 5.. | Strings | UTF-8 | target、releaseTagをこの順に連結 |

`prepare_portal` はBLE接続を維持したまま、STM32更新用の共通SoftAP sessionを作成し、target/releaseTagを`purpose=stm32_update`の短寿命session tokenへ束縛する。アプリはprepare応答まではBLE peer/接続世代の一致を要求する。`activate_portal`後はESP32 firmwareがBLEを停止するため、その切断を正常遷移とし、直前に受け取ったSSID、password、token、IPでHTTP後段を継続する。node IDはstatus/SSID/表示用に保持できるが、live BLE接続もnode IDも後段の必須条件にしない。

#### Read / notify status

Status payloadはESP32 OTA Control v2互換の23byte headerを使う。標準`protocolVersion`はphysical authorization対応の`0x03`、`0x02`はlegacy migrationとし、Node IDはABI互換の表示ラベルとしてbyte 18に残す。SSID/password/token/IPのlengthと文字列順もOTA Controlと同じである。アプリは共通parserを使うが、このCharacteristicから得たsessionはSTM32更新専用として扱い、ESP32 firmware uploadには使わない。

v3ではESP32 OTA Controlと同じphysical authorization result／flagを使用する。アプリはSTM32 packageを先に取得し、target/releaseTagを持つextended prepare requestを送った後、本体ボタン認可が完了するまでcredentialを受理しない。認可後はpurpose限定session token、target、releaseTagのbindingを維持する。

STM32 FW packageは必ず通常ネットワーク中に取得する。SoftAP接続後、アプリはbackendやGitHubへアクセスせず、事前取得済み `.ulsa-stm32pkg` をESP32 `/stm32/package` へ送る。download-token APIの旧フィールド名`deviceId`/`sessionId`にはdownloadごとのランダムな一時correlation IDを使い、Node ID、BLE peripheral UUID、MAC等を送信しない。Workerは非空かつtoken発行/download間で同一の値だけを要求する。標準field packageは署名付きAES-256-GCM暗号v3であり、ESP32は復号せずscratchへ保存・stream検証する。`/stm32/status` はHTTP JSONに `nodeId`、`sessionBound`、`sessionExpectedNodeId`、`sessionTarget`、`sessionReleaseTag`、`packageBytes`、`packageSha256`を返すが、`nodeId`/`sessionExpectedNodeId`はABI/表示情報だけである。検証済みpackageでは`packageSha256`を64桁hex、packageなしでは`null`とし、アプリはpurpose限定session、target/releaseTag、catalogのSHA-256/sizeと実packageを照合し、署名/package検証が完了するまで次へ進まない。status、write、package、cancel、sync-probeの全responseは同じruntime schema validatorを通し、partial／malformed responseを完了やcache削除の根拠にしない。

通常更新UIはESP32／STM32共通の「準備／本体操作／更新」ウィザードとする。「更新を準備」からdownload、物理認可、Wi-Fi接続、STM32 package転送と非消去probeを順に実行し、準備完了後の「更新を開始」だけを別の明示操作とする。接続専用の別ガイドや5個の手動操作ボタンは表示しない。`/stm32/sync-probe`はv3でBOOT0 LOW／8N1のULSB `HELLO`、legacy v2 debugでBOOT0 HIGH／8E1のAN3155 syncを行い、どちらもerase/writeせず通常起動へ戻す。probe成功はpurpose限定session token、release target/tag、catalog package SHA-256とpackage sizeへbindした非永続stateだけに保持する。hook内のgeneration、ref mutex、AbortControllerで同tick二重操作とbinding変更後の遅延responseを拒否し、token/target/release/package変更、失敗、再読込、アプリ再起動でproofを失効する。ただし`activate_portal`による期待済みBLE切断やNode ID変更だけではproof/後段を無効化しない。`/write`直前にstatusを再読取りし、同じbinding、実statusのpackage SHA/size、`bootloaderSyncOk=true`が揃った場合だけ明示書込みを許可する。`recovery_required`に残った古い`bootloaderSyncOk`はproofとして再利用せず、毎回再probeする。HTTP 409のsync-probeはbodyが正しいstatusでも成功proofを作らない。

#### 更新中のLED表示契約

ESP32更新とSTM32更新は、同じ更新ステータスで同じLED色を表示する。対象ファームウェア名によって色を分けない。

| 状態 | LED表示 |
|---|---|
| 物理認可待ち | 黄色点滅 `#FFDC00`、500 ms |
| 3秒確認済み／Ready／SoftAP association待ち | 白常時点灯 `#FFFFFF` |
| Portal／package・firmware転送 | オレンジ点滅 `#FF6400`（転送進捗で260/160/90 ms） |
| Writing／verify | マゼンタ点滅 `#FF28A0`、90 ms |
| Error／`recovery_required` | 赤紫点滅 `#FF1450`、500 ms。書込み復旧要求／エラーを示す |
| Recovery portal | 淡橙点滅 `#FFB43C`、900 ms。boot-heldで復旧ポータルを待機中。赤紫の`recovery_required`とは別状態 |

アプリは色だけを成功判定に使わず、BLE／HTTP statusと更新phaseを正本とする。

`POST /stm32/cancel`の書込み前成功は、ESP32が`stm32pkg` partition全体を物理eraseし、`phase=idle`／packageなしのstatusをHTTP 200で返した後、250msのgraceを経てSTM32用portalを停止する。erase失敗は409と明示errorを返し、portalを停止しない。portal timeout/停止は`receiving`、`package_stored`、`verifying`、`ready_to_write`、書込み前`error`のscratchを同様に破棄するが、`recovery_required`と書込み実行中は保持する。アプリはcancel成功時だけdownload済みpackage/sessionを消去し、join-once設定をbest-effortで削除して通常Wi-Fi/BLE再接続を案内する。5秒timeoutやmalformed responseでは結果不明としてpackageを保持し、status再確認へ戻す。HTTPが届かなくても通常BLEが復帰した場合は、通常Wi-Fiへ戻しBLE再接続後にSTM32 Update Controlを再読取りしてportal終了を確認する。

旧firmwareでCharacteristicが存在しない場合、アプリはSTM32 FW更新UIを未対応表示にし、ESP32 OTA、通常BLE接続、計測表示、SDログ操作は継続する。

### 3.15 Reset Control

ESP32本体またはSTM32側を、BLE接続中に個別リセットするための制御Characteristic。ESP32 firmwareはwrite callback内で直接リセットせず、要求をメインループ側へ渡してから実行する。

STM32リセットはSTM32 FWの公開I2Cレジスタ/コマンドではない。ESP32が持つBOOT0/NRST制御のうち通常起動側のリセット経路を使い、STM32を通常モードで再起動する。ESP32リセットは `ESP.restart()` を実行するため、BLE接続は切断される。

#### Write request

| Byte | 内容 | 型 | 説明 |
|------|------|-----|------|
| 0 | Operation | uint8 | `0=read`, `1=reset_esp32`, `2=reset_stm32` |

#### Read / notify status

| Byte | 内容 | 型 | 説明 |
|------|------|-----|------|
| 0 | Protocol Version | uint8 | status protocol version |
| 1 | Last Operation | uint8 | 最後に受け付けた操作コード |
| 2 | Result | uint8 | `0=OK`, `1=QUEUED`, `2=BUSY`, `3=INVALID_LENGTH`, `4=INVALID_OP`, `5=UNAVAILABLE`, `6=FAILED` |
| 3 | Flags | uint8 | bit0: ESP32 reset pending, bit1: STM32 reset pending, bit2: ESP32 rebooting, bit3: STM32 resetting |
| 4 | Target | uint8 | `0=none`, `1=ESP32`, `2=STM32` |
| 5 | Reserved | uint8 | 現在0 |

アプリは設定ドロワーのデバイスカテゴリに、STM32リセットとESP32再起動を別ボタンで表示する。ESP32再起動ではBLE切断が正常動作なので、write成功後のreadが切断で失敗した場合でも、ユーザーには再起動要求送信済みとして扱う。STM32リセット後はSTM32 FW VersionとDevice Healthを再読込する。

旧firmwareでCharacteristicが存在しない場合、アプリはリセットUIを未対応表示にし、通常のBLE接続と計測表示は継続する。

### 3.16 Device Mode

ESP32自身の動作モードを示す読み取り専用ステータス。STM32 I2C slaveの検出状態や設定値とは別のESP32ローカル状態として扱う。

WiFiポータル中およびSTM32ブートローダー中はESP32 firmwareがBLEを停止するため、通常はBLE接続後に読み取れない。アプリはこのCharacteristicが読めないことをI2C設定非対応とはみなさない。

| Byte | 内容 | 型 | 説明 |
|------|------|-----|------|
| 0 | Protocol Version | uint8 | status protocol version |
| 1 | Mode | uint8 | `0=UART計測`, `1=I2C計測`, `2=COMMAND`, `3=UARTブリッジ`, `4=WiFiポータル`, `5=STM32 bootloader`, `6=STM32 update` |
| 2 | Flags | uint8 | bit0: BLE connected, bit1: UART bridge, bit2: I2C measure, bit3: command, bit4: bootloader, bit5: WiFi portal, bit6: STM32 update |
| 3 | PHY互換値 | uint8 | 現行Releaseは常に`0=1M`。非`0`は予約値／非対応 |

byte 3はprotocol v1の4 byte payloadを維持するための互換フィールドであり、controllerから読んだ動的なlink状態ではない。Coded PHY／Long Rangeは現行製品で実装せず、アプリは非`0`値を予約値として表示する。

アプリは接続直後に1回読み取り、Notifyを購読できる場合は状態変化を即時反映する。接続中はReadの短周期ポーリングもバックアップとして継続する。

設定ドロワーでは通常表示をラベル化したモードに絞り、`ESP32モード詳細` を開くと実機切り分け用に `protocol version`、`mode code`、`flags`、`phy code` の生値も確認できる。

BLE切断後も、アプリは最後に取得できたDevice Modeを「最終観測」として保持する。接続中の短周期Readが一時的に失敗した場合も、最後の観測値は消さない。これはBLE停止後の現在値を保証するものではなく、再接続、Notify、または手動更新で次の観測値に置き換わる。

ReadとNotifyのどちらも利用できない場合、アプリはDevice Mode未取得として表示する。この状態はSTM32 I2C slaveの未検出とは別に扱い、Device Mode Characteristic公開、Read/Notify権限、BLE接続状態を確認対象として示す。

### 3.17 STM32 Firmware Version

ESP32がSTM32 I2C slaveの`FIRMVER`と`FWREV`を読み取り、BLEへ公開するprotocol v2専用の読み取りステータス。接続直後に1回読み取り、画面上の手動更新でも同じCharacteristicをReadする。旧CalVer／protocol v1は未出荷前の移行完了により受理しない。

| Byte | 内容 | 型 | 説明 |
|------|------|-----|------|
| 0 | Protocol Version | uint8 | status protocol version |
| 1 | Flags | uint8 | bit0: ESP32 I2C clientあり, bit1: STM32検出済み, bit2: FW version read成功 |
| 2 | Local I2C Error | uint8 | ESP32 I2C client error code |
| 3 | Remote REG_VERSION | uint8 | STM32 I2C register map version |
| 4-7 | STM32 FIRMVER | uint32 (LE) | versionCode `0x7E MM mm pp` |
| 8-11 | STM32 FWREV | uint32 (LE) | artifact識別・更新履歴用の正のrevision |



### 3.18 I2C Config Control

ESP32 が STM32 の I2C slave 設定レジスタへアクセスするための制御キャラクタリスティック。設定変更は一度 STM32 側の未保存draftへ反映され、永続化には `SAVE_CONFIG` が必要。

#### Write request

| Byte | 内容 | 型 | 説明 |
|------|------|-----|------|
| 0 | Operation | uint8 | 操作コード |
| 1 | Value | uint8 | set系操作のみ付与 |

| Operation | Code | Value |
|-----------|------|-------|
| READ_CONFIG | `0x00` | なし |
| SET_NODE_ID | `0x10` | `0..255` |
| SET_AVG_CYCLE | `0x11` | `1/4/8/16/32/64` |
| SET_WIND_MODE | `0x12` | `0=Normal`, `1=Inverted` |
| SET_I2C_ADDR | `0x13` | `0x08..0x77` |
| SAVE_CONFIG | `0x20` | なし |
| DISCARD_CONFIG | `0x21` | なし |
| RESTORE_DEFAULTS | `0x22` | なし |
| CLEAR_ERROR | `0x23` | なし |

#### Read / notify status

BLE readはESP32が最後に公開したstatusを返す。STM32から最新のI2C設定値を取得したい場合は、クライアントが `READ_CONFIG` (`0x00`) をwriteし、ESP32側のI2C request queueで処理された後のstatusを読む。アプリの接続直後および更新ボタンはこの `READ_CONFIG` writeを使う。

| Byte | 内容 | 型 | 説明 |
|------|------|-----|------|
| 0 | Protocol Version | uint8 | status protocol version |
| 1 | Last Operation | uint8 | 最後に処理した操作コード |
| 2 | Result | uint8 | `0=OK`, `1=QUEUED`, `2=BUSY`, `3=INVALID_LENGTH`, `4=INVALID_OP`, `5=UNAVAILABLE`, `6=I2C_FAILED`, `7=UNSUPPORTED`。`QUEUED`だけが非終端。`BUSY`は別操作が要求slotを使用中のため今回要求を受理しなかった終端結果 |
| 3 | Remote CMD_STATUS | uint8 | STM32 I2C command status |
| 4 | Remote LAST_ERROR | uint8 | STM32 I2C last error |
| 5 | Config Flags | uint8 | STM32 I2C config flags |
| 6 | CFG_NODE_ID | uint8 | 未保存draftを含むNode ID |
| 7 | CFG_AVG_CYCLE | uint8 | 未保存draftを含む平均回数 |
| 8 | CFG_WIND_DIR_INSTALL_MODE | uint8 | `0=Normal`, `1=Inverted` |
| 9 | CFG_I2C_ADDR | uint8 | 未保存draftを含むI2C address |
| 10 | I2C_SLAVE_ENABLED | uint8 | read-only mirror |
| 11 | MEAS_INTERVAL_MS | uint8 | read-only |
| 12 | Local I2C Error | uint8 | ESP32側I2C client error |
| 13 | Remote REG_VERSION | uint8 | STM32 I2C register version |
| 14 | Current Target I2C Address | uint8 | ESP32が現在通信しているI2C address |
| 15 | Status Flags | uint8 | bit0: reboot required, bit1: detected, bit2: config write supported |
| 16 | ESP32 Operation Sequence | uint8 | v2のみ。BLE操作受付時に増加し、queuedからterminalまで同じ値 |
| 17 | STM32 Command Result Sequence | uint8 | v2のみ。STM32 `CMD_RESULT_SEQ (0x13)` の最新値 |

I2C address と風向取付モードは `SAVE_CONFIG` 後の再起動で反映される。`I2C_SLAVE_ENABLED`、UART設定、製品情報、シリアル、較正値はBLE経由の変更対象外。


早期起動異常ではSTM32が既定アドレス`0x50`で読取り専用応答を返す。ESP32は`Remote LAST_ERROR`をBLEへ転送し、アプリは`0x0E..0x10`を具体的な起動異常として表示する。これらの状態ではremote register versionが設定write対応値でも、アプリのI2C書込み操作を無効化する。

status protocol v2は18バイトで、byte `0..15` のv1配置を変更しない。アプリはwrite前のoperation sequenceを記録し、対象operation、terminal result、operation sequence変化の3条件で今回の完了を確定する。BLE operation resultでは`QUEUED`だけを処理継続中とし、`BUSY`を含むその他のresultは今回要求の終端結果として扱う。STM32 `REG_VERSION >= 0x08` ではESP32も `CMD` 書込み前後の `CMD_RESULT_SEQ` 変化を確認する。旧STM32またはstatus protocol v1では、従来のBUSY/DIRTY/status整合へフォールバックする。

要求本体のreadbackまたはcommand世代確認が成功した後、表示更新用の設定ブロック再読出しだけが失敗した場合、ESP32はbyte `3..11`の確認済み値を`0`へ消去しない。アプリはterminal resultを操作結果、Local I2C Errorを後続診断結果として別々に表示する。

#### 三者互換表

| STM32 I2C register | ESP32 I2C Config Status | アプリclient対応版 | アプリ動作 |
|--------------------|-------------------------|--------------------|------------|
| `0x06..0x07` | v1 16バイト、またはv2 18バイト | I2C Config client contract v2 | 世代番号なしの従来status/flags照合へフォールバック |
| `0x08` 以降 | v2 18バイト | I2C Config client contract v2 | ESP32はSTM32 `CMD_RESULT_SEQ`、アプリはESP32 operation sequenceで今回のterminal結果を照合 |

現在のWebアプリとCapacitor/iOSアプリは同じparser、イベント型、timeout規則を使い、v1/v2の両statusを受理する。

---

## 4. ソフトウェアアーキテクチャ

### 4.1 ファイル構成

```
src/
├── types/
│   └── ble.ts              # BLE関連の型定義
├── services/
│   └── ble/
│       ├── IBLEAdapter.ts          # Web/Capacitor共通インターフェース
│       ├── WebBLEAdapter.ts        # Web Bluetooth実装
│       ├── CapacitorBLEAdapter.ts  # iOS/Android実装
│       ├── BLEAdapterFactory.ts    # 実行環境ごとのadapter選択
│       ├── bleConstants.ts         # BLE UUID source of truth
│       └── bleDataParser.ts        # characteristic parser
├── hooks/
│   └── useBLE.ts           # React Hook
├── components/
│   ├── BLEModal.tsx        # BLE接続専用モーダルUI
│   ├── BLESettingsDrawer.tsx       # 設定/診断ドロワーUI
│   ├── BLESettingsDrawerBridge.tsx # useBLE state/callbackの受け渡し
│   └── BLEModal.css        # モーダルスタイル
└── pages/
    ├── Dashboard.tsx       # メイン画面（BLE統合）
    └── Dashboard.css       # ダッシュボードスタイル
```

### 4.2 モジュール依存関係

```
Dashboard.tsx
    ├── useBLE (hook)
    │   └── IBLEAdapter
    │       ├── WebBLEAdapter
    │       └── CapacitorBLEAdapter
    ├── BLEModal (component)
    ├── BLESettingsDrawerBridge (component)
    │   └── BLESettingsDrawer (component)
    └── services/ble/bleConstants (UUID source of truth)
```

---

## 5. UUID定数 (services/ble/bleConstants.ts)

`src/services/ble/bleConstants.ts` を UUID の source of truth とする。docs 側の UUID を変更する場合も、必ずコード側の定数と合わせる。

```typescript
export const SERVICE_UUIDS = {
  ENVIRONMENTAL_SENSING: '0000181a-0000-1000-8000-00805f9b34fb',
  CURRENT_TIME: '00001805-0000-1000-8000-00805f9b34fb',
  DEVICE_INFORMATION: '0000180a-0000-1000-8000-00805f9b34fb',
  ULSA_WIND: 'e147a12a-67ff-4249-930b-c35d372ba000',
} as const;

export const CHARACTERISTIC_UUIDS = {
  APPARENT_WIND_DIRECTION: '00002a73-0000-1000-8000-00805f9b34fb',
  APPARENT_WIND_SPEED: '00002a72-0000-1000-8000-00805f9b34fb',
  TEMPERATURE: '00002a6e-0000-1000-8000-00805f9b34fb',
  CURRENT_TIME: '00002a2b-0000-1000-8000-00805f9b34fb',
  FIRMWARE_REVISION: '00002a26-0000-1000-8000-00805f9b34fb',
  MANUFACTURER_NAME: '00002a29-0000-1000-8000-00805f9b34fb',
  MODEL_NUMBER: '00002a24-0000-1000-8000-00805f9b34fb',
  SOUND_SPEED: 'e147a12a-67ff-4249-930b-c35d372ba001',
  HEADING_SPEED: 'e147a12a-67ff-4249-930b-c35d372ba002',
  WIND_AXIS_SPEEDS: 'e147a12a-67ff-4249-930b-c35d372ba015',
  SENSOR_STATUS: 'e147a12a-67ff-4249-930b-c35d372ba003',
  SD_STATUS: 'e147a12a-67ff-4249-930b-c35d372ba004',
  I2C_CONFIG_CONTROL: 'e147a12a-67ff-4249-930b-c35d372ba005',
  DEVICE_MODE: 'e147a12a-67ff-4249-930b-c35d372ba006',
  STM32_FIRMWARE_VERSION: 'e147a12a-67ff-4249-930b-c35d372ba007',
  SD_LOG_CONTROL: 'e147a12a-67ff-4249-930b-c35d372ba008',
  SAMPLE_METADATA: 'e147a12a-67ff-4249-930b-c35d372ba009',
  DEVICE_HEALTH: 'e147a12a-67ff-4249-930b-c35d372ba00a',
  CAPABILITIES: 'e147a12a-67ff-4249-930b-c35d372ba00b',
  SD_LOG_DETAIL: 'e147a12a-67ff-4249-930b-c35d372ba00c',
  SD_LOG_SETTINGS: 'e147a12a-67ff-4249-930b-c35d372ba00d',
  DEVICE_IDENTIFY: 'e147a12a-67ff-4249-930b-c35d372ba00e',
  LED_BRIGHTNESS: 'e147a12a-67ff-4249-930b-c35d372ba00f',
  LED_WIND_REACTIVE: 'e147a12a-67ff-4249-930b-c35d372ba018',
  OTA_CONTROL: 'e147a12a-67ff-4249-930b-c35d372ba010',
  STM32_UPDATE_CONTROL: 'e147a12a-67ff-4249-930b-c35d372ba016',
} as const;
```

### 5.2 主要インターフェース

```typescript
// 接続状態
type BLEConnectionState = 'disconnected' | 'scanning' | 'connecting' | 'connected';

// センサーデータ
interface SensorData {
  windDirection: number;  // 度
  windSpeed: number;      // m/s
  temperature: number;    // ℃
  boardTemperature: number | null; // STM32基板温度。未対応/無効時null
  soundSpeed: number;     // m/s
  headingSpeed: number;   // 正面風速成分（m/s、+ は向かい風、- は追い風）
  sensorStatus: number;
  timestamp: number;      // BLE受信時刻(ms)。firmware timestampではない
}

type SensorNotificationEvent = {
  changedField: 'windDirection' | 'windSpeed' | 'temperature' | string;
  latestSnapshot: SensorData;
  receivedAt: number;
};

// デバイス情報
interface DeviceInfo {
  firmwareRevision: string;
  manufacturerName: string;
  modelNumber: string;
}

// SDカード状態
interface SDStatus {
  cardState: number;    // 0=未初期化, 1=カードなし, 2=エラー, 3=準備完了, 4=記録中
  usagePercent: number; // 使用率 (%)
  freeSpaceMB: number;  // 空き容量 (MB)
  totalSpaceMB: number; // 総容量 (MB)
  usedSpaceMB: number;  // 使用容量 (MB)
  cardTypeCode: number; // 0=None, 1=Unknown, 2=MMC, 3=SD, 4=SDHC/SDXC
  cardType: 'none' | 'unknown' | 'mmc' | 'sd' | 'sdhc';
}
```

---

## 6. BLE adapter (services/ble/)

### 6.1 主要メソッド

| メソッド | 説明 | 戻り値 |
|---------|------|--------|
| `initialize()` | BLEを初期化 | `Promise<void>` |
| `isSupported()` | BLEサポート確認 | `boolean` |
| `scanAndSelect()` | デバイス選択。Webではブラウザ標準UIを使う | `Promise<BLEDevice \| null>` |
| `scanDevices(onDeviceFound)` | デバイス一覧スキャン。Capacitor pathで使用。Native iOS/Androidでは検出数が1台でも自動接続せず、UI上の明示選択で接続する | `Promise<BLEDevice[]>` |
| `connect(deviceId, onDisconnect)` | デバイス接続 | `Promise<void>` |
| `identifyDevice(deviceId)` | Device Identify write。Nativeでは候補へ一時接続してLED識別後に切断し、通常接続状態へは遷移しない | `Promise<void>` |
| `disconnect()` | デバイス切断 | `Promise<void>` |
| `startSensorNotifications(callback)` | 必須センサー通知開始 | `Promise<NotificationStartResult>` |
| `getParseErrorStats()` | notify payload parse failure の件数と最新エラー取得 | `{ count, lastError }` |
| `getDeviceInfo()` | デバイス情報取得 | `Promise<DeviceInfo>` |
| `getCapabilitiesStatus()` | BLE機能対応表取得。非対応時はnull | `Promise<BLECapabilitiesStatus \| null>` |
| `getLedBrightness()` | LED輝度取得。非対応時はnull | `Promise<LEDBrightnessStatus \| null>` |
| `setLedBrightness(brightness)` | LED輝度設定。ESP32側でNVS保存され、再起動後も保持 | `Promise<LEDBrightnessStatus \| null>` |
| `getOtaControlStatus()` | ESP32 SoftAP OTA session/status取得。非対応時はnull | `Promise<OtaControlStatus \| null>` |
| `writeOtaControl(op)` | ESP32 SoftAP OTA session準備、ポータル起動、停止/破棄操作 | `Promise<OtaControlStatus \| null>` |
| `getDeviceResetStatus()` | ESP32/STM32 Reset Control状態取得。非対応時はnull | `Promise<DeviceResetStatus \| null>` |
| `resetDevice(target)` | `esp32` または `stm32` を個別にリセット。ESP32対象ではBLE切断が正常 | `Promise<DeviceResetStatus \| null>` |
| `getSDStatus()` | SDステータス取得 | `Promise<SDStatus \| null>` |
| `getSDLogControlStatus()` | SDログ制御ステータス取得。非対応時はnull | `Promise<SDLogControlStatus \| null>` |
| `getSDLogDetailStatus()` | SDログ詳細ステータス取得。非対応時はnull | `Promise<SDLogDetailStatus \| null>` |
| `getSDLogSettingsStatus()` | SDログ周期・次回起動時の内部ログ自動開始設定ステータス取得。非対応時はnull | `Promise<SDLogSettingsStatus \| null>` |
| `setSDLogging(enabled)` | SDログ開始/停止操作 | `Promise<SDLogControlStatus \| null>` |
| `writeSDLogSettings(request)` | SDログ周期または次回起動時の内部ログ自動開始設定操作。出力周期未取得は `SOURCE_INTERVAL_UNKNOWN`、非整数倍は `INTERVAL_NOT_ALIGNED`、自動開始値が0/1以外なら `INVALID_VALUE` | `Promise<SDLogSettingsStatus \| null>` |
| `getDeviceModeStatus()` | ESP32動作モード取得。非対応またはBLE停止状態ではnull | `Promise<DeviceModeStatus \| null>` |
| `startDeviceModeNotifications(callback)` | ESP32動作モードNotify開始。Characteristicが存在し、Notify開始できた場合true | `Promise<boolean>` |
| `stopDeviceModeNotifications()` | ESP32動作モードNotify停止 | `Promise<void>` |
| `getI2cConfigStatus()` | 最後に公開されたI2C設定ステータス取得。非対応時はnull | `Promise<I2cConfigStatus \| null>` |
| `writeI2cConfig(request)` | I2C設定操作。`{ op: 'read' }` でSTM32から最新設定を取得し、queued/busy時は短時間pollして最終statusを返す | `Promise<I2cConfigStatus \| null>` |
| `getRtcTimezoneStatus()` | RTCのUTC、zone ID、offset、TZDB、NVS状態を専用Characteristicから取得。未対応はnull | `Promise<RtcTimezoneStatus \| null>` |
| `writeRtcTimezone(request)` | `SET_ZONE`または`SYNC_UTC_AND_ZONE`を送信し、generationが更新された終端statusを返す | `Promise<RtcTimezoneStatus \| null>` |

接続成立条件は標準計測CharacteristicのNotifyを1つ以上開始できることだけとする。標準Notify開始後、Device Info、FW版、Device Mode、診断、SD、RTC、I2C設定の初期取得はWeb/Capacitor共通hookが独立タスクとして同時に開始する。各タスクは2.5秒でtimeoutし、1タスクの未応答が別タスクの開始、標準計測の`LIVE`遷移、風速基準のグラフ/CSV追加を止めない。切断または再接続で接続世代が変わった場合、旧世代のRead結果とNotify callbackは破棄する。

### 6.2 データパーサー

```typescript
// 風向解析 (0.01°単位)
export const parseWindDirection = (value: DataView): number => {
  // byteLength guard と 0..360 deg の値域検証を行う
  return readUint16LE(value, 0) * 0.01;
};

// 風速解析 (0.01 m/s単位)
export const parseWindSpeed = (value: DataView): number => {
  // byteLength guard と合理上限の値域検証を行う
  return readUint16LE(value, 0) * 0.01;
};

// A/B方向風速解析 (0.01 m/s単位、符号付き)
export const parseWindAxisSpeeds = (value: DataView) => ({
  windSpeedA: readInt16LE(value, 0) * 0.01,
  windSpeedB: readInt16LE(value, 2) * 0.01,
});

// 温度解析 (0.01℃単位、符号付き)
export const parseTemperature = (value: DataView): number => {
  // byteLength guard と温度範囲の値域検証を行う
  return readInt16LE(value, 0) * 0.01;
};
```

短い DataView や値域外データは `BLEParseError` として扱い、adapter はその sample だけを破棄して接続は維持する。

---

## 7. React Hook (hooks/useBLE.ts)

### 7.1 戻り値インターフェース

```typescript
interface UseBLEReturn {
  // 状態
  connectionState: BLEConnectionState;
  connectedDevice: BLEDevice | null;
  availableDevices: BLEDevice[];
  sensorData: SensorData | null;
  dataState: 'idle' | 'waiting' | 'live' | 'stale';
  lastSensorDataAt: number | null;
  deviceInfo: DeviceInfo | null;
  capabilitiesStatus: BLECapabilitiesStatus | null;
  capabilitiesLastReadAt: number | null;
  ledBrightnessStatus: LEDBrightnessStatus | null;
  ledBrightnessSupported: boolean | null;
  ledBrightnessBusy: boolean;
  ledWindReactiveStatus: LEDWindReactiveStatus | null;
  ledWindReactiveSupported: boolean | null;
  ledWindReactiveBusy: boolean;
  sdStatus: SDStatus | null;
  sdLogControlStatus: SDLogControlStatus | null;
  sdLogDetailStatus: SDLogDetailStatus | null;
  sdLogDetailLastReadAt: number | null;
  deviceModeStatus: DeviceModeStatus | null;
  deviceModeLastReadAt: number | null;
  deviceModeNotifyActive: boolean;
  deviceModeSupported: boolean | null;
  i2cConfigStatus: I2cConfigStatus | null;
  i2cConfigSupported: boolean | null;
  i2cConfigBusy: boolean;
  parseErrorStats: { count: number; lastError: string | null };
  error: string | null;
  isSupported: boolean;
  platformInfo: {
    platform: 'web' | 'ios' | 'android' | 'unknown';
    adapterType: 'WebBluetooth' | 'Capacitor' | 'none';
    browserName?: string | null;
    secureContext?: boolean;
    webBluetoothAvailable?: boolean;
  } | null;

  // アクション
  scanAndConnect: () => Promise<void>;
  connectToDevice: (device: BLEDevice) => Promise<void>;
  disconnect: () => Promise<void>;
  syncTime: () => Promise<void>;
  refreshSDStatus: () => Promise<void>;
  refreshLedBrightness: () => Promise<void>;
  refreshLedWindReactive: () => Promise<void>;
  setLedBrightness: (brightness: number) => Promise<void>;
  setLedWindReactive: (config: LEDWindReactiveConfig) => Promise<void>;
  refreshDeviceModeStatus: () => Promise<void>;
  refreshI2cConfigStatus: () => Promise<void>;
  writeI2cConfig: (request: I2cConfigWriteRequest) => Promise<void>;
  clearError: () => void;
}
```

### 7.2 使用例

```typescript
const Dashboard: React.FC = () => {
  const ble = useBLE();
  const dataSource =
    ble.connectionState === 'connected' && ble.dataState === 'live'
      ? 'live'
      : ble.connectionState === 'connected' && ble.dataState === 'stale'
        ? 'stale'
        : 'empty';

  return (
    <>
      <BLEModal
        isOpen={showBLEModal}
        connectionState={ble.connectionState}
        dataState={ble.dataState}
        availableDevices={ble.availableDevices}
        onScanAndConnect={ble.scanAndConnect}
        onConnectToDevice={ble.connectToDevice}
        onDisconnect={ble.disconnect}
        // ...
      />
      <BLESettingsDrawerBridge
        isOpen={showSettingsDrawer}
        onDismiss={() => setShowSettingsDrawer(false)}
        ble={ble}
        // ...
      />
    </>
  );
};
```

---

## 8. UI仕様

### 8.1 ステータスカード

| 接続状態 | 表示テキスト | アイコン | バッジ色 |
|---------|-------------|---------|---------|
| disconnected | 未接続 | Unplug (白) | 白/半透明 |
| scanning | スキャン中 | ScanLine / spinner (オレンジ) | オレンジ |
| connecting | 接続中... | ScanLine / spinner (オレンジ) | オレンジ |
| connected | 接続済み | RadioTower / 電波強度バー (緑) | 緑 |

### 8.2 BLE接続モーダル

- **スキャンセクション**: デバイス一覧表示、スキャン開始/停止ボタン
- **接続済みセクション**: 接続中デバイス表示、切断ボタン
- **プラットフォーム表示**: Web BLE / Capacitor、HTTPS/Secure などの接続前提を表示
- **エラー表示**: BLE未対応時、接続エラー時に赤色で表示

### 8.3 設定ドロワー

- **接続概要**: platform、接続状態、接続デバイス、BLEデータ解析エラー。Device ID とビルド情報は `アプリ情報` に折りたたむ。
- **デバイス**: Device Info、ESP32モード、Reset Control、Device Health、Capabilities、LED輝度。Raw値、flags、詳細バッジは各詳細セクションに折りたたむ。
- **時刻**: 本体のIANA地域とUTC差、端末地域の候補、地域検索、明示操作による地域保存とUTC同期。端末候補は自動書込みしない
- **SD/ログ**: SDカード、SDログ詳細、ログ周期設定
- **I2C設定**: I2C status、Node ID、平均回数、風向取付、I2C address、保存/破棄/既定値
- **サンプル**: Sample Metadata

---

## 9. 動作シーケンス

### 9.1 接続フロー

```
[ユーザー] ステータスカードをタップ
    ↓
[アプリ] BLE接続モーダルを表示
    ↓
[ユーザー] スキャンボタンをタップ
    ↓
[アプリ] platformに応じたデバイス選択を開始
    ├─ [Web] `requestDevice()` を使用する。`0x181A` service filterを主条件、`ULSA EVO #` name-prefixを広告差異に備える第二条件としてOR指定し、`acceptAllDevices`は使わない。
    └─ [Capacitor/iOS] `BleClient.requestLEScan()` を`0x181A` service filterで実行
    ↓
[アプリ] Webはbrowser chooserで1台を選択、Capacitor/iOSはデバイス一覧を更新（5秒間）
    ↓
[ユーザー] デバイスをタップ
    ↓
[アプリ] BleClient.connect() 実行
    ↓
[アプリ] デバイス情報を読み取り
    ↓
[アプリ] SDステータス、ESP32動作モード、I2C設定ステータスを読み取り
    ↓
[アプリ] 時刻同期を実行
    ↓
[アプリ] センサー通知を開始
    ↓
[アプリ] connectionState = 'connected'
    ↓
[Dashboard] dataState = 'waiting' から live sample 受信後に実測描画開始
```

Webのname-prefix候補は検出のためだけに使う。接続後に標準計測notifyを1つも開始できない候補は接続成功にせず、既存のcleanup/error経路へ戻す。

### 9.2 データ更新フロー

```
[ULSA EVO] センサーデータをNotify
    ↓
[Adapter] startSensorNotifications のコールバック実行
    ↓
[bleDataParser] parseWindSpeed() 等でデータ変換
    ↓
[useBLE] sensorData state を更新
    ↓
[Dashboard] useEffect で検知
    ↓
[Dashboard] windSpeed, temperature 等の state を更新
    ↓
[ECharts] ゲージ・チャートを再描画
```

---

## 10. エラーハンドリング

| エラー | 原因 | 対処 |
|--------|------|------|
| BLE初期化失敗 | Bluetoothがオフ、未対応デバイス | エラーメッセージ表示 |
| スキャン失敗 | 権限不足、Bluetoothオフ | エラーメッセージ表示 |
| 接続失敗 | デバイス範囲外、タイムアウト | エラーメッセージ表示、再試行可能 |
| 切断 | デバイス電源オフ、範囲外 | `NO DATA` に戻し、実測値を表示しない |
| 時刻同期失敗 | 書き込み権限なし | エラーメッセージ表示 |

---

## 11. 依存パッケージ

| パッケージ | バージョン | 用途 |
|-----------|-----------|------|
| @capacitor-community/bluetooth-le | latest | BLE通信API |
| @capacitor/core | ^8.0.1 | Capacitorコア |
| @ionic/react | ^8.5.0 | UIフレームワーク |

---

## 12. 今後の拡張予定

- [ ] アドバタイジングデータからのセンサー値取得（接続不要モード）
- [ ] 複数デバイス同時接続
- [ ] データロギング機能
- [ ] SDカードへの記録開始/停止コマンド
- [ ] ファームウェアOTA更新

---

## 改訂履歴

| 日付 | バージョン | 内容 |
|------|-----------|------|
| 2026-01-23 | 1.0.0 | 初版作成 |
