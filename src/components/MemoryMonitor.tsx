import { useState, useEffect, useRef } from 'react';
import { ControlIconButton, NativeControlButton } from './controls';
import './MemoryMonitor.css';

interface MemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface MemorySnapshot {
  timestamp: number;
  usedMB: number;
}

const MEMORY_DEBUG = import.meta.env.DEV && import.meta.env.VITE_MEMORY_DEBUG === '1';

// Chrome の performance.memory API の型拡張
declare global {
  interface Performance {
    memory?: MemoryInfo;
  }
}

/**
 * メモリ監視コンポーネント
 * 開発モードでのみ表示され、JSヒープサイズをリアルタイム監視
 */
const MemoryMonitor: React.FC = () => {
  const [memoryInfo, setMemoryInfo] = useState<{
    usedMB: number;
    totalMB: number;
    limitMB: number;
    percentage: number;
  } | null>(null);
  const [isSupported, setIsSupported] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [trend, setTrend] = useState<'up' | 'down' | 'stable'>('stable');
  const historyRef = useRef<MemorySnapshot[]>([]);
  const lastLogTimeRef = useRef<number>(0);

  useEffect(() => {
    // performance.memory API のサポートチェック
    if (!performance.memory) {
      setIsSupported(false);
      if (MEMORY_DEBUG) {
        console.warn('[MemoryMonitor] performance.memory API is not supported in this browser');
      }
      return;
    }

    const updateMemory = () => {
      const memory = performance.memory;
      if (!memory) return;

      const usedMB = Math.round(memory.usedJSHeapSize / 1024 / 1024 * 10) / 10;
      const totalMB = Math.round(memory.totalJSHeapSize / 1024 / 1024 * 10) / 10;
      const limitMB = Math.round(memory.jsHeapSizeLimit / 1024 / 1024);
      const percentage = Math.round((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100);

      setMemoryInfo({ usedMB, totalMB, limitMB, percentage });

      // 履歴に追加（最大60サンプル = 1分間）
      const now = Date.now();
      historyRef.current.push({ timestamp: now, usedMB });
      if (historyRef.current.length > 60) {
        historyRef.current.shift();
      }

      // トレンド計算（過去10サンプルとの比較）
      if (historyRef.current.length >= 10) {
        const recent = historyRef.current.slice(-10);
        const older = historyRef.current.slice(-20, -10);
        if (older.length >= 5) {
          const recentAvg = recent.reduce((a, b) => a + b.usedMB, 0) / recent.length;
          const olderAvg = older.reduce((a, b) => a + b.usedMB, 0) / older.length;
          const diff = recentAvg - olderAvg;
          if (diff > 5) setTrend('up');
          else if (diff < -5) setTrend('down');
          else setTrend('stable');
        }
      }

      // コンソールログ出力（10秒ごと）
      if (now - lastLogTimeRef.current > 10000) {
        lastLogTimeRef.current = now;
        if (MEMORY_DEBUG) {
          console.log(`[Memory] ${usedMB}MB / ${totalMB}MB (${percentage}%) - Trend: ${trend}`);
        }
        
        // 警告しきい値チェック
        if (usedMB > 500) {
          console.warn(`[Memory Warning] High memory usage: ${usedMB}MB`);
        }
        if (percentage > 70) {
          console.warn(`[Memory Warning] Memory usage at ${percentage}% of limit`);
        }
      }
    };

    // 初回実行
    updateMemory();

    // 1秒ごとに更新
    const interval = setInterval(updateMemory, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [trend]);

  // 開発モードでない場合は何も表示しない
  if (!import.meta.env.DEV) {
    return null;
  }

  // performance.memory がサポートされていない場合
  if (!isSupported) {
    return (
      <div className="memory-monitor unsupported">
        <span>Memory API not supported</span>
      </div>
    );
  }

  if (!memoryInfo) {
    return null;
  }

  // 警告レベルの判定
  const getStatusClass = () => {
    if (memoryInfo.usedMB > 500 || memoryInfo.percentage > 70) return 'critical';
    if (memoryInfo.usedMB > 300 || memoryInfo.percentage > 50) return 'warning';
    return 'normal';
  };

  const getTrendIcon = () => {
    switch (trend) {
      case 'up': return '📈';
      case 'down': return '📉';
      default: return '➡️';
    }
  };

  if (isMinimized) {
    return (
      <NativeControlButton
        controlSize="C36"
        className={`memory-monitor minimized ${getStatusClass()}`}
        aria-label={`メモリ使用量 ${memoryInfo.usedMB} MB。詳細を表示`}
        aria-expanded="false"
        onClick={() => setIsMinimized(false)}
      >
        <span>{memoryInfo.usedMB}MB {getTrendIcon()}</span>
      </NativeControlButton>
    );
  }

  return (
    <div className={`memory-monitor ${getStatusClass()}`}>
      <div className="memory-header">
        <span className="memory-title">🧠 Memory</span>
        <ControlIconButton
          className="memory-minimize"
          aria-label="メモリ詳細を最小化"
          onClick={() => setIsMinimized(true)}
        >−</ControlIconButton>
      </div>
      <div className="memory-content">
        <div className="memory-row">
          <span>Used:</span>
          <span className="memory-value">{memoryInfo.usedMB} MB {getTrendIcon()}</span>
        </div>
        <div className="memory-row">
          <span>Total:</span>
          <span className="memory-value">{memoryInfo.totalMB} MB</span>
        </div>
        <div className="memory-row">
          <span>Usage:</span>
          <span className="memory-value">{memoryInfo.percentage}%</span>
        </div>
        <div className="memory-bar">
          <div 
            className="memory-bar-fill" 
            style={{ width: `${Math.min(memoryInfo.percentage, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default MemoryMonitor;
