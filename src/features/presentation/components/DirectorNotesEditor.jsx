import { useCallback } from 'react'
import { DirectorNoteRow } from './DirectorNoteRow'

const T = {
  glass:   'rgba(255,255,255,0.045)',
  border:  'rgba(220,100,30,0.20)',
  ember2:  '#FF6B2B',
  text2:   '#C8B8A8',
  text3:   '#8E7E70',
  text4:   '#5A4E45',
}

function newNote(defaultCameraPresetId = '') {
  return {
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: '',
    visibleToClient: true,
    annotation: null,
    cameraPresetId: defaultCameraPresetId,
    clipTimeSeconds: null,
    sortOrder: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Admin editor for director notes on a single slide.
 * Replaces the old single-textarea directorNote UI.
 *
 * @param {{
 *   notes: import('../../../lib/presentationVersions').DirectorNote[],
 *   cameraPresets: import('../../../lib/presentationVersions').CameraPreset[],
 *   defaultCameraPresetId: string,
 *   onChange: (notes: import('../../../lib/presentationVersions').DirectorNote[]) => void,
 *   onEditAnnotation: (noteId: string) => void,
 * }} props
 */
export function DirectorNotesEditor({ notes = [], cameraPresets = [], defaultCameraPresetId = '', onChange, onEditAnnotation }) {
  const hasCenterPreset = cameraPresets.some(p => p.name?.toLowerCase() === 'center')

  const update = useCallback((index, patch) => {
    const next = notes.map((n, i) => i === index ? { ...n, ...patch } : n)
    onChange(next)
  }, [notes, onChange])

  const addNote = useCallback(() => {
    const sortOrder = (notes[notes.length - 1]?.sortOrder ?? 0) + 1
    onChange([...notes, { ...newNote(defaultCameraPresetId), sortOrder }])
  }, [notes, onChange, defaultCameraPresetId])

  const deleteNote = useCallback((index) => {
    onChange(notes.filter((_, i) => i !== index))
  }, [notes, onChange])

  const moveNote = useCallback((index, dir) => {
    const next = [...notes]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next.map((n, i) => ({ ...n, sortOrder: i + 1 })))
  }, [notes, onChange])

  const removeAnnotation = useCallback((index) => {
    update(index, { annotation: null, updatedAt: new Date().toISOString() })
  }, [update])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.text3, fontFamily: 'Chakra Petch, sans-serif' }}>
          Director Notes ({notes.length})
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={addNote}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
            fontFamily: 'Chakra Petch, sans-serif', fontSize: 10, fontWeight: 600,
            background: T.glass, border: `1px solid ${T.border}`, color: T.text2,
          }}
        >
          + Add note
        </button>
      </div>

      {/* Empty state */}
      {notes.length === 0 && (
        <div style={{
          background: 'rgba(0,0,0,0.2)', border: `1px dashed rgba(220,100,30,0.18)`,
          borderRadius: 7, padding: '12px 12px', textAlign: 'center',
        }}>
          <span style={{ fontSize: 10, color: T.text4, fontFamily: 'Chakra Petch, sans-serif' }}>
            No director notes yet — add one above
          </span>
        </div>
      )}

      {/* Note rows */}
      {notes.map((note, i) => (
        <DirectorNoteRow
          key={note.id}
          note={note}
          index={i}
          total={notes.length}
          cameraPresets={cameraPresets}
          hasCenterPreset={hasCenterPreset}
          onChange={patch => update(i, patch)}
          onMoveUp={() => moveNote(i, -1)}
          onMoveDown={() => moveNote(i, 1)}
          onDelete={() => deleteNote(i)}
          onEditAnnotation={() => onEditAnnotation(note.id)}
          onRemoveAnnotation={() => removeAnnotation(i)}
        />
      ))}
    </div>
  )
}
