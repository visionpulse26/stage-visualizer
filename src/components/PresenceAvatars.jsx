/**
 * Shows avatar chips for every admin currently on the same presentation page.
 * The current user (selfUserId) is hidden.
 */
export function PresenceAvatars({ presenceList = [], selfUserId, style = {} }) {
  const others = presenceList.filter((p) => p.userId !== selfUserId)
  if (!others.length) return null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        ...style,
      }}
    >
      {others.map((p) => {
        const label = p.displayName || p.email || '?'
        const initial = label.charAt(0).toUpperCase()
        return (
          <div
            key={p.userId || p.email}
            title={`${label} đang xem/chỉnh sửa`}
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: 'rgba(232,83,26,0.85)',
              border: '1.5px solid rgba(232,83,26,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 700,
              color: '#fff',
              fontFamily: 'Chakra Petch, sans-serif',
              flexShrink: 0,
              cursor: 'default',
              userSelect: 'none',
            }}
          >
            {initial}
          </div>
        )
      })}
      <span
        style={{
          fontSize: 10,
          color: '#C8B8A8',
          fontFamily: 'Chakra Petch, sans-serif',
          whiteSpace: 'nowrap',
          letterSpacing: '0.04em',
        }}
      >
        {others.length === 1
          ? `${others[0].displayName || others[0].email} đang chỉnh`
          : `${others.length} người đang chỉnh`}
      </span>
    </div>
  )
}
