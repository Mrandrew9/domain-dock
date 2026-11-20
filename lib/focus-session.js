export async function start(focus, current, selected, name) {
  if ((await chrome.storage.session.get('focusSession')).focusSession) throw Error('End the existing focus session first.');
  const originals = [];
  for (const reviewed of selected.values()) {
    const tab = await chrome.tabs.get(reviewed.id);
    if (['windowId','url','pinned','groupId'].some(k => tab[k] !== reviewed[k]) || tab.pendingUrl) throw Error('A selected tab changed. Review the refreshed list.');
    const group = tab.groupId === -1 ? null : await chrome.tabGroups.get(tab.groupId);
    originals.push({id:tab.id, windowId:tab.windowId, index:tab.index, pinned:tab.pinned, group});
  }
  if (!originals.length || !name) return;
  const dest = focus ? await chrome.windows.create({focused:false, url:chrome.runtime.getURL('focus.html')}) : current;
  if (focus) await chrome.storage.session.set({focusSession:{name, windowId:dest.id, originals}});
  const id = await chrome.tabs.group({tabIds:originals.map(t => t.id),createProperties:{windowId:dest.id}});
  await chrome.tabGroups.update(id,{title:name,color:'purple'});
  if (focus) {
    await chrome.tabs.update(originals[0].id,{active:true});
    await chrome.windows.update(dest.id,{focused:true});
  }
  return 'Grouped ' + originals.length + ' tabs.';
}

export async function end(restore) {
  const {focusSession:s} = await chrome.storage.session.get('focusSession');
  if (!s) return;
  if (restore) {
    const windows = new Set((await chrome.windows.getAll()).map(w => w.id));
    const tabs = new Map((await chrome.tabs.query({})).map(t => [t.id,t]));
    s.replacements ||= {};
    s.groups ||= {};
    for (const original of [...s.originals].sort((a,b) => a.index - b.index)) {
      const tab = tabs.get(original.id);
      if (!tab || (tab.windowId !== s.windowId && !original.restoring)) continue;
      original.restoring = true;
      await chrome.storage.session.set({focusSession:s});
      let destination = s.replacements[original.windowId] ?? original.windowId;
      if (!windows.has(destination)) {
        destination = (await chrome.windows.create({tabId:tab.id,focused:false})).id;
        s.replacements[original.windowId] = destination;
        windows.add(destination);
        await chrome.storage.session.set({focusSession:s});
      } else await chrome.tabs.move(tab.id,{windowId:destination,index:original.index});
      if (original.group) {
        let id = s.groups[original.group.id] ?? original.group.id;
        const existing = await chrome.tabGroups.get(id).catch(() => null);
        if (existing?.windowId === destination) await chrome.tabs.group({groupId:id,tabIds:tab.id});
        else {
          id = await chrome.tabs.group({tabIds:tab.id});
          s.groups[original.group.id] = id;
          await chrome.tabGroups.update(id,{title:original.group.title,color:original.group.color});
        }
      }
      if (original.pinned) await chrome.tabs.update(tab.id,{pinned:true});
      s.originals = s.originals.filter(t => t.id !== tab.id);
      await chrome.storage.session.set({focusSession:s});
    }
  }
  await chrome.storage.session.remove('focusSession');
  return restore ? 'Session tabs returned.' : 'Focus ended. Window kept.';
}

