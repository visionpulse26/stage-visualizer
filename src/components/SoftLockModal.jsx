/**
 * Modal shown when the current user arrives at a presentation
 * that another admin is actively editing.
 *
 * Props:
 *   lockHolder   { displayName?, email?, lockedAt? } | null  — hides when null
 *   onViewReadOnly  () => void  — close modal, enter read-only mode
 *   onTakeOver      () => void  — claim write access, notify the other admin
 */
export function SoftLockModal({ lockHolder, onViewReadOnly, onTakeOver }) {
  if (!lockHolder) return null

  const name  = lockHolder.displayName || lockHolder.email || 'Admin khác'
  const since = lockHolder.lockedAt
    ? new Date(lockHolder.lockedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(8,6,4,0.88)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        style={{
          background: '#1A1510',
          border: '1px solid rgba(220,100,30,0.35)',
          borderRadius: 12,
          padding: '28px 32px',
          maxWidth: 440,
          width: 'calc(100vw - 48px)',
          boxShadow: '0 8px 48px rgba(0,0,0,0.7)',
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'rgba(232,83,26,0.15)',
            border: '1px solid rgba(232,83,26,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, marginBottom: 16,
          }}
        >
          ✏️
        </div>

        <h3
          style={{
            color: '#F4ECE2',
            margin: '0 0 10px',
            fontSize: 15,
            fontFamily: 'Chakra Petch, sans-serif',
            fontWeight: 600,
            letterSpacing: '0.04em',
          }}
        >
          Presentation đang được chỉnh sửa
        </h3>

        <p
          style={{
            color: '#C8B8A8',
            fontSize: 12,
            margin: '0 0 24px',
            lineHeight: 1.7,
            fontFamily: 'Chakra Petch, sans-serif',
          }}
        >
          <span style={{ color: '#E8531A', fontWeight: 700 }}>{name}</span>
          {' '}đang giữ quyền chỉnh sửa{since ? ` từ ${since}` : ''}.{' '}
          Bạn có thể xem ở chế độ <strong style={{ color: '#F4ECE2' }}>read-only</strong>,
          hoặc <strong style={{ color: '#F4ECE2' }}>lấy lại quyền edit</strong> —
          {name} sẽ nhận được thông báo và bị chuyển sang read-only.
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onViewReadOnly}
            style={{
              background: 'rgba(255,255,255,0.06)',
              color: '#C8B8A8',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6,
              padding: '8px 18px',
              cursor: 'pointer',
              fontSize: 12,
              fontFamily: 'Chakra Petch, sans-serif',
              letterSpacing: '0.05em',
              transition: 'background 0.15s',
            }}
          >
            Xem read-only
          </button>
          <button
            onClick={onTakeOver}
            style={{
              background: '#E8531A',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '8px 18px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 12,
              fontFamily: 'Chakra Petch, sans-serif',
              letterSpacing: '0.05em',
              boxShadow: '0 0 12px rgba(232,83,26,0.35)',
              transition: 'box-shadow 0.15s',
            }}
          >
            Lấy quyền edit
          </button>
        </div>
      </div>
    </div>
  )
}
