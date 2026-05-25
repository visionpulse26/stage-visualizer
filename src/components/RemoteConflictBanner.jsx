/**
 * Fixed bottom banner that appears when another admin saves a draft
 * while the current user is editing.
 *
 * Props:
 *   remoteVersion  { version_name?, created_by?, ... } | null
 *   onReload       () => void  — re-fetch draft from DB
 *   onDismiss      () => void  — hide banner, keep current local state
 */
export function RemoteConflictBanner({ remoteVersion, onReload, onDismiss }) {
  if (!remoteVersion) return null

  const who = remoteVersion.created_by || 'Admin khác'
  const vName = remoteVersion.version_name ? ` "${remoteVersion.version_name}"` : ''

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(22,14,6,0.97)',
        border: '1px solid rgba(232,83,26,0.55)',
        borderRadius: 8,
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        zIndex: 9999,
        boxShadow: '0 4px 28px rgba(0,0,0,0.6), 0 0 0 1px rgba(232,83,26,0.1)',
        maxWidth: 480,
        width: 'calc(100vw - 40px)',
        fontFamily: 'Chakra Petch, sans-serif',
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: '#C8B8A8',
          flex: 1,
          lineHeight: 1.5,
        }}
      >
        <span style={{ color: '#E8531A', fontWeight: 700 }}>{who}</span>
        {' '}vừa lưu draft{vName}. Bạn có muốn tải lại?
      </span>

      <button
        onClick={onReload}
        style={{
          background: '#E8531A',
          color: '#fff',
          border: 'none',
          borderRadius: 5,
          padding: '5px 14px',
          fontWeight: 700,
          cursor: 'pointer',
          fontSize: 11,
          fontFamily: 'Chakra Petch, sans-serif',
          letterSpacing: '0.06em',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        Tải lại
      </button>

      <button
        onClick={onDismiss}
        style={{
          background: 'transparent',
          color: 'rgba(200,184,168,0.6)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 5,
          padding: '5px 10px',
          cursor: 'pointer',
          fontSize: 11,
          fontFamily: 'Chakra Petch, sans-serif',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        Bỏ qua
      </button>
    </div>
  )
}
