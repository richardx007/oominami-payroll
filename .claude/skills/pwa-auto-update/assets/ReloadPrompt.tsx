import { useRegisterSW } from 'virtual:pwa-register/react'

// ReloadPrompt — 新しいバージョン(Service Worker)を検知したら画面上部中央に
// バナーを出し、ワンタップで有効化＋リロードする。開きっぱなしの端末でも気づけるよう、
// 登録後は一定間隔で更新チェックをポーリングする。
//
// 依存はランタイム(React)と vite-plugin-pwa の仮想モジュールのみ。
// Tailwind や アイコンライブラリに依存しないよう、見た目はインラインスタイルで完結させている。
// 色・文言・間隔・位置は props で差し替え可能。

export interface ReloadPromptProps {
  /** バナー本文。既定「新しいバージョンがあります」。 */
  message?: string
  /** 更新ボタンのラベル。既定「更新」。 */
  buttonLabel?: string
  /** 更新ボタンの背景色。既定 '#2563eb'(青)。 */
  accentColor?: string
  /** 新版チェックのポーリング間隔(ms)。既定 60000(1分)。 */
  intervalMs?: number
  /** バナーの表示位置。既定 'top'。 */
  position?: 'top' | 'bottom'
}

export function ReloadPrompt({
  message = '新しいバージョンがあります',
  buttonLabel = '更新',
  accentColor = '#2563eb',
  intervalMs = 60_000,
  position = 'top',
}: ReloadPromptProps = {}) {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      setInterval(() => {
        // オフライン時などの update() 失敗は無視(次回チェックで再試行)
        registration.update().catch(() => {})
      }, intervalMs)
    },
  })

  if (!needRefresh) return null

  const vertical =
    position === 'top'
      ? { top: 0, paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }
      : { bottom: 0, paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }

  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        zIndex: 2147483000,
        display: 'flex',
        justifyContent: 'center',
        padding: '0 1rem',
        ...vertical,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.15)',
          background: '#222',
          color: '#fff',
          padding: '10px 14px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          font: '14px/1.4 system-ui, sans-serif',
        }}
      >
        <span>{message}</span>
        <button
          type="button"
          onClick={() => updateServiceWorker(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            borderRadius: 8,
            border: 'none',
            background: accentColor,
            color: '#fff',
            padding: '6px 12px',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {buttonLabel}
        </button>
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          aria-label="閉じる"
          style={{
            border: 'none',
            background: 'transparent',
            color: 'rgba(255,255,255,0.6)',
            padding: 4,
            fontSize: 16,
            lineHeight: 1,
            cursor: 'pointer',
          }}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
