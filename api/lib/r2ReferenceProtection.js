import { collectReferencedR2KeysFromProject } from './adminApiCommon.js'

export function filterDeletableR2Keys({ keys, projectRows, excludingProjectIds = [], publicBase = '' }) {
  const excluded = new Set(excludingProjectIds.map((id) => String(id)))
  const referencedByOthers = new Set()

  for (const project of projectRows || []) {
    if (!project || excluded.has(String(project.id))) continue
    for (const key of collectReferencedR2KeysFromProject(project, publicBase)) {
      referencedByOthers.add(key)
    }
  }

  const deletable = []
  const skippedReferenced = []
  for (const key of keys || []) {
    if (referencedByOthers.has(key)) skippedReferenced.push(key)
    else deletable.push(key)
  }

  return { deletable, skippedReferenced }
}
