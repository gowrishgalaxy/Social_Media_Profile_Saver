/* Workflow repairs and persistence safeguards for the static app. */
function getNextTopicPriority(platformId) {
    return getNextPriorityForTopic(platformId);
}
function getNextSubtopicPriority(topicId) {
    return getNextPriorityForSubtopic(topicId);
}
function populatePrioritySelect(id, selected = 1, max = 25) {
    const select = document.getElementById(id);
    if (!select) return;
    select.replaceChildren();
    for (let value = 1; value <= Math.max(max, Number(selected) || 1); value += 1) {
        const option = document.createElement('option');
        option.value = String(value);
        option.textContent = `${value}${value === Number(selected) ? ' - Current' : ''}`;
        select.appendChild(option);
    }
    select.value = String(selected || 1);
}
function openAddCustomPlatformModal() {
    document.getElementById('customPlatformName').value = '';
    document.getElementById('customPlatformIcon').value = '';
    openModal('customPlatformModal');
}
function openImportModal() {
    document.getElementById('importFile').value = '';
    document.getElementById('importPreview').style.display = 'none';
    document.getElementById('importPreview').textContent = '';
    openModal('importModal');
}
function safeList(value) { return Array.isArray(value) ? value : []; }
function takeFrom(list, predicate) { const found = list.filter(predicate); return found; }
function removeByIds(list, records) {
    const ids = new Set(records.map(record => record.id));
    return list.filter(record => !ids.has(record.id));
}
function saveRecycleSnapshot(type, id, snapshot, platformId, topicId = null, subtopicId = null, order = 0) {
    appState.recycleBin.push({ id: generateId('trash'), itemId: id, itemType: type, originalPlatformId: platformId, originalTopicId: topicId, originalSubtopicId: subtopicId, originalOrder: order, deletedAt: new Date().toISOString(), snapshot });
    saveData();
}
function renumberHierarchy(type, parentId) {
    const siblings = type === 'topic'
        ? appState.topics.filter(item => item.platformId === parentId)
        : appState.subtopics.filter(item => item.topicId === parentId);
    siblings.sort((a, b) => (Number(a.priority) || 9999) - (Number(b.priority) || 9999) || (Number(a.order) || 0) - (Number(b.order) || 0));
    siblings.forEach((item, index) => { item.priority = index + 1; item.order = index + 1; });
}
function confirmDelete(type, id) {
    let affectedPlatformId = null;
    let affectedTopicId = null;
    let affectedSubtopicId = null;
    if (type === 'profile') {
        const profile = getProfileById(id); if (!profile) return;
        affectedSubtopicId = profile.subtopicId;
        saveRecycleSnapshot(type, id, { profile }, profile.platformId, profile.topicId, profile.subtopicId, profile.order);
        appState.profiles = appState.profiles.filter(item => item.id !== id);
    } else if (type === 'subtopic') {
        const subtopic = getSubtopicById(id); if (!subtopic) return;
        affectedTopicId = subtopic.topicId;
        const profiles = takeFrom(appState.profiles, item => item.subtopicId === id);
        saveRecycleSnapshot(type, id, { subtopic, profiles }, getTopicById(subtopic.topicId)?.platformId, subtopic.topicId, id, subtopic.order);
        appState.subtopics = appState.subtopics.filter(item => item.id !== id);
        appState.profiles = removeByIds(appState.profiles, profiles);
    } else if (type === 'topic') {
        const topic = getTopicById(id); if (!topic) return;
        affectedPlatformId = topic.platformId;
        const subtopics = takeFrom(appState.subtopics, item => item.topicId === id);
        const profiles = takeFrom(appState.profiles, item => item.topicId === id);
        saveRecycleSnapshot(type, id, { topic, subtopics, profiles }, topic.platformId, id, null, topic.priority);
        appState.topics = appState.topics.filter(item => item.id !== id);
        appState.subtopics = removeByIds(appState.subtopics, subtopics);
        appState.profiles = removeByIds(appState.profiles, profiles);
    } else if (type === 'platform') {
        const platform = getPlatformById(id); if (!platform) return;
        const topics = takeFrom(appState.topics, item => item.platformId === id);
        const topicIds = new Set(topics.map(item => item.id));
        const subtopics = takeFrom(appState.subtopics, item => topicIds.has(item.topicId));
        const subtopicIds = new Set(subtopics.map(item => item.id));
        const profiles = takeFrom(appState.profiles, item => item.platformId === id || topicIds.has(item.topicId) || subtopicIds.has(item.subtopicId));
        saveRecycleSnapshot(type, id, { platform, topics, subtopics, profiles }, id, null, null, platform.order);
        appState.platforms = appState.platforms.filter(item => item.id !== id);
        appState.topics = removeByIds(appState.topics, topics);
        appState.subtopics = removeByIds(appState.subtopics, subtopics);
        appState.profiles = removeByIds(appState.profiles, profiles);
        if (appState.settings.currentPlatformId === id) appState.settings.currentPlatformId = appState.platforms[0]?.id || null;
    }
    if (type === 'topic') renumberHierarchy('topic', affectedPlatformId);
    if (type === 'subtopic') renumberHierarchy('subtopic', affectedTopicId);
    if (type === 'profile' && affectedSubtopicId) renumberProfiles(affectedSubtopicId);
    saveData(); render(); renderRecycleBin();
}
function restore(trashId) {
    const entry = appState.recycleBin.find(item => item.id === trashId);
    if (!entry?.snapshot) { showToast('This item cannot be restored from this older recycle entry.', 'error'); return; }
    const snapshot = entry.snapshot;
    const appendUnique = (target, records) => records.forEach(record => { if (record && !target.some(item => item.id === record.id)) target.push(record); });
    if (snapshot.platform) appendUnique(appState.platforms, [snapshot.platform]);
    if (snapshot.topic) appendUnique(appState.topics, [snapshot.topic]);
    if (snapshot.subtopic) appendUnique(appState.subtopics, [snapshot.subtopic]);
    appendUnique(appState.topics, snapshot.topics || []);
    appendUnique(appState.subtopics, snapshot.subtopics || []);
    appendUnique(appState.profiles, snapshot.profile ? [snapshot.profile] : []);
    appendUnique(appState.profiles, snapshot.profiles || []);
    appState.recycleBin = appState.recycleBin.filter(item => item.id !== trashId);
    if (snapshot.platform) appState.settings.currentPlatformId = snapshot.platform.id;
    saveData(); render(); renderRecycleBin(); showToast('Item restored.', 'success');
}
async function permanentDelete(trashId, skipConfirmation = false) {
    const entry = appState.recycleBin.find(item => item.id === trashId); if (!entry) return;
    const itemName = entry.snapshot?.profile?.name || entry.snapshot?.subtopic?.name || entry.snapshot?.topic?.name || entry.snapshot?.platform?.name || entry.itemType;
    if (!skipConfirmation && !window.confirm(`Permanently delete “${itemName}”? This cannot be undone.`)) return;
    const profiles = [entry.snapshot?.profile, ...(entry.snapshot?.profiles || [])].filter(Boolean);
    for (const profile of profiles) if (profile.imageId) await deleteImageFromIndexedDB(profile.imageId).catch(() => {});
    appState.recycleBin = appState.recycleBin.filter(item => item.id !== trashId);
    saveData(); renderRecycleBin();
}
function renderRecycleBin() {
    const content = document.getElementById('recycleBinContent'); if (!content) return;
    if (!appState.recycleBin.length) { content.innerHTML = '<div class="recycle-empty">Recycle Bin is empty</div>'; return; }
    content.innerHTML = '';
    appState.recycleBin.forEach(item => {
        const name = item.snapshot?.profile?.name || item.snapshot?.subtopic?.name || item.snapshot?.topic?.name || item.snapshot?.platform?.name || item.itemType;
        const row = document.createElement('div'); row.className = 'recycle-item';
        row.innerHTML = `<div class="recycle-item-info"><div class="recycle-item-title">${escapeHtml(name)}</div><div class="recycle-item-meta">${escapeHtml(item.itemType)} · Deleted ${new Date(item.deletedAt).toLocaleDateString()}</div></div><div class="recycle-item-actions"><button class="btn btn-small btn-primary" onclick="restore('${item.id}')">Restore</button><button class="btn btn-small btn-danger" onclick="permanentDelete('${item.id}')">Delete</button></div>`;
        content.appendChild(row);
    });
}
function openAddTopicModal() {
    document.getElementById('topicName').value = '';
    const platformId = appState.settings.currentPlatformId || appState.platforms[0]?.id;
    const nextPriority = getNextTopicPriority(platformId);
    populatePrioritySelect('topicPriority', nextPriority, nextPriority);
    openModal('topicModal');
}
function openAddSubtopicModal(topicId = null) {
    document.getElementById('subtopicName').value = '';
    const selectedTopicId = topicId || document.getElementById('profileTopic')?.value;
    if (!selectedTopicId) { showToast('Choose a topic first.', 'warning'); return; }
    document.getElementById('subtopicModal').dataset.topicId = selectedTopicId;
    const nextPriority = getNextSubtopicPriority(selectedTopicId);
    populatePrioritySelect('subtopicPriority', nextPriority, nextPriority);
    openModal('subtopicModal');
}
function getProfilesBySubtopic(subtopicId) {
    const query = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
    return appState.profiles.filter(profile => profile.subtopicId === subtopicId && (!query || [profile.name, profile.username, profile.url, profile.notes].some(value => String(value || '').toLowerCase().includes(query)))).sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
}
function importData(data, mode = 'merge') {
    try {
        if (!data || !Array.isArray(data.platforms) || !Array.isArray(data.topics) || !Array.isArray(data.subtopics) || !Array.isArray(data.profiles)) throw new Error('Invalid backup file.');
        if (mode === 'replace') {
            appState.platforms = data.platforms; appState.topics = data.topics; appState.subtopics = data.subtopics; appState.profiles = data.profiles; appState.recycleBin = safeList(data.recycleBin); appState.settings = data.settings || appState.settings;
        } else {
            const merge = (current, incoming) => { const ids = new Set(current.map(item => item.id)); return current.concat(incoming.filter(item => !ids.has(item.id))); };
            appState.platforms = merge(appState.platforms, data.platforms); appState.topics = merge(appState.topics, data.topics); appState.subtopics = merge(appState.subtopics, data.subtopics); appState.profiles = merge(appState.profiles, data.profiles); appState.recycleBin = merge(appState.recycleBin, safeList(data.recycleBin));
        }
        saveData(); render(); showToast('Import completed.', 'success'); return true;
    } catch (error) { showToast(error.message || 'Could not import this file.', 'error'); return false; }
}
let _repairHandlersBound = false;
const _originalAttachEventListeners = attachEventListeners;
attachEventListeners = function () {
    _originalAttachEventListeners();
    document.getElementById('addTopicBtn').onclick = openAddTopicModal;
    document.getElementById('addPlatformBtn').onclick = openAddCustomPlatformModal;
    document.getElementById('importBtn').onclick = openImportModal;
    document.getElementById('recycleBinBtn').onclick = () => { renderRecycleBin(); openModal('recycleBinModal'); };
    document.getElementById('fetchProfileBtn').onclick = handleProfileFetch;
    document.getElementById('saveCustomPlatformBtn').onclick = () => {
        const name = document.getElementById('customPlatformName').value.trim();
        if (!name) { showToast('Enter a platform name.', 'warning'); return; }
        if (appState.platforms.some(item => item.name.toLowerCase() === name.toLowerCase())) { showToast('That platform already exists.', 'warning'); return; }
        const platform = createPlatform(name, document.getElementById('customPlatformIcon').value.trim());
        appState.settings.currentPlatformId = platform.id; closeModal('customPlatformModal'); saveData(); render();
    };
    document.getElementById('saveTopicBtn').onclick = () => {
        const name = document.getElementById('topicName').value.trim(); const platformId = appState.settings.currentPlatformId || appState.platforms[0]?.id;
        if (!name || !platformId) { showToast('Enter a topic name.', 'warning'); return; }
        const priority = Number(document.getElementById('topicPriority').value) || getNextTopicPriority(platformId);
        const topic = createTopic(platformId, name, priority);
        setHierarchyPosition('topic', topic.id, priority);
        saveData(); closeModal('topicModal'); render();
    };
    document.getElementById('saveSubtopicBtn').onclick = () => {
        const name = document.getElementById('subtopicName').value.trim(); const topicId = document.getElementById('subtopicModal').dataset.topicId || document.getElementById('profileTopic').value;
        if (!name || !topicId) { showToast('Enter a subtopic name.', 'warning'); return; }
        const priority = Number(document.getElementById('subtopicPriority').value) || getNextSubtopicPriority(topicId);
        const subtopic = createSubtopic(topicId, name, priority);
        setHierarchyPosition('subtopic', subtopic.id, priority);
        saveData(); closeModal('subtopicModal'); render();
    };
    document.getElementById('saveProfileBtn').onclick = async () => {
        const button = document.getElementById('saveProfileBtn');
        if (button.disabled) return;
        const urlInput = document.getElementById('profileUrl');
        const name = document.getElementById('profileName').value.trim();
        const platformId = document.getElementById('profilePlatform').value;
        const topicId = document.getElementById('profileTopic').value;
        const subtopicId = document.getElementById('profileSubtopic').value;
        let url;
        try {
            url = normalizeProfileUrl(urlInput.value).href;
            urlInput.value = url;
        } catch (error) {
            showToast(error.message || 'Enter a valid profile URL.', 'warning');
            urlInput.focus();
            return;
        }
        if (!name) { showToast('Enter a profile name.', 'warning'); return; }
        if (!platformId || getTopicById(topicId)?.platformId !== platformId || getSubtopicById(subtopicId)?.topicId !== topicId) {
            showToast('Choose a matching platform, topic, and subtopic.', 'warning');
            return;
        }
        const duplicate = checkDuplicateProfile(url);
        if (duplicate && duplicate.id !== currentEditingProfileId) {
            showToast('A profile with this URL already exists.', 'warning');
            return;
        }

        button.disabled = true;
        button.textContent = 'Saving…';
        try {
            const oldProfile = currentEditingProfileId ? getProfileById(currentEditingProfileId) : null;
            const previousSubtopicId = oldProfile?.subtopicId || null;
            const file = document.getElementById('profileImage').files?.[0];
            let imageId = oldProfile?.imageId || null;
            let imageWarning = false;
            if (file) {
                if (!file.type.startsWith('image/')) {
                    showToast('Choose an image file.', 'warning');
                    return;
                }
                try {
                    imageId = await saveImageToIndexedDB(file);
                } catch (error) {
                    console.error('Profile image could not be stored:', error);
                    imageWarning = true;
                }
            }

            const selectedPosition = Number(document.getElementById('profilePriority').value) || 1;
            const fetchedImageUrl = allowedProfileUrl(document.getElementById('previewImage').dataset.remoteUrl);
            const data = {
                url,
                name,
                username: document.getElementById('profileUsername').value.trim(),
                notes: document.getElementById('profileNotes').value.trim(),
                priority: selectedPosition,
                platformId,
                topicId,
                subtopicId,
                imageId,
                imageUrl: fetchedImageUrl || oldProfile?.imageUrl || null
            };
            const savedProfile = oldProfile
                ? (updateProfile(oldProfile.id, data), getProfileById(oldProfile.id))
                : createProfile(data);
            if (!savedProfile) throw new Error('The profile record could not be created.');
            if (previousSubtopicId && previousSubtopicId !== subtopicId) renumberProfiles(previousSubtopicId);
            setProfilePosition(savedProfile.id, subtopicId, selectedPosition);
            saveData();
            currentEditingProfileId = null;
            closeModal('profileModal');
            render();
            showToast(imageWarning ? 'Profile saved. Its photo could not be stored.' : 'Profile saved.', imageWarning ? 'warning' : 'success');
        } catch (error) {
            console.error('Profile save failed:', error);
            showToast(error.message || 'Could not save the profile.', 'error');
        } finally {
            button.disabled = false;
            button.textContent = 'Save Profile';
        }
    };
    document.getElementById('saveEditTopicBtn').onclick = () => { const name = document.getElementById('editTopicName').value.trim(); if (!name) return showToast('Enter a topic name.', 'warning'); const priority = Number(document.getElementById('editTopicPriority').value) || 1; updateTopic(currentEditingTopicId, { name, priority }); setHierarchyPosition('topic', currentEditingTopicId, priority); saveData(); closeModal('editTopicModal'); render(); };
    document.getElementById('saveEditSubtopicBtn').onclick = () => { const name = document.getElementById('editSubtopicName').value.trim(); if (!name) return showToast('Enter a subtopic name.', 'warning'); const priority = Number(document.getElementById('editSubtopicPriority').value) || 1; updateSubtopic(currentEditingSubtopicId, { name, priority }); setHierarchyPosition('subtopic', currentEditingSubtopicId, priority); saveData(); closeModal('editSubtopicModal'); render(); };
    document.getElementById('editProfileBtn').onclick = () => { const id = document.getElementById('profileDetailsContent').dataset.profileId; closeModal('profileDetailsModal'); editProfile(id); };
    document.getElementById('deleteProfileBtn').onclick = () => { const id = document.getElementById('profileDetailsContent').dataset.profileId; closeModal('profileDetailsModal'); confirmDelete('profile', id); };
    document.getElementById('previewImportBtn').onclick = async () => {
        const file = document.getElementById('importFile').files?.[0]; const preview = document.getElementById('importPreview'); if (!file) return showToast('Choose a JSON backup first.', 'warning');
        try { const data = JSON.parse(await file.text()); if (!data || !Array.isArray(data.platforms) || !Array.isArray(data.profiles)) throw new Error('This does not look like a profile saver backup.'); preview.textContent = `${data.platforms.length} platforms, ${safeList(data.topics).length} topics, ${safeList(data.profiles).length} profiles`; preview.style.display = 'block'; }
        catch (error) { preview.textContent = error.message; preview.style.display = 'block'; }
    };
    document.getElementById('confirmImportBtn').onclick = async () => {
        const file = document.getElementById('importFile').files?.[0]; if (!file) return showToast('Choose a JSON backup first.', 'warning');
        try { const data = JSON.parse(await file.text()); if (importData(data, document.getElementById('importMode').value)) closeModal('importModal'); } catch (error) { showToast(error.message || 'Invalid JSON file.', 'error'); }
    };
    document.getElementById('emptyRecycleBinBtn').onclick = async () => { if (!confirm('Permanently delete all recycled items?')) return; for (const item of [...appState.recycleBin]) await permanentDelete(item.id, true); renderRecycleBin(); };
    if (!_repairHandlersBound) {
        _repairHandlersBound = true;
        document.getElementById('searchInput').addEventListener('input', render);
        document.getElementById('profileDetailsContent').dataset.profileId = '';
        document.getElementById('profilePlatform').onchange = () => {
            updateTopicDropdown();
            refreshProfilePriorityOptions();
        };
        document.getElementById('profileTopic').onchange = () => {
            updateSubtopicDropdown();
            refreshProfilePriorityOptions();
        };
        document.getElementById('profileSubtopic').onchange = refreshProfilePriorityOptions;
        document.addEventListener('dragstart', event => {
            const node = event.target.closest('.platform-tab, .topic-header, .subtopic-header, .profile-card'); if (!node) return;
            draggedElement = node; draggedType = node.classList.contains('platform-tab') ? 'platform' : node.classList.contains('topic-header') ? 'topic' : node.classList.contains('subtopic-header') ? 'subtopic' : 'profile';
            draggedId = node.dataset.platformId || node.dataset.topicId || node.dataset.subtopicId || node.dataset.profileId; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', draggedId || '');
        });
        document.addEventListener('dragover', event => { if (event.target.closest('.platform-tab, .topic-header, .subtopic-header, .profile-card')) event.preventDefault(); });
        document.addEventListener('drop', event => {
            const target = event.target.closest('.platform-tab, .topic-header, .subtopic-header, .profile-card'); if (!target || !draggedElement || target === draggedElement) return; event.preventDefault();
            const targetType = target.classList.contains('platform-tab') ? 'platform' : target.classList.contains('topic-header') ? 'topic' : target.classList.contains('subtopic-header') ? 'subtopic' : 'profile'; if (targetType !== draggedType) return;
            const source = draggedElement.dataset; const dest = target.dataset; const id = source.platformId || source.topicId || source.subtopicId || source.profileId; const targetId = dest.platformId || dest.topicId || dest.subtopicId || dest.profileId;
            let list = draggedType === 'platform' ? appState.platforms : draggedType === 'topic' ? appState.topics : draggedType === 'subtopic' ? appState.subtopics : appState.profiles;
            const a = list.findIndex(item => item.id === id); const b = list.findIndex(item => item.id === targetId); if (a < 0 || b < 0) return;
            const [moved] = list.splice(a, 1); list.splice(b, 0, moved);
            const sameGroup = draggedType === 'topic' ? list.filter(item => item.platformId === moved.platformId) : draggedType === 'subtopic' ? list.filter(item => item.topicId === moved.topicId) : draggedType === 'profile' ? list.filter(item => item.subtopicId === moved.subtopicId) : list;
            sameGroup.forEach((item, index) => { item.order = index + 1; if (draggedType !== 'platform') item.priority = index + 1; }); saveData(); render();
        });
    }
};
const _originalViewProfileDetails = viewProfileDetails;
viewProfileDetails = function (profileId) {
    const content = document.getElementById('profileDetailsContent');
    content.dataset.profileId = profileId;
    _originalViewProfileDetails(profileId);
    const profile = getProfileById(profileId);
    const fallback = content.querySelector('.profile-image-placeholder');
    if (fallback) fallback.textContent = String(profile?.name || '?').trim().charAt(0).toUpperCase() || '?';
    content.querySelectorAll('div').forEach(label => {
        if (label.textContent.trim() === 'Priority' && label.nextElementSibling) {
            label.nextElementSibling.textContent = String(profile?.priority || profile?.order || 1);
        }
    });
    if (!profile?.imageId && profile?.imageUrl) {
        const imageUrl = allowedProfileUrl(profile.imageUrl);
        const container = content.querySelector('.profile-image-container');
        if (imageUrl && container) {
            const image = document.createElement('img');
            image.src = imageUrl;
            image.alt = `${profile.name || 'Profile'} photo`;
            image.className = 'profile-image';
            container.replaceChildren(image);
        }
    }
};
function allowedProfileUrl(value) {
    try { const parsed = new URL(String(value || '')); return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : ''; }
    catch { return ''; }
}
const _originalImportData = importData;
importData = function (data, mode = 'merge') {
    if (data && Array.isArray(data.profiles)) data.profiles = data.profiles.map(profile => ({ ...profile, url: allowedProfileUrl(profile.url), name: String(profile.name || 'Untitled profile'), username: String(profile.username || ''), notes: String(profile.notes || '') }));
    return _originalImportData(data, mode);
};
const _originalRender = render;
render = function () {
    _originalRender();
    const tabs = document.getElementById('platformTabsContainer');
    if (tabs) {
        const alignTabs = () => tabs.classList.toggle('has-overflow', tabs.scrollWidth > tabs.clientWidth + 1);
        requestAnimationFrame(alignTabs);
        if (!window._platformTabResizeBound) {
            window._platformTabResizeBound = true;
            window.addEventListener('resize', alignTabs);
        }
    }
    tabs?.querySelectorAll('.platform-tab').forEach(tab => {
        if (tab.querySelector('.platform-delete')) return;
        const id = tab.dataset.platformId;
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'platform-delete'; remove.title = 'Move platform to recycle bin'; remove.setAttribute('aria-label', 'Delete platform'); remove.textContent = '×';
        remove.onclick = event => { event.stopPropagation(); confirmDelete('platform', id); };
        tab.appendChild(remove);
    });
};

function moveHierarchyItem(type, id, requestedPosition) {
    const item = type === 'topic' ? getTopicById(id) : getSubtopicById(id);
    if (!item) return;
    const siblings = type === 'topic'
        ? appState.topics.filter(candidate => candidate.platformId === item.platformId)
        : appState.subtopics.filter(candidate => candidate.topicId === item.topicId);
    siblings.sort((a, b) => (Number(a.priority) || 9999) - (Number(b.priority) || 9999) || (Number(a.order) || 0) - (Number(b.order) || 0));
    const oldIndex = siblings.findIndex(candidate => candidate.id === id);
    const [moved] = siblings.splice(oldIndex, 1);
    siblings.splice(Math.max(0, Math.min(siblings.length, requestedPosition - 1)), 0, moved);
    siblings.forEach((candidate, index) => {
        candidate.priority = index + 1;
        candidate.order = index + 1;
    });
    saveData();
    render();
}

function addHierarchyPrioritySelect(header, type, item, siblingCount) {
    const title = header.querySelector(type === 'topic' ? '.topic-title' : '.subtopic-title');
    if (!title || title.querySelector('.hierarchy-priority-select')) return;
    const select = document.createElement('select');
    select.className = `hierarchy-priority-select ${type}-priority-select`;
    select.setAttribute('aria-label', `${type === 'topic' ? 'Topic' : 'Subtopic'} priority`);
    for (let priority = 1; priority <= siblingCount; priority += 1) {
        const option = document.createElement('option');
        option.value = String(priority);
        option.textContent = String(priority);
        select.appendChild(option);
    }
    select.value = String(item.priority || 1);
    select.addEventListener('click', event => event.stopPropagation());
    select.addEventListener('change', event => {
        event.stopPropagation();
        moveHierarchyItem(type, item.id, Number(select.value));
    });
    title.prepend(select);
}

function addHierarchyPriorityControls() {
    const topics = appState.topics;
    document.querySelectorAll('.topic-section').forEach(section => {
        const topic = topics.find(item => item.id === section.dataset.topicId);
        if (!topic) return;
        const count = topics.filter(item => item.platformId === topic.platformId).length;
        addHierarchyPrioritySelect(section.querySelector('.topic-header'), 'topic', topic, count);
    });
    document.querySelectorAll('.subtopic-section').forEach(section => {
        const subtopic = appState.subtopics.find(item => item.id === section.dataset.subtopicId);
        if (!subtopic) return;
        const count = appState.subtopics.filter(item => item.topicId === subtopic.topicId).length;
        addHierarchyPrioritySelect(section.querySelector('.subtopic-header'), 'subtopic', subtopic, count);
    });
}

const _renderWithPriorityControls = render;
render = function () {
    _renderWithPriorityControls();
    addHierarchyPriorityControls();
};
/* Build platform tabs with text nodes so imported names/icons stay inert. */
Object.assign(PLATFORM_ICONS, { instagram: '📷', youtube: '▶️', linkedin: '💼', reddit: '🤖', facebook: 'f', twitter: 'X', x: 'X', threads: '◉', pinterest: '📌', snapchat: '👻', telegram: '✈️', discord: '💬', github: '🐙', medium: 'M', quora: 'Q', twitch: '🎮', tiktok: '🎵' });
renderPlatformTabs = function () {
    const container = document.getElementById('platformTabsContainer'); if (!container) return;
    container.replaceChildren();
    let repairedIcons = false;
    const platforms = [...appState.platforms].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
    const selectedId = appState.settings.currentPlatformId || platforms[0]?.id || null;
    appState.settings.currentPlatformId = selectedId;
    platforms.forEach(platform => {
        if (/[\u00f0\u00e2\u00ef\ufffd]/i.test(String(platform.icon || ''))) {
            const key = String(platform.name || '').trim().toLowerCase();
            platform.icon = PLATFORM_ICONS[key] || '🌐';
            repairedIcons = true;
        }
        const tab = document.createElement('div'); tab.className = `platform-tab${platform.id === selectedId ? ' active' : ''}`; tab.draggable = true; tab.dataset.platformId = platform.id;
        tab.append(document.createTextNode(`${String(platform.icon || '')} ${String(platform.name || '')}`));
        tab.onclick = () => { appState.settings.currentPlatformId = platform.id; saveData(); render(); };
        container.appendChild(tab);
    });
    if (repairedIcons) saveData();
};

renderProfileCard = async function (profile) {
    const card = document.createElement('article');
    card.className = 'profile-card profile-card-compact';
    card.draggable = true;
    card.dataset.profileId = profile.id;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `View ${profile.name || 'profile'} details`);

    const photo = document.createElement('div');
    photo.className = 'profile-image-container';
    if (profile.imageId) {
        try {
            const imageUrl = await getImageFromIndexedDB(profile.imageId);
            if (imageUrl) {
                const image = document.createElement('img');
                image.src = imageUrl;
                image.alt = `${profile.name || 'Profile'} photo`;
                image.className = 'profile-image';
                photo.appendChild(image);
            }
        } catch (error) {
            console.error('Could not load profile photo:', error);
        }
    }
    if (!photo.firstChild && profile.imageUrl) {
        const imageUrl = allowedProfileUrl(profile.imageUrl);
        if (imageUrl) {
            const image = document.createElement('img');
            image.src = imageUrl;
            image.alt = `${profile.name || 'Profile'} photo`;
            image.className = 'profile-image';
            image.onerror = () => {
                image.remove();
                const fallback = document.createElement('div');
                fallback.className = 'profile-image-placeholder';
                fallback.textContent = String(profile.name || '?').trim().charAt(0).toUpperCase() || '?';
                photo.appendChild(fallback);
            };
            photo.appendChild(image);
        }
    }
    if (!photo.firstChild) {
        const fallback = document.createElement('div');
        fallback.className = 'profile-image-placeholder';
        fallback.textContent = String(profile.name || '?').trim().charAt(0).toUpperCase() || '?';
        photo.appendChild(fallback);
    }

    const name = document.createElement('div');
    name.className = 'profile-name';
    name.textContent = profile.name || 'Untitled profile';
    card.append(photo, name);
    card.addEventListener('click', () => viewProfileDetails(profile.id));
    card.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            viewProfileDetails(profile.id);
        }
    });
    return card;
};

const _renderWithTopicEmptyStateFix = render;
render = function () {
    _renderWithTopicEmptyStateFix();
    const content = document.getElementById('contentArea');
    if (!content) return;
    content.querySelectorAll('.empty-state').forEach(emptyState => {
        const title = emptyState.querySelector('.empty-state-title')?.textContent.trim();
        const icon = emptyState.querySelector('.empty-state-icon');
        const button = emptyState.querySelector('button');
        if (title === 'No Topics Yet') {
            if (icon) icon.textContent = '▤';
            if (button) {
                button.textContent = '+ Add Topic';
                button.removeAttribute('onclick');
                button.onclick = openAddTopicModal;
            }
        } else if (title === 'No Subtopics') {
            emptyState.classList.add('empty-state-compact');
            emptyState.style.padding = '.4rem .55rem';
            if (icon) icon.remove();
            if (button) {
                const topicId = emptyState.closest('.topic-section')?.dataset.topicId;
                button.textContent = '+ Add Subtopic';
                button.removeAttribute('onclick');
                button.onclick = () => openAddSubtopicModal(topicId);
            }
        }
        if (icon) icon.setAttribute('aria-hidden', 'true');
    });
    content.querySelectorAll('.subtopic-empty .empty-state-icon').forEach(icon => {
        icon.textContent = '○';
        icon.setAttribute('aria-hidden', 'true');
    });
};

function refreshProfilePriorityOptions() {
    const select = document.getElementById('profilePriority');
    const subtopicId = document.getElementById('profileSubtopic')?.value;
    if (!select) return;
    const editingProfile = currentEditingProfileId ? getProfileById(currentEditingProfileId) : null;
    const profiles = appState.profiles.filter(profile => profile.subtopicId === subtopicId && profile.id !== currentEditingProfileId);
    const maxPosition = profiles.length + 1;
    select.replaceChildren();
    for (let position = 1; position <= maxPosition; position += 1) {
        const option = document.createElement('option');
        option.value = String(position);
        option.textContent = String(position);
        select.appendChild(option);
    }
    const suggested = editingProfile ? Math.min(Number(editingProfile.priority) || 1, maxPosition) : maxPosition;
    select.value = String(suggested);
}

function renumberProfiles(subtopicId) {
    const profiles = appState.profiles
        .filter(profile => profile.subtopicId === subtopicId)
        .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
    profiles.forEach((profile, index) => {
        profile.order = index + 1;
        profile.priority = index + 1;
    });
}

function setProfilePosition(profileId, subtopicId, requestedPosition) {
    const profiles = appState.profiles
        .filter(profile => profile.subtopicId === subtopicId)
        .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
    const currentIndex = profiles.findIndex(profile => profile.id === profileId);
    if (currentIndex < 0) return;
    const [profile] = profiles.splice(currentIndex, 1);
    profiles.splice(Math.max(0, Math.min(profiles.length, requestedPosition - 1)), 0, profile);
    profiles.forEach((item, index) => {
        item.priority = index + 1;
        item.order = index + 1;
    });
}

function setHierarchyPosition(type, id, requestedPosition) {
    const item = type === 'topic' ? getTopicById(id) : getSubtopicById(id);
    if (!item) return;
    const siblings = type === 'topic'
        ? appState.topics.filter(candidate => candidate.platformId === item.platformId)
        : appState.subtopics.filter(candidate => candidate.topicId === item.topicId);
    siblings.sort((a, b) => (Number(a.priority) || 9999) - (Number(b.priority) || 9999) || (Number(a.order) || 0) - (Number(b.order) || 0));
    const currentIndex = siblings.findIndex(candidate => candidate.id === id);
    if (currentIndex < 0) return;
    const [moved] = siblings.splice(currentIndex, 1);
    siblings.splice(Math.max(0, Math.min(siblings.length, Number(requestedPosition) - 1)), 0, moved);
    siblings.forEach((candidate, index) => {
        candidate.priority = index + 1;
        candidate.order = index + 1;
    });
}

const _openProfileModalWithPriority = openAddProfileModal;
openAddProfileModal = function () {
    _openProfileModalWithPriority();
    const previewImage = document.getElementById('previewImage');
    previewImage.removeAttribute('src');
    delete previewImage.dataset.remoteUrl;
    refreshProfilePriorityOptions();
};
const _quickAddProfileWithPriority = quickAddProfile;
quickAddProfile = function (subtopicId) {
    _quickAddProfileWithPriority(subtopicId);
    const previewImage = document.getElementById('previewImage');
    previewImage.removeAttribute('src');
    delete previewImage.dataset.remoteUrl;
    refreshProfilePriorityOptions();
};
const _editProfileWithPriority = editProfile;
editProfile = function (profileId) {
    _editProfileWithPriority(profileId);
    const previewImage = document.getElementById('previewImage');
    const profile = getProfileById(profileId);
    if (profile?.imageUrl) {
        previewImage.src = profile.imageUrl;
        previewImage.dataset.remoteUrl = profile.imageUrl;
    } else {
        previewImage.removeAttribute('src');
        delete previewImage.dataset.remoteUrl;
    }
    refreshProfilePriorityOptions();
};

function normalizeProfileUrl(value) {
    let text = String(value || '').trim();
    if (!text) throw new Error('Paste a profile URL first.');
    if (!/^[a-z][a-z\d+.-]*:\/\//i.test(text)) text = `https://${text}`;
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use an http or https profile link.');
    return url;
}

function getPlatformFromHost(hostname) {
    const host = hostname.toLowerCase().replace(/^www\./, '');
    const domains = [
        [['instagram.com'], 'instagram'], [['youtube.com', 'youtu.be'], 'youtube'],
        [['linkedin.com'], 'linkedin'], [['reddit.com', 'redd.it'], 'reddit'],
        [['facebook.com', 'fb.com'], 'facebook'], [['x.com'], 'x'], [['twitter.com'], 'twitter'],
        [['threads.net'], 'threads'], [['pinterest.com', 'pin.it'], 'pinterest'],
        [['snapchat.com'], 'snapchat'], [['t.me', 'telegram.me', 'telegram.org'], 'telegram'],
        [['discord.com', 'discord.gg'], 'discord'], [['github.com'], 'github'],
        [['medium.com'], 'medium'], [['quora.com'], 'quora'], [['twitch.tv'], 'twitch'],
        [['tiktok.com'], 'tiktok']
    ];
    const match = domains.find(([hosts]) => hosts.some(domain => host === domain || host.endsWith(`.${domain}`)));
    if (!match) return null;
    const key = match[1];
    const aliases = key === 'x' || key === 'twitter' ? ['x', 'twitter'] : [key];
    return appState.platforms.find(platform => aliases.includes(platform.name.toLowerCase())) || null;
}

function extractMetadataFromUrl(value) {
    const url = value instanceof URL ? value : normalizeProfileUrl(value);
    const segments = url.pathname.split('/').filter(Boolean).map(segment => {
        try { return decodeURIComponent(segment); } catch { return segment; }
    });
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let handle = '';
    const takeFirst = () => segments[0] || '';
    if (host === 'youtu.be' || host === 'redd.it' || host === 'pin.it') handle = '';
    else if (host.endsWith('youtube.com')) handle = segments.find(part => part.startsWith('@')) || (['user', 'channel', 'c'].includes(segments[0]) ? segments[1] || '' : '');
    else if (host.endsWith('linkedin.com')) handle = ['in', 'company', 'school', 'showcase'].includes(segments[0]) ? segments[1] || '' : '';
    else if (host.endsWith('reddit.com')) handle = ['u', 'user'].includes(segments[0]) ? segments[1] || '' : '';
    else if (host.endsWith('tiktok.com')) handle = takeFirst().startsWith('@') ? takeFirst() : '';
    else if (host.endsWith('t.me') || host.endsWith('telegram.me')) handle = takeFirst();
    else if (host.endsWith('discord.gg') || host.endsWith('discord.com')) handle = '';
    else if (host.endsWith('facebook.com') && ['profile.php', 'groups', 'watch', 'share'].includes(takeFirst().toLowerCase())) handle = '';
    else if (['instagram.com', 'threads.net'].some(domain => host.endsWith(domain)) && ['p', 'reel', 'reels', 'stories', 'explore', 'direct', 'accounts'].includes(takeFirst().toLowerCase())) handle = '';
    else if (['x.com', 'twitter.com'].some(domain => host.endsWith(domain)) && ['home', 'explore', 'search', 'i', 'intent', 'share'].includes(takeFirst().toLowerCase())) handle = '';
    else handle = takeFirst();

    handle = handle.replace(/^@/, '').replace(/\/$/, '');
    const display = handle.replace(/[._-]+/g, ' ').trim().replace(/\b\w/g, letter => letter.toUpperCase());
    return { username: handle, name: display || (host.split('.')[0] ? `${host.split('.')[0][0].toUpperCase()}${host.split('.')[0].slice(1)} Profile` : 'Social Profile'), image: null, source: 'url' };
}

async function fetchProfileMetadata(value) {
    const url = value instanceof URL ? value : normalizeProfileUrl(value);
    const fallback = extractMetadataFromUrl(url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    try {
        const response = await fetch(url.href, { method: 'GET', mode: 'cors', credentials: 'omit', signal: controller.signal });
        if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return fallback;
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const meta = key => doc.querySelector(`meta[property="${key}"], meta[name="${key}"]`)?.content?.trim() || '';
        const title = meta('og:title') || meta('twitter:title') || doc.title || '';
        const image = meta('og:image') || meta('twitter:image') || '';
        const cleanedTitle = title.replace(/\s*[|•–-]\s*(Instagram|YouTube|LinkedIn|Reddit|Facebook|X|Twitter|TikTok).*$/i, '').trim();
        let imageUrl = '';
        try { if (image) imageUrl = new URL(image, url).href; } catch { /* Ignore malformed page metadata. */ }
        return { username: fallback.username, name: cleanedTitle || fallback.name, image: imageUrl || null, source: title ? 'page' : 'url' };
    } catch {
        // Social sites commonly deny cross-origin requests; URL-derived details remain usable.
        return fallback;
    } finally {
        clearTimeout(timeout);
    }
}

async function handleProfileFetch() {
    const urlInput = document.getElementById('profileUrl');
    const button = document.getElementById('fetchProfileBtn');
    const preview = document.getElementById('profilePreview');
    const previewImage = document.getElementById('previewImage');
    const nameInput = document.getElementById('profileName');
    const usernameInput = document.getElementById('profileUsername');
    let url;
    try {
        url = normalizeProfileUrl(urlInput.value);
        urlInput.value = url.href;
    } catch (error) {
        showToast(error.message || 'Enter a valid profile URL.', 'warning');
        urlInput.focus();
        return;
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Fetching…';
    preview.style.display = 'none';
    previewImage.removeAttribute('src');
    delete previewImage.dataset.remoteUrl;
    previewImage.style.display = 'none';
    let metadata = extractMetadataFromUrl(url);
    const platform = getPlatformFromHost(url.hostname);
    try { metadata = await fetchProfileMetadata(url); } catch { /* Keep URL-derived fallback. */ }

    if (platform) {
        document.getElementById('profilePlatform').value = platform.id;
        updateTopicDropdown();
        document.getElementById('previewPlatform').textContent = `${platform.icon || ''} ${platform.name}`;
    } else {
        document.getElementById('previewPlatform').textContent = 'Platform not detected — select one below';
    }
    if (!nameInput.value.trim()) nameInput.value = metadata.name || '';
    if (!usernameInput.value.trim() && metadata.username) usernameInput.value = `@${metadata.username.replace(/^@/, '')}`;
    document.getElementById('previewName').textContent = metadata.name || 'Profile details unavailable';
    document.getElementById('previewUsername').textContent = metadata.username ? `@${metadata.username.replace(/^@/, '')}` : 'Username unavailable';
    if (metadata.image) {
        previewImage.src = metadata.image;
        previewImage.dataset.remoteUrl = metadata.image;
        previewImage.style.display = '';
        previewImage.onerror = () => { previewImage.style.display = 'none'; };
    }
    preview.style.display = 'flex';
    button.disabled = false;
    button.textContent = originalText;
    const status = metadata.source === 'page' ? 'Public profile details fetched.' : 'Used profile details from the URL. The site did not expose public metadata.';
    showToast(platform ? status : `${status} Select a platform to continue.`, 'info');
}
