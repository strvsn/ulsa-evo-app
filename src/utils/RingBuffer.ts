/**
 * 循環バッファ（Ring Buffer）実装
 * 固定サイズのバッファで効率的なデータ管理を実現
 * shift()によるO(n)コストを回避し、メモリ効率を向上
 */

export class RingBuffer<T> {
  protected buffer: T[];
  protected capacity: number;
  protected head: number = 0; // 書き込み位置
  protected count: number = 0; // 現在の要素数
  
  /**
   * @param capacity バッファの最大容量
   * @param initialValue 初期値（オプション）
   */
  constructor(capacity: number, initialValue?: T) {
    this.capacity = capacity;
    this.buffer = new Array<T>(capacity);
    
    // 初期値が指定された場合、バッファを初期値で埋める
    if (initialValue !== undefined) {
      this.buffer.fill(initialValue);
      this.count = capacity;
      this.head = 0;
    }
  }

  /**
   * 要素を追加（バッファが満杯の場合は最古の要素を上書き）
   */
  push(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  /**
   * 指定位置の要素を取得（0が最古、length-1が最新）
   */
  get(index: number): T | undefined {
    if (index < 0 || index >= this.count) {
      return undefined;
    }
    const actualIndex = this.count < this.capacity
      ? index
      : (this.head + index) % this.capacity;
    return this.buffer[actualIndex];
  }

  /**
   * 最新の要素を取得
   */
  getLast(): T | undefined {
    if (this.count === 0) return undefined;
    const lastIndex = (this.head - 1 + this.capacity) % this.capacity;
    return this.buffer[lastIndex];
  }

  /**
   * 現在の要素数
   */
  get length(): number {
    return this.count;
  }

  /**
   * バッファ容量
   */
  get size(): number {
    return this.capacity;
  }

  /**
   * バッファが満杯かどうか
   */
  isFull(): boolean {
    return this.count >= this.capacity;
  }

  /**
   * 最新のN要素を配列として取得（新しい配列を作成）
   * グラフ描画用に使用
   * @param n 取得する要素数（省略時は全要素）
   */
  getLatest(n?: number): T[] {
    const count = n !== undefined ? Math.min(n, this.count) : this.count;
    if (count === 0) return [];
    
    const result = new Array<T>(count);
    const startOffset = this.count - count;
    
    for (let i = 0; i < count; i++) {
      const bufferIndex = this.count < this.capacity
        ? startOffset + i
        : (this.head + startOffset + i) % this.capacity;
      result[i] = this.buffer[bufferIndex];
    }
    
    return result;
  }

  /**
   * 全要素を配列として取得（古い順）
   * 注意: 新しい配列を作成するため、頻繁な呼び出しは避ける
   */
  toArray(): T[] {
    return this.getLatest();
  }

  /**
   * バッファをクリア
   */
  clear(): void {
    this.head = 0;
    this.count = 0;
  }

  /**
   * イテレータ実装（for...of で使用可能）
   */
  *[Symbol.iterator](): Iterator<T> {
    for (let i = 0; i < this.count; i++) {
      const index = this.count < this.capacity
        ? i
        : (this.head + i) % this.capacity;
      yield this.buffer[index];
    }
  }

  /**
   * デバッグ用：バッファの状態を出力
   */
  debug(): { head: number; count: number; capacity: number } {
    return {
      head: this.head,
      count: this.count,
      capacity: this.capacity
    };
  }
}

/**
 * センサーデータ用の特化型RingBuffer
 * 数値データに最適化
 */
export class NumericRingBuffer extends RingBuffer<number> {
  constructor(capacity: number, initialValue?: number) {
    super(capacity, initialValue);
  }

  /**
   * 最新N要素の配列とmin/maxを1回の走査で取得
   * LineChartのauto scaleで配列コピー後の追加scanを避けるために使用
   */
  getLatestWithStats(n?: number): { values: number[]; min: number; max: number } {
    const count = n !== undefined ? Math.min(n, this.count) : this.count;
    if (count === 0) {
      return { values: [], min: 0, max: 0 };
    }

    const values = new Array<number>(count);
    const startOffset = this.count - count;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < count; i++) {
      const bufferIndex = this.count < this.capacity
        ? startOffset + i
        : (this.head + startOffset + i) % this.capacity;
      const value = this.buffer[bufferIndex];
      values[i] = value;
      if (value < min) min = value;
      if (value > max) max = value;
    }

    return { values, min, max };
  }

  /**
   * 最新N要素の平均値を取得
   */
  getAverage(n?: number): number {
    const data = this.getLatest(n);
    if (data.length === 0) return 0;
    return data.reduce((a, b) => a + b, 0) / data.length;
  }

  /**
   * 最新N要素の最小値を取得
   */
  getMin(n?: number): number {
    return this.getLatestWithStats(n).min;
  }

  /**
   * 最新N要素の最大値を取得
   */
  getMax(n?: number): number {
    return this.getLatestWithStats(n).max;
  }
}

/**
 * タイムスタンプ付きデータ用のRingBuffer
 */
export interface TimestampedData<T> {
  value: T;
  timestamp: number; // Unix timestamp (ms)
}

export class TimestampedRingBuffer<T> extends RingBuffer<TimestampedData<T>> {
  /**
   * 値とタイムスタンプを追加
   */
  pushWithTimestamp(value: T, timestamp: number = Date.now()): void {
    this.push({ value, timestamp });
  }

  /**
   * 最新のN要素の値だけを配列で取得
   */
  getLatestValues(n?: number): T[] {
    return this.getLatest(n).map(item => item.value);
  }

  /**
   * 最新のN要素のタイムスタンプだけを配列で取得
   */
  getLatestTimestamps(n?: number): number[] {
    return this.getLatest(n).map(item => item.timestamp);
  }

  /**
   * 指定時間範囲のデータを取得
   * @param durationMs 過去何ミリ秒分のデータを取得するか
   */
  getByDuration(durationMs: number): TimestampedData<T>[] {
    const now = Date.now();
    const cutoff = now - durationMs;
    return this.getLatest().filter(item => item.timestamp >= cutoff);
  }
}
