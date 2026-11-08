/**
 * Pure helpers for switching modules on and off from the Settings pane. Kept
 * free of Foundry globals so they can be tested with node.
 *
 * Changes are staged in a "pending" Map (module id -> wanted state) and only
 * written when the user saves. A module's staged state is left out of the Map
 * when it matches the module's real one.
 */

/**
 * Reduce a Foundry Module to the fields the pane needs.
 *
 * @param {{id:string, title?:string, active?:boolean, relationships?:{requires?:Iterable<{id:string, type?:string}>}}} mod
 * @returns {{id:string, title:string, active:boolean, requires:string[]}}
 */
export function moduleSummary(mod) {
  const requires = [...(mod.relationships?.requires ?? [])]
    // Required systems and worlds aren't modules we can switch.
    .filter((relation) => !relation.type || relation.type === "module")
    .map((relation) => relation.id);
  return { id: mod.id, title: mod.title || mod.id, active: Boolean(mod.active), requires };
}

/** A module's state once the staged changes are applied. */
export function effectiveState(summary, pending) {
  return pending.has(summary.id) ? pending.get(summary.id) : summary.active;
}

/**
 * Stage turning one module on or off, taking its dependencies along: enabling
 * also enables whatever it requires, disabling also disables whatever requires
 * it. If a required module isn't installed, nothing changes.
 *
 * @param {Map<string, {id:string, title:string, active:boolean, requires:string[]}>} modules  All installed modules.
 * @param {Map<string, boolean>} pending  Current staged changes. Not modified.
 * @param {string} id
 * @param {boolean} enable
 * @returns {{pending: Map<string, boolean>, changed: string[], missing: string[]}}
 *   `changed` lists the other modules switched along with `id`; `missing` the
 *   required ids that aren't installed.
 */
export function stageToggle(modules, pending, id, enable) {
  const next = new Map(pending);
  const touched = new Set();
  const switched = new Set();
  const missing = new Set();

  const set = (moduleId, wanted) => {
    const summary = modules.get(moduleId);
    if (wanted === summary.active) next.delete(moduleId);
    else next.set(moduleId, wanted);
  };

  const enableWithDeps = (moduleId) => {
    if (touched.has(moduleId)) return;
    touched.add(moduleId);
    const summary = modules.get(moduleId);
    if (effectiveState(summary, next)) return;
    set(moduleId, true);
    switched.add(moduleId);
    for (const dep of summary.requires) {
      if (modules.has(dep)) enableWithDeps(dep);
      else missing.add(dep);
    }
  };

  const disableWithDependents = (moduleId) => {
    if (touched.has(moduleId)) return;
    touched.add(moduleId);
    set(moduleId, false);
    switched.add(moduleId);
    for (const other of modules.values()) {
      if (other.requires.includes(moduleId) && effectiveState(other, next)) disableWithDependents(other.id);
    }
  };

  if (!modules.has(id)) return { pending: new Map(pending), changed: [], missing: [] };
  if (enable) enableWithDeps(id);
  else disableWithDependents(id);

  if (missing.size) return { pending: new Map(pending), changed: [], missing: [...missing] };
  return { pending: next, changed: [...switched].filter((other) => other !== id), missing: [] };
}

/**
 * The full id -> enabled map for core.moduleConfiguration once the staged
 * changes are applied. Core stores every installed module, not just changes.
 */
export function configurationAfter(modules, pending) {
  return Object.fromEntries([...modules.values()].map((summary) => [summary.id, effectiveState(summary, pending)]));
}

/**
 * Cards for installed-but-disabled modules, shaped like paneRows output, to
 * follow the active ones. Sorted by title.
 *
 * @param {Iterable<{id:string, title:string, active:boolean}>} summaries
 */
export function disabledRows(summaries) {
  return [...summaries]
    .filter((summary) => !summary.active)
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((summary) => ({ id: summary.id, label: summary.title, settingCount: 0, menus: [], disabled: true }));
}
