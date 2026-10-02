// ==================== CONFIGURATION ==================== 
const STORAGE_KEY = 'socialMediaProfileSaver';
const SCHEMA_VERSION = 1;
const PLATFORM_ICONS = {
    instagram: 'ðŸ“·',
    youtube: 'â–¶ï¸',
    linkedin: 'ðŸ’¼',
    reddit: 'ðŸ¤–',
    facebook: 'f',
    twitter: 'X',
    x: 'X',
    threads: 'â—Ž',
    pinterest: 'ðŸ“Œ',
    snapchat: 'ðŸ‘»',
    telegram: 'âœˆï¸',
    discord: 'ðŸ’¬',
    github: 'ðŸ™',
    medium: 'M',
    quora: 'Q',
    twitch: 'ðŸŽ®',
    tiktok: 'ðŸŽµ'
};

const DEFAULT_PLATFORMS = [
    { name: 'Instagram', order: 1 },
    { name: 'YouTube', order: 2 },
    { name: 'LinkedIn', order: 3 },
    { name: 'Reddit', order: 4 },
    { name: 'Facebook', order: 5 },
    { name: 'X', order: 6 },
    { name: 'Threads', order: 7 },
    { name: 'Pinterest', order: 8 },
    { name: 'Snapchat', order: 9 },
    { name: 'Telegram', order: 10 },
    { name: 'Discord', order: 11 },
    { name: 'TikTok', order: 12 },
    { name: 'GitHub', order: 13 },
    { name: 'Medium', order: 14 },
    { name: 'Quora', order: 15 },
    { name: 'Twitch', order: 16 }
];

// ==================== STATE MANAGEMENT ==================== 
const appState = {
    platforms: [],
    topics: [],
    subtopics: [],
    profiles: [],
    recycleBin: [],
    settings: {
        currentPlatformId: null,
        sortOrder: 'priority'
    }
};

let db; // IndexedDB database
let currentEditingProfileId = null;
let currentEditingTopicId = null;
let currentEditingSubtopicId = null;
let currentActionCallback = null;
let draggedElement = null;
let draggedType = null; // 'platform', 'topic', 'subtopic', 'profile'
let draggedId = null;

// ==================== INITIALIZATION ==================== 
function showDemoModal() {
    openModal('demoDataModal');
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initializeIndexedDB();
    } catch (error) {
        console.error('Image storage is unavailable:', error);
    }
    await loadData();
    
    // Always attach event listeners first
    attachEventListeners();
    
    if (appState.platforms.length === 0) {
        showDemoModal();
    } else {
        render();
    }
});

function initializeIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('socialMediaProfileSaver', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve();
        };
        
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains('images')) {
                database.createObjectStore('images', { keyPath: 'id' });
            }
        };
    });
}

async function loadData() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        try {
            const data = JSON.parse(stored);
            appState.platforms = data.platforms || [];
            appState.topics = data.topics || [];
            appState.subtopics = data.subtopics || [];
            appState.profiles = data.profiles || [];
            appState.recycleBin = data.recycleBin || [];
            appState.settings = data.settings || { currentPlatformId: null, sortOrder: 'priority' };
        } catch (e) {
            console.error('Error loading data:', e);
            showToast('Error loading data', 'error');
        }
    }
}

async function saveData() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            version: SCHEMA_VERSION,
            exportedAt: new Date().toISOString(),
            platforms: appState.platforms,
            topics: appState.topics,
            subtopics: appState.subtopics,
            profiles: appState.profiles,
            recycleBin: appState.recycleBin,
            settings: appState.settings
        }));
    } catch (e) {
        console.error('Error saving data:', e);
        showToast('Error saving data', 'error');
    }
}

// ==================== UNIQUE ID GENERATION ==================== 
function generateId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ==================== PLATFORM MANAGEMENT ==================== 
function createPlatform(name, icon = 'ðŸŒ') {
    const platform = {
        id: generateId('platform'),
        name: name,
        icon: icon || getPlatformIcon(name),
        order: (appState.platforms.length || 0) + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    appState.platforms.push(platform);
    saveData();
    return platform;
}

function getPlatformIcon(name) {
    const key = name.toLowerCase().replace(/\s+/g, '');
    return PLATFORM_ICONS[key] || 'ðŸŒ';
}

function getPlatformById(id) {
    return appState.platforms.find(p => p.id === id);
}

function deletePlatform(platformId) {
    // Move all related topics to recycle
    const topicsInPlatform = appState.topics.filter(t => t.platformId === platformId);
    topicsInPlatform.forEach(topic => {
        addToRecycleBin(topic.id, 'topic', topic.platformId, null, null, topic.order);
    });
    
    // Move all profile to recycle
    const profilesInPlatform = appState.profiles.filter(p => p.platformId === platformId);
    profilesInPlatform.forEach(profile => {
        addToRecycleBin(profile.id, 'profile', profile.platformId, profile.topicId, profile.subtopicId, profile.order);
    });

    appState.platforms = appState.platforms.filter(p => p.id !== platformId);
    saveData();
}

// ==================== TOPIC MANAGEMENT ==================== 
function createTopic(platformId, name, priority = null) {
    const platformTopics = appState.topics.filter(t => t.platformId === platformId);
    const topic = {
        id: generateId('topic'),
        platformId: platformId,
        name: name,
        priority: priority !== null ? Number(priority) : getNextPriorityForTopic(platformId),
        order: (platformTopics.length || 0) + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    appState.topics.push(topic);
    saveData();
    return topic;
}

function getNextPriorityForTopic(platformId) {
    const platformTopics = appState.topics.filter(t => t.platformId === platformId);
    return platformTopics.length ? Math.max(...platformTopics.map(t => Number(t.priority) || 1)) + 1 : 1;
}

function getTopicsByPlatform(platformId) {
    return appState.topics
        .filter(t => t.platformId === platformId)
        .sort((a, b) => (Number(a.priority) || 9999) - (Number(b.priority) || 9999) || (a.order || 0) - (b.order || 0));
}

function getTopicById(id) {
    return appState.topics.find(t => t.id === id);
}

function updateTopic(topicId, updates) {
    const topic = getTopicById(topicId);
    if (topic) {
        Object.assign(topic, updates, { updatedAt: new Date().toISOString() });
        if (updates.priority !== undefined) {
            topic.priority = Number(updates.priority);
        }
        saveData();
    }
}

function deleteTopic(topicId) {
    const topic = getTopicById(topicId);
    if (topic) {
        // Move subtopics to recycle
        const subtopicsInTopic = appState.subtopics.filter(s => s.topicId === topicId);
        subtopicsInTopic.forEach(subtopic => {
            addToRecycleBin(subtopic.id, 'subtopic', topic.platformId, topicId, null, subtopic.order);
        });

        // Move profiles to recycle
        const profilesInTopic = appState.profiles.filter(p => p.topicId === topicId);
        profilesInTopic.forEach(profile => {
            addToRecycleBin(profile.id, 'profile', profile.platformId, topicId, profile.subtopicId, profile.order);
        });

        appState.topics = appState.topics.filter(t => t.id !== topicId);
        saveData();
    }
}

// ==================== SUBTOPIC MANAGEMENT ==================== 
function createSubtopic(topicId, name, priority = null) {
    const topicSubtopics = appState.subtopics.filter(s => s.topicId === topicId);
    const subtopic = {
        id: generateId('subtopic'),
        topicId: topicId,
        name: name,
        priority: priority !== null ? Number(priority) : getNextPriorityForSubtopic(topicId),
        order: (topicSubtopics.length || 0) + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    appState.subtopics.push(subtopic);
    saveData();
    return subtopic;
}

function getNextPriorityForSubtopic(topicId) {
    const topicSubtopics = appState.subtopics.filter(subtopic => subtopic.topicId === topicId);
    return topicSubtopics.length ? Math.max(...topicSubtopics.map(s => Number(s.priority) || 1)) + 1 : 1;
}

function getSubtopicsByTopic(topicId) {
    return appState.subtopics
        .filter(s => s.topicId === topicId)
        .sort((a, b) => (Number(a.priority) || 9999) - (Number(b.priority) || 9999) || (a.order || 0) - (b.order || 0));
}

function getSubtopicById(id) {
    return appState.subtopics.find(s => s.id === id);
}

function updateSubtopic(subtopicId, updates) {
    const subtopic = getSubtopicById(subtopicId);
    if (subtopic) {
        Object.assign(subtopic, updates, { updatedAt: new Date().toISOString() });
        if (updates.priority !== undefined) {
            subtopic.priority = Number(updates.priority);
        }
        saveData();
    }
}

function deleteSubtopic(subtopicId) {
    const subtopic = getSubtopicById(subtopicId);
    if (subtopic) {
        // Move profiles to recycle
        const profilesInSubtopic = appState.profiles.filter(p => p.subtopicId === subtopicId);
        const topic = getTopicById(subtopic.topicId);
        profilesInSubtopic.forEach(profile => {
            addToRecycleBin(profile.id, 'profile', profile.platformId, subtopic.topicId, subtopicId, profile.order);
        });

        appState.subtopics = appState.subtopics.filter(s => s.id !== subtopicId);
        saveData();
    }
}

// ==================== PROFILE MANAGEMENT ==================== 
function createProfile(profileData) {
    const profile = {
        id: generateId('profile'),
        platformId: profileData.platformId,
        topicId: profileData.topicId,
        subtopicId: profileData.subtopicId,
        name: profileData.name,
        username: profileData.username || '',
        url: profileData.url || '',
        imageId: profileData.imageId || null,
        priority: profileData.priority || 3,
        notes: profileData.notes || '',
        order: (appState.profiles.filter(p => p.subtopicId === profileData.subtopicId).length || 0) + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    appState.profiles.push(profile);
    saveData();
    return profile;
}

function getProfilesBySubtopic(subtopicId) {
    return appState.profiles.filter(p => p.subtopicId === subtopicId).sort((a, b) => a.order - b.order);
}

function getProfileById(id) {
    return appState.profiles.find(p => p.id === id);
}

function updateProfile(profileId, updates) {
    const profile = getProfileById(profileId);
    if (profile) {
        Object.assign(profile, updates, { updatedAt: new Date().toISOString() });
        saveData();
    }
}

function deleteProfile(profileId) {
    const profile = getProfileById(profileId);
    if (profile) {
        addToRecycleBin(profileId, 'profile', profile.platformId, profile.topicId, profile.subtopicId, profile.order);
        appState.profiles = appState.profiles.filter(p => p.id !== profileId);
        saveData();
    }
}

// ==================== DUPLICATE PROFILE DETECTION ==================== 
function checkDuplicateProfile(url) {
    const normalizedUrl = normalizeUrl(url);
    return appState.profiles.find(p => normalizeUrl(p.url) === normalizedUrl);
}

function normalizeUrl(url) {
    if (!url) return '';
    return url.toLowerCase().trim().replace(/\/$/, '').replace(/https?:\/\/(www\.)?/, '');
}

// ==================== IMAGE MANAGEMENT ==================== 
async function saveImageToIndexedDB(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const imageId = generateId('image');
            const transaction = db.transaction(['images'], 'readwrite');
            const objectStore = transaction.objectStore('images');
            
            objectStore.add({
                id: imageId,
                data: e.target.result,
                createdAt: new Date().toISOString()
            });
            
            transaction.oncomplete = () => resolve(imageId);
            transaction.onerror = () => reject(transaction.error);
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
    });
}

async function getImageFromIndexedDB(imageId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['images'], 'readonly');
        const objectStore = transaction.objectStore('images');
        const request = objectStore.get(imageId);
        
        request.onsuccess = () => {
            if (request.result) {
                const blob = new Blob([request.result.data]);
                resolve(URL.createObjectURL(blob));
            } else {
                resolve(null);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

async function deleteImageFromIndexedDB(imageId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['images'], 'readwrite');
        const objectStore = transaction.objectStore('images');
        const request = objectStore.delete(imageId);
        
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

// ==================== PROFILE URL DETECTION ==================== 
function detectPlatformFromUrl(url) {
    const urlLower = url.toLowerCase();
    const patterns = {
        instagram: /instagram\.com/,
        youtube: /(youtube\.com|youtu\.be)/,
        linkedin: /linkedin\.com/,
        reddit: /reddit\.com/,
        facebook: /facebook\.com/,
        twitter: /twitter\.com/,
        x: /x\.com/,
        threads: /threads\.net/,
        pinterest: /pinterest\.com/,
        snapchat: /snapchat\.com/,
        telegram: /t\.me|telegram\.org/,
        discord: /discord\.com|discord\.gg/,
        github: /github\.com/,
        medium: /medium\.com/,
        quora: /quora\.com/,
        twitch: /twitch\.tv/,
        tiktok: /tiktok\.com/
    };

    for (const [platform, pattern] of Object.entries(patterns)) {
        if (pattern.test(urlLower)) {
            // Find platform by name
            return appState.platforms.find(p => p.name.toLowerCase() === platform);
        }
    }
    return null;
}

// ==================== PROFILE METADATA RETRIEVAL ==================== 
async function fetchProfileMetadata(url) {
    try {
        // Try to fetch OpenGraph metadata
        const response = await fetch(url, {
            method: 'HEAD',
            mode: 'no-cors'
        });

        // For CORS issues, try alternative methods
        // Since most social platforms block direct scraping, we'll use a fallback approach
        return extractMetadataFromUrl(url);
    } catch (error) {
        console.log('Could not fetch metadata:', error);
        return null;
    }
}

function extractMetadataFromUrl(url) {
    // Extract username/handle from URL
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.replace(/\//g, '').split('?')[0];
    
    return {
        username: pathname || 'Unknown',
        name: pathname || 'Unknown Profile',
        image: null
    };
}

// ==================== RECYCLE BIN ==================== 
function addToRecycleBin(itemId, itemType, platformId, topicId = null, subtopicId = null, order = 0) {
    const trashItem = {
        id: generateId('trash'),
        itemId: itemId,
        itemType: itemType, // 'profile', 'topic', 'subtopic', 'platform'
        originalPlatformId: platformId,
        originalTopicId: topicId,
        originalSubtopicId: subtopicId,
        originalOrder: order,
        deletedAt: new Date().toISOString()
    };
    appState.recycleBin.push(trashItem);
    saveData();
}

function restoreFromRecycleBin(trashId) {
    const trashItem = appState.recycleBin.find(t => t.id === trashId);
    if (!trashItem) return;

    const itemId = trashItem.itemId;
    const itemType = trashItem.itemType;
    const platformId = trashItem.originalPlatformId;
    const topicId = trashItem.originalTopicId;
    const subtopicId = trashItem.originalSubtopicId;

    try {
        if (itemType === 'profile') {
            const profile = appState.profiles.find(p => p.id === itemId);
            if (!profile) {
                // Profile was already permanently deleted, can't restore
                return false;
            }
            // Profile is restored, just remove from recycle bin
        } else if (itemType === 'topic') {
            const topic = appState.topics.find(t => t.id === itemId);
            if (!topic) {
                return false;
            }
            // Restore associated subtopics and profiles
            const relatedSubtopics = appState.subtopics.filter(s => s.topicId === itemId);
            relatedSubtopics.forEach(s => {
                appState.profiles = appState.profiles.filter(p => p.subtopicId !== s.id);
            });
            appState.subtopics = appState.subtopics.filter(s => s.topicId !== itemId);
        } else if (itemType === 'subtopic') {
            const subtopic = appState.subtopics.find(s => s.id === itemId);
            if (!subtopic) {
                return false;
            }
            // Restore associated profiles
            appState.profiles = appState.profiles.filter(p => p.subtopicId !== itemId);
        }

        appState.recycleBin = appState.recycleBin.filter(t => t.id !== trashId);
        saveData();
        return true;
    } catch (e) {
        console.error('Error restoring item:', e);
        return false;
    }
}

function permanentlyDeleteItem(trashId) {
    const trashItem = appState.recycleBin.find(t => t.id === trashId);
    if (!trashItem) return;

    const itemId = trashItem.itemId;
    const itemType = trashItem.itemType;

    if (itemType === 'profile') {
        const profile = getProfileById(itemId);
        if (profile && profile.imageId) {
            deleteImageFromIndexedDB(profile.imageId).catch(e => console.error('Error deleting image:', e));
        }
        appState.profiles = appState.profiles.filter(p => p.id !== itemId);
    } else if (itemType === 'topic') {
        deleteTopic(itemId);
    } else if (itemType === 'subtopic') {
        deleteSubtopic(itemId);
    } else if (itemType === 'platform') {
        deletePlatform(itemId);
    }

    appState.recycleBin = appState.recycleBin.filter(t => t.id !== trashId);
    saveData();
}

function emptyRecycleBin() {
    appState.recycleBin.forEach(item => {
        permanentlyDeleteItem(item.id);
    });
    appState.recycleBin = [];
    saveData();
}

// ==================== SEARCH & FILTERING ==================== 
function searchProfiles(query) {
    if (!query) return appState.profiles;
    
    const q = query.toLowerCase();
    return appState.profiles.filter(profile => {
        return profile.name.toLowerCase().includes(q) ||
               profile.username.toLowerCase().includes(q) ||
               profile.url.toLowerCase().includes(q) ||
               profile.notes.toLowerCase().includes(q);
    });
}

function filterProfiles(platformId = null, topicId = null, subtopicId = null, priority = null) {
    let filtered = appState.profiles;

    if (platformId) {
        filtered = filtered.filter(p => p.platformId === platformId);
    }
    if (topicId) {
        filtered = filtered.filter(p => p.topicId === topicId);
    }
    if (subtopicId) {
        filtered = filtered.filter(p => p.subtopicId === subtopicId);
    }
    if (priority) {
        filtered = filtered.filter(p => p.priority === parseInt(priority));
    }

    return filtered;
}

// ==================== EXPORT & IMPORT ==================== 
function exportData() {
    const data = {
        schemaVersion: SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        platforms: appState.platforms,
        topics: appState.topics,
        subtopics: appState.subtopics,
        profiles: appState.profiles,
        recycleBin: appState.recycleBin,
        settings: appState.settings
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `social-media-profiles-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Data exported successfully', 'success');
}

function validateImportData(data) {
    return data.schemaVersion && data.platforms && data.topics && data.subtopics && data.profiles;
}

function importData(data, mode = 'merge') {
    try {
        if (!validateImportData(data)) {
            throw new Error('Invalid file format');
        }

        if (mode === 'replace') {
            appState.platforms = data.platforms || [];
            appState.topics = data.topics || [];
            appState.subtopics = data.subtopics || [];
            appState.profiles = data.profiles || [];
            appState.recycleBin = data.recycleBin || [];
        } else {
            // Merge mode - combine with existing data
            appState.platforms = [...appState.platforms, ...data.platforms];
            appState.topics = [...appState.topics, ...data.topics];
            appState.subtopics = [...appState.subtopics, ...data.subtopics];
            appState.profiles = [...appState.profiles, ...data.profiles];
            appState.recycleBin = [...appState.recycleBin, ...data.recycleBin];
        }

        saveData();
        render();
        attachEventListeners();
        showToast('Data imported successfully', 'success');
        return true;
    } catch (e) {
        console.error('Import error:', e);
        showToast('Error importing data: ' + e.message, 'error');
        return false;
    }
}

// ==================== DEMO DATA ==================== 
function loadDemoData() {
    // Create platforms
    DEFAULT_PLATFORMS.slice(0, 6).forEach(p => createPlatform(p.name));

    const instagramPlatform = appState.platforms.find(p => p.name === 'Instagram');
    const youtubePlatform = appState.platforms.find(p => p.name === 'YouTube');
    const linkedinPlatform = appState.platforms.find(p => p.name === 'LinkedIn');

    // Create topics and subtopics for Instagram
    if (instagramPlatform) {
        const techTopic = createTopic(instagramPlatform.id, 'Technology');
        const aiSubtopic = createSubtopic(techTopic.id, 'AI & Machine Learning');
        const webSubtopic = createSubtopic(techTopic.id, 'Web Development');

        createProfile({
            platformId: instagramPlatform.id,
            topicId: techTopic.id,
            subtopicId: aiSubtopic.id,
            name: 'AI Academy',
            username: '@ai.academy',
            url: 'https://instagram.com/ai.academy',
            priority: 1,
            notes: 'Great content on machine learning and AI trends'
        });

        createProfile({
            platformId: instagramPlatform.id,
            topicId: techTopic.id,
            subtopicId: webSubtopic.id,
            name: 'Web Dev Tips',
            username: '@webdevtips',
            url: 'https://instagram.com/webdevtips',
            priority: 2,
            notes: 'Useful tips for modern web development'
        });

        const financeTopic = createTopic(instagramPlatform.id, 'Finance');
        const investingSubtopic = createSubtopic(financeTopic.id, 'Investing');
        
        createProfile({
            platformId: instagramPlatform.id,
            topicId: financeTopic.id,
            subtopicId: investingSubtopic.id,
            name: 'Investing Basics',
            username: '@investbasics',
            url: 'https://instagram.com/investbasics',
            priority: 3,
            notes: 'Educational content about stock investing'
        });
    }

    // Create topics for YouTube
    if (youtubePlatform) {
        const educationTopic = createTopic(youtubePlatform.id, 'Education');
        const programmingSubtopic = createSubtopic(educationTopic.id, 'Programming');

        createProfile({
            platformId: youtubePlatform.id,
            topicId: educationTopic.id,
            subtopicId: programmingSubtopic.id,
            name: 'Code Masters',
            username: '@codemasters',
            url: 'https://youtube.com/@codemasters',
            priority: 1,
            notes: 'Comprehensive programming tutorials'
        });
    }

    // Create topics for LinkedIn
    if (linkedinPlatform) {
        const businessTopic = createTopic(linkedinPlatform.id, 'Business');
        const careerSubtopic = createSubtopic(businessTopic.id, 'Career Development');

        createProfile({
            platformId: linkedinPlatform.id,
            topicId: businessTopic.id,
            subtopicId: careerSubtopic.id,
            name: 'Career Coach Pro',
            username: 'careercoacppro',
            url: 'https://linkedin.com/in/careercoachpro',
            priority: 2,
            notes: 'Expert advice on career growth and development'
        });
    }

    saveData();
    render();
    attachEventListeners();
    showToast('Demo data loaded successfully', 'success');
}

// ==================== RENDER FUNCTIONS ==================== 
function render() {
    renderPlatformTabs();
    renderContent();
}

function renderPlatformTabs() {
    const container = document.getElementById('platformTabsContainer');
    container.innerHTML = '';

    const sortedPlatforms = [...appState.platforms].sort((a, b) => a.order - b.order);
    const currentPlatformId = appState.settings.currentPlatformId || (sortedPlatforms[0]?.id);
    appState.settings.currentPlatformId = currentPlatformId;

    sortedPlatforms.forEach(platform => {
        const tab = document.createElement('div');
        tab.className = 'platform-tab' + (platform.id === currentPlatformId ? ' active' : '');
        tab.draggable = true;
        tab.dataset.platformId = platform.id;
        tab.innerHTML = `
            <span class="drag-handle">â˜·</span>
            ${platform.icon} ${platform.name}
        `;
        
        tab.onclick = () => {
            appState.settings.currentPlatformId = platform.id;
            saveData();
            renderPlatformTabs();
            renderContent();
        };

        container.appendChild(tab);
    });
}

function renderContent() {
    const currentPlatformId = appState.settings.currentPlatformId || appState.platforms[0]?.id;
    const contentArea = document.getElementById('contentArea');
    contentArea.innerHTML = '';

    if (!currentPlatformId) {
        contentArea.innerHTML = '<div class="empty-state">No platforms available. Create one to get started.</div>';
        return;
    }

    const topics = getTopicsByPlatform(currentPlatformId);

    if (topics.length === 0) {
        contentArea.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">ðŸ“š</div>
                <div class="empty-state-title">No Topics Yet</div>
                <div class="empty-state-description">Create a topic to organize your profiles.</div>
                <button class="btn btn-primary" onclick="openAddProfileModal()">+ Add Profile</button>
            </div>
        `;
        return;
    }

    topics.forEach(topic => {
        const topicSection = renderTopicSection(topic);
        contentArea.appendChild(topicSection);
    });
}

function renderTopicSection(topic) {
    const section = document.createElement('div');
    section.className = 'topic-section';
    section.dataset.topicId = topic.id;

    const subtopics = getSubtopicsByTopic(topic.id);
    const profileCount = appState.profiles.filter(p => p.topicId === topic.id).length;

    const header = document.createElement('div');
    header.className = 'topic-header';
    header.draggable = true;
    header.dataset.topicId = topic.id;
    header.onclick = () => {
        const content = section.querySelector('.topic-content');
        header.classList.toggle('collapsed');
        content.classList.toggle('collapsed');
    };

    header.innerHTML = `
        <div class="topic-title">
            <span class="topic-toggle">â–¼</span>
            <span class="topic-name">${escapeHtml(topic.name)}</span>
            <span class="topic-meta">P${topic.priority} &middot; ${profileCount} profiles</span>
        </div>
        <div class="topic-actions">
            <button class="btn btn-small btn-secondary" onclick="event.stopPropagation(); editTopic('${topic.id}')">Edit</button>
            <button class="btn btn-small btn-danger" onclick="event.stopPropagation(); confirmDelete('topic', '${topic.id}')">Delete</button>
        </div>
    `;

    const content = document.createElement('div');
    content.className = 'topic-content';

    if (subtopics.length === 0) {
        content.innerHTML = `
            <div class="empty-state" style="padding: 2rem;">
                <div class="empty-state-icon">ðŸ“‘</div>
                <div class="empty-state-title">No Subtopics</div>
                <button class="btn btn-small btn-primary" onclick="openAddSubtopicModal('${topic.id}')">+ Add Subtopic</button>
            </div>
        `;
    } else {
        subtopics.forEach(subtopic => {
            const subtopicElement = renderSubtopicSection(subtopic);
            content.appendChild(subtopicElement);
        });
    }

    section.appendChild(header);
    section.appendChild(content);
    return section;
}

function renderSubtopicSection(subtopic) {
    const section = document.createElement('div');
    section.className = 'subtopic-section';
    section.dataset.subtopicId = subtopic.id;

    const profiles = getProfilesBySubtopic(subtopic.id);

    const topic = getTopicById(subtopic.topicId);

    const header = document.createElement('div');
    header.className = 'subtopic-header';
    header.draggable = true;
    header.dataset.subtopicId = subtopic.id;
    header.onclick = () => {
        const content = section.querySelector('.subtopic-content');
        header.classList.toggle('collapsed');
        content.classList.toggle('collapsed');
    };

    header.innerHTML = `
        <div class="subtopic-title">
            <span class="subtopic-toggle">â–¼</span>
            <span class="subtopic-name">${escapeHtml(subtopic.name)}</span>
            <span class="subtopic-count">${profiles.length}</span>
        </div>
        <div class="subtopic-actions">
            <button class="btn btn-success" onclick="event.stopPropagation(); quickAddProfile('${subtopic.id}')">Paste Link</button>
            <button class="btn btn-secondary" onclick="event.stopPropagation(); editSubtopic('${subtopic.id}')">Edit</button>
            <button class="btn btn-danger" onclick="event.stopPropagation(); confirmDelete('subtopic', '${subtopic.id}')">Delete</button>
        </div>
    `;

    const content = document.createElement('div');
    content.className = 'subtopic-content';

    if (profiles.length === 0) {
        content.innerHTML = `
            <div class="subtopic-empty">
                <div class="empty-state-icon">ðŸ”</div>
                <div class="empty-state-title">No Profiles</div>
                <button class="btn btn-small btn-success" onclick="quickAddProfile('${subtopic.id}')">Paste Link</button>
            </div>
        `;
    } else {
        profiles.forEach(profile => {
            renderProfileCard(profile).then(card => {
                content.appendChild(card);
            });
        });
    }

    section.appendChild(header);
    section.appendChild(content);
    return section;
}

async function renderProfileCard(profile) {
    const card = document.createElement('div');
    card.className = 'profile-card';
    card.draggable = true;
    card.dataset.profileId = profile.id;

    let imageHtml = '<div class="profile-image-placeholder">ðŸ“·</div>';
    if (profile.imageId) {
        try {
            const imageUrl = await getImageFromIndexedDB(profile.imageId);
            if (imageUrl) {
                imageHtml = `<img src="${imageUrl}" alt="${escapeHtml(profile.name)}" class="profile-image">`;
            }
        } catch (e) {
            console.error('Error loading image:', e);
        }
    }

    const platform = getPlatformById(profile.platformId);
    const priorityLabel = ['Highest', 'Very High', 'High', 'Medium', 'Low'][profile.priority - 1] || 'Medium';

    card.innerHTML = `
        <div class="profile-image-container">
            ${imageHtml}
        </div>
        <div class="profile-content">
            <div class="profile-header">
                <div class="profile-name">${escapeHtml(profile.name)}</div>
                ${profile.username ? `<div class="profile-username">${escapeHtml(profile.username)}</div>` : ''}
                ${platform ? `<span class="profile-platform">${platform.icon} ${platform.name}</span>` : ''}
            </div>
            <div class="profile-priority">
                <span class="priority-badge priority-${profile.priority}">P${profile.priority} - ${priorityLabel}</span>
            </div>
            ${profile.notes ? `<div class="profile-notes">${escapeHtml(profile.notes)}</div>` : ''}
            <div class="profile-actions">
                <button class="btn btn-small btn-primary" onclick="viewProfileDetails('${profile.id}')">View</button>
                <button class="btn btn-small btn-secondary" onclick="editProfile('${profile.id}')">Edit</button>
                <button class="btn btn-small btn-danger" onclick="confirmDelete('profile', '${profile.id}')">Delete</button>
            </div>
        </div>
    `;

    return card;
}

function renderRecycleBin() {
    const modal = document.getElementById('recycleBinModal');
    const content = document.getElementById('recycleBinContent');

    if (appState.recycleBin.length === 0) {
        content.innerHTML = '<div class="recycle-empty">Recycle Bin is empty</div>';
        return;
    }

    content.innerHTML = '';
    appState.recycleBin.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'recycle-item';

        let itemName = '';
        let itemMeta = '';

        if (item.itemType === 'profile') {
            const profile = appState.profiles.find(p => p.id === item.itemId);
            if (profile) {
                const platform = getPlatformById(profile.platformId);
                const topic = getTopicById(profile.topicId);
                const subtopic = getSubtopicById(profile.subtopicId);
                itemName = profile.name;
                itemMeta = `
                    <div>Type: Profile</div>
                    <div>Platform: ${platform ? platform.name : 'Unknown'}</div>
                    <div>Topic: ${topic ? topic.name : 'Unknown'}</div>
                    <div>Subtopic: ${subtopic ? subtopic.name : 'Unknown'}</div>
                    <div>Deleted: ${new Date(item.deletedAt).toLocaleDateString()}</div>
                `;
            }
        } else if (item.itemType === 'topic') {
            const topic = getTopicById(item.itemId);
            if (topic) {
                const platform = getPlatformById(topic.platformId);
                itemName = topic.name;
                itemMeta = `
                    <div>Type: Topic</div>
                    <div>Platform: ${platform ? platform.name : 'Unknown'}</div>
                    <div>Deleted: ${new Date(item.deletedAt).toLocaleDateString()}</div>
                `;
            }
        } else if (item.itemType === 'subtopic') {
            const subtopic = getSubtopicById(item.itemId);
            if (subtopic) {
                const topic = getTopicById(subtopic.topicId);
                const platform = getPlatformById(item.originalPlatformId);
                itemName = subtopic.name;
                itemMeta = `
                    <div>Type: Subtopic</div>
                    <div>Platform: ${platform ? platform.name : 'Unknown'}</div>
                    <div>Topic: ${topic ? topic.name : 'Unknown'}</div>
                    <div>Deleted: ${new Date(item.deletedAt).toLocaleDateString()}</div>
                `;
            }
        }

        if (itemName) {
            itemDiv.innerHTML = `
                <div class="recycle-item-info">
                    <div class="recycle-item-title">${escapeHtml(itemName)}</div>
                    <div class="recycle-item-meta">${itemMeta}</div>
                </div>
                <div class="recycle-item-actions">
                    <button class="btn btn-small btn-primary" onclick="restore('${item.id}')">Restore</button>
                    <button class="btn btn-small btn-danger" onclick="permanentDelete('${item.id}')">Delete</button>
                </div>
            `;
            content.appendChild(itemDiv);
        }
    });
}

// ==================== HTML ESCAPING & UTILITIES ==================== 
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== MODAL FUNCTIONS ==================== 
function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function openAddProfileModal() {
    currentEditingProfileId = null;
    document.getElementById('profileUrl').value = '';
    document.getElementById('profileName').value = '';
    document.getElementById('profileUsername').value = '';
    document.getElementById('profileNotes').value = '';
    document.getElementById('profileImage').value = '';
    document.getElementById('profilePriority').value = '3';
    document.getElementById('profilePreview').style.display = 'none';

    // Populate platform dropdown with all platforms
    const platformSelect = document.getElementById('profilePlatform');
    platformSelect.innerHTML = '<option value="">Select Platform</option>';
    appState.platforms.forEach(platform => {
        const option = document.createElement('option');
        option.value = platform.id;
        option.textContent = `${platform.icon} ${platform.name}`;
        platformSelect.appendChild(option);
    });

    const currentPlatformId = appState.settings.currentPlatformId || appState.platforms[0]?.id;
    platformSelect.value = currentPlatformId || '';
    updateTopicDropdown();

    openModal('profileModal');
}

function quickAddProfile(subtopicId) {
    const subtopic = getSubtopicById(subtopicId);
    if (!subtopic) return;

    currentEditingProfileId = null;
    document.getElementById('profileUrl').value = '';
    document.getElementById('profileName').value = '';
    document.getElementById('profileUsername').value = '';
    document.getElementById('profileNotes').value = '';
    document.getElementById('profileImage').value = '';
    document.getElementById('profilePriority').value = '3';
    document.getElementById('profilePreview').style.display = 'none';

    // Populate platform dropdown with all platforms
    const platformSelect = document.getElementById('profilePlatform');
    platformSelect.innerHTML = '<option value="">Select Platform</option>';
    appState.platforms.forEach(platform => {
        const option = document.createElement('option');
        option.value = platform.id;
        option.textContent = `${platform.icon} ${platform.name}`;
        platformSelect.appendChild(option);
    });

    // Pre-fill the selected subtopic
    const topic = getTopicById(subtopic.topicId);
    const platform = getPlatformById(topic.platformId);
    
    platformSelect.value = platform ? platform.id : '';
    updateTopicDropdown();

    const topicSelect = document.getElementById('profileTopic');
    topicSelect.value = subtopic.topicId;
    updateSubtopicDropdown();

    const subtopicSelect = document.getElementById('profileSubtopic');
    subtopicSelect.value = subtopicId;

    openModal('profileModal');
}

function updateTopicDropdown() {
    const platformId = document.getElementById('profilePlatform').value;
    const topics = getTopicsByPlatform(platformId);
    const topicSelect = document.getElementById('profileTopic');
    topicSelect.innerHTML = '<option value="">Select Topic</option>';
    topics.forEach(topic => {
        const option = document.createElement('option');
        option.value = topic.id;
        option.textContent = topic.name;
        topicSelect.appendChild(option);
    });
    updateSubtopicDropdown();
}

function updateSubtopicDropdown() {
    const topicId = document.getElementById('profileTopic').value;
    const subtopics = getSubtopicsByTopic(topicId);
    const subtopicSelect = document.getElementById('profileSubtopic');
    subtopicSelect.innerHTML = '<option value="">Select Subtopic</option>';
    subtopics.forEach(subtopic => {
        const option = document.createElement('option');
        option.value = subtopic.id;
        option.textContent = subtopic.name;
        subtopicSelect.appendChild(option);
    });
}

function editProfile(profileId) {
    const profile = getProfileById(profileId);
    if (!profile) return;

    currentEditingProfileId = profileId;
    document.getElementById('profileUrl').value = profile.url;
    document.getElementById('profileName').value = profile.name;
    document.getElementById('profileUsername').value = profile.username;
    document.getElementById('profileNotes').value = profile.notes;
    document.getElementById('profilePriority').value = profile.priority;
    document.getElementById('profileImage').value = '';

    // Populate platform dropdown with all platforms
    const platformSelect = document.getElementById('profilePlatform');
    platformSelect.innerHTML = '<option value="">Select Platform</option>';
    appState.platforms.forEach(platform => {
        const option = document.createElement('option');
        option.value = platform.id;
        option.textContent = `${platform.icon} ${platform.name}`;
        platformSelect.appendChild(option);
    });

    platformSelect.value = profile.platformId;
    updateTopicDropdown();

    const topicSelect = document.getElementById('profileTopic');
    topicSelect.value = profile.topicId;
    updateSubtopicDropdown();

    const subtopicSelect = document.getElementById('profileSubtopic');
    subtopicSelect.value = profile.subtopicId;

    document.getElementById('profilePreview').style.display = 'none';
    openModal('profileModal');
}

function viewProfileDetails(profileId) {
    const profile = getProfileById(profileId);
    if (!profile) return;

    const content = document.getElementById('profileDetailsContent');
    const platform = getPlatformById(profile.platformId);
    const topic = getTopicById(profile.topicId);
    const subtopic = getSubtopicById(profile.subtopicId);
    const priorityLabel = ['Highest', 'Very High', 'High', 'Medium', 'Low'][profile.priority - 1];

    let imageHtml = '<div class="profile-image-placeholder" style="height: 200px; font-size: 4rem;">ðŸ“·</div>';
    if (profile.imageId) {
        getImageFromIndexedDB(profile.imageId).then(url => {
            if (url) {
                content.querySelector('.profile-image-container').innerHTML = `<img src="${url}" alt="${escapeHtml(profile.name)}" class="profile-image" style="max-height: 300px; width: auto;">`;
            }
        });
    }

    content.innerHTML = `
        <div class="profile-image-container">
            ${imageHtml}
        </div>
        <div style="margin-top: 1.5rem;">
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;">
                <div>
                    <div style="font-weight: 600; color: #6b7280; font-size: 0.875rem;">Profile Name</div>
                    <div style="margin-top: 0.5rem;">${escapeHtml(profile.name)}</div>
                </div>
                <div>
                    <div style="font-weight: 600; color: #6b7280; font-size: 0.875rem;">Username</div>
                    <div style="margin-top: 0.5rem;">${escapeHtml(profile.username)}</div>
                </div>
                <div>
                    <div style="font-weight: 600; color: #6b7280; font-size: 0.875rem;">Platform</div>
                    <div style="margin-top: 0.5rem;">${platform ? platform.name : 'Unknown'}</div>
                </div>
                <div>
                    <div style="font-weight: 600; color: #6b7280; font-size: 0.875rem;">Priority</div>
                    <div style="margin-top: 0.5rem;">P${profile.priority} - ${priorityLabel}</div>
                </div>
                <div>
                    <div style="font-weight: 600; color: #6b7280; font-size: 0.875rem;">Topic</div>
                    <div style="margin-top: 0.5rem;">${topic ? topic.name : 'Unknown'}</div>
                </div>
                <div>
                    <div style="font-weight: 600; color: #6b7280; font-size: 0.875rem;">Subtopic</div>
                    <div style="margin-top: 0.5rem;">${subtopic ? subtopic.name : 'Unknown'}</div>
                </div>
                <div style="grid-column: 1 / -1;">
                    <div style="font-weight: 600; color: #6b7280; font-size: 0.875rem;">URL</div>
                    <div style="margin-top: 0.5rem;"><a href="${escapeHtml(profile.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-small btn-primary">Open Profile</a></div>
                </div>
                ${profile.notes ? `
                <div style="grid-column: 1 / -1;">
                    <div style="font-weight: 600; color: #6b7280; font-size: 0.875rem;">Notes</div>
                    <div style="margin-top: 0.5rem;">${escapeHtml(profile.notes)}</div>
                </div>
                ` : ''}
                <div style="grid-column: 1 / -1; color: #9ca3af; font-size: 0.875rem;">
                    <div>Created: ${new Date(profile.createdAt).toLocaleDateString()}</div>
                    <div>Updated: ${new Date(profile.updatedAt).toLocaleDateString()}</div>
                </div>
            </div>
        </div>
    `;

    openModal('profileDetailsModal');
}

function openAddTopicModal() {
    document.getElementById('topicName').value = '';
    const platformId = document.getElementById('profilePlatform')?.value || appState.settings.currentPlatformId || appState.platforms[0]?.id;
    populatePrioritySelect('topicPriority', getNextTopicPriority(platformId || ''), 25);
    openModal('topicModal');
}

function editTopic(topicId) {
    const topic = getTopicById(topicId);
    if (!topic) return;
    currentEditingTopicId = topicId;
    document.getElementById('editTopicName').value = topic.name;
    populatePrioritySelect('editTopicPriority', topic.priority, 25);
    openModal('editTopicModal');
}

function openAddSubtopicModal(topicId = null) {
    document.getElementById('subtopicName').value = '';
    const selectedTopicId = topicId || document.getElementById('profileTopic').value;
    if (!selectedTopicId) {
        showToast('Please select a topic first', 'warning');
        return;
    }
    populatePrioritySelect('subtopicPriority', getNextSubtopicPriority(selectedTopicId), 25);
    openModal('subtopicModal');
}

function editSubtopic(subtopicId) {
    const subtopic = getSubtopicById(subtopicId);
    if (!subtopic) return;
    currentEditingSubtopicId = subtopicId;
    document.getElementById('editSubtopicName').value = subtopic.name;
    populatePrioritySelect('editSubtopicPriority', subtopic.priority, 25);
    openModal('editSubtopicModal');
}

// ==================== UNIQUE ID GENERATION ==================== 
function generateId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ==================== PLATFORM MANAGEMENT ==================== 
function createPlatform(name, icon = 'ðŸŒ') {
    const platform = {
        id: generateId('platform'),
        name: name,
        icon: icon || getPlatformIcon(name),
        order: (appState.platforms.length || 0) + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    appState.platforms.push(platform);
    saveData();
    return platform;
}

function getPlatformIcon(name) {
    const key = name.toLowerCase().replace(/\s+/g, '');
    return PLATFORM_ICONS[key] || 'ðŸŒ';
}

function getPlatformById(id) {
    return appState.platforms.find(p => p.id === id);
}

function deletePlatform(platformId) {
    // Move all related topics to recycle
    const topicsInPlatform = appState.topics.filter(t => t.platformId === platformId);
    topicsInPlatform.forEach(topic => {
        addToRecycleBin(topic.id, 'topic', topic.platformId, null, null, topic.order);
    });
    
    // Move all profile to recycle
    const profilesInPlatform = appState.profiles.filter(p => p.platformId === platformId);
    profilesInPlatform.forEach(profile => {
        addToRecycleBin(profile.id, 'profile', profile.platformId, profile.topicId, profile.subtopicId, profile.order);
    });

    appState.platforms = appState.platforms.filter(p => p.id !== platformId);
    saveData();
}

// ==================== TOPIC MANAGEMENT ==================== 
function createTopic(platformId, name, priority = null) {
    const platformTopics = appState.topics.filter(t => t.platformId === platformId);
    const topic = {
        id: generateId('topic'),
        platformId: platformId,
        name: name,
        priority: priority !== null ? Number(priority) : getNextPriorityForTopic(platformId),
        order: (platformTopics.length || 0) + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    appState.topics.push(topic);
    saveData();
    return topic;
}

function getNextPriorityForTopic(platformId) {
    const platformTopics = appState.topics.filter(t => t.platformId === platformId);
    return platformTopics.length ? Math.max(...platformTopics.map(t => Number(t.priority) || 1)) + 1 : 1;
}

function getTopicsByPlatform(platformId) {
    return appState.topics
        .filter(t => t.platformId === platformId)
        .sort((a, b) => (Number(a.priority) || 9999) - (Number(b.priority) || 9999) || (a.order || 0) - (b.order || 0));
}

function getTopicById(id) {
    return appState.topics.find(t => t.id === id);
}

function updateTopic(topicId, updates) {
    const topic = getTopicById(topicId);
    if (topic) {
        Object.assign(topic, updates, { updatedAt: new Date().toISOString() });
        if (updates.priority !== undefined) {
            topic.priority = Number(updates.priority);
        }
        saveData();
    }
}

function deleteTopic(topicId) {
    const topic = getTopicById(topicId);
    if (topic) {
        // Move subtopics to recycle
        const subtopicsInTopic = appState.subtopics.filter(s => s.topicId === topicId);
        subtopicsInTopic.forEach(subtopic => {
            addToRecycleBin(subtopic.id, 'subtopic', topic.platformId, topicId, null, subtopic.order);
        });

        // Move profiles to recycle
        const profilesInTopic = appState.profiles.filter(p => p.topicId === topicId);
        profilesInTopic.forEach(profile => {
            addToRecycleBin(profile.id, 'profile', profile.platformId, topicId, profile.subtopicId, profile.order);
        });

        appState.topics = appState.topics.filter(t => t.id !== topicId);
        saveData();
    }
}

// ==================== SUBTOPIC MANAGEMENT ==================== 
function createSubtopic(topicId, name, priority = null) {
    const topicSubtopics = appState.subtopics.filter(s => s.topicId === topicId);
    const subtopic = {
        id: generateId('subtopic'),
        topicId: topicId,
        name: name,
        priority: priority !== null ? Number(priority) : getNextPriorityForSubtopic(topicId),
        order: (topicSubtopics.length || 0) + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    appState.subtopics.push(subtopic);
    saveData();
    return subtopic;
}

function getNextPriorityForSubtopic(topicId) {
    const topicSubtopics = appState.subtopics.filter(subtopic => subtopic.topicId === topicId);
    return topicSubtopics.length ? Math.max(...topicSubtopics.map(s => Number(s.priority) || 1)) + 1 : 1;
}

function getSubtopicsByTopic(topicId) {
    return appState.subtopics
        .filter(s => s.topicId === topicId)
        .sort((a, b) => (Number(a.priority) || 9999) - (Number(b.priority) || 9999) || (a.order || 0) - (b.order || 0));
}

function getSubtopicById(id) {
    return appState.subtopics.find(s => s.id === id);
}

function updateSubtopic(subtopicId, updates) {
    const subtopic = getSubtopicById(subtopicId);
    if (subtopic) {
        Object.assign(subtopic, updates, { updatedAt: new Date().toISOString() });
        if (updates.priority !== undefined) {
            subtopic.priority = Number(updates.priority);
        }
        saveData();
    }
}

function deleteSubtopic(subtopicId) {
    const subtopic = getSubtopicById(subtopicId);
    if (subtopic) {
        // Move profiles to recycle
        const profilesInSubtopic = appState.profiles.filter(p => p.subtopicId === subtopicId);
        const topic = getTopicById(subtopic.topicId);
        profilesInSubtopic.forEach(profile => {
            addToRecycleBin(profile.id, 'profile', profile.platformId, subtopic.topicId, subtopicId, profile.order);
        });

        appState.subtopics = appState.subtopics.filter(s => s.id !== subtopicId);
        saveData();
    }
}

// ==================== PROFILE MANAGEMENT ==================== 
function createProfile(profileData) {
    const profile = {
        id: generateId('profile'),
        platformId: profileData.platformId,
        topicId: profileData.topicId,
        subtopicId: profileData.subtopicId,
        name: profileData.name,
        username: profileData.username || '',
        url: profileData.url || '',
        imageId: profileData.imageId || null,
        priority: profileData.priority || 3,
        notes: profileData.notes || '',
        order: (appState.profiles.filter(p => p.subtopicId === profileData.subtopicId).length || 0) + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    appState.profiles.push(profile);
    saveData();
    return profile;
}

function getProfilesBySubtopic(subtopicId) {
    return appState.profiles.filter(p => p.subtopicId === subtopicId).sort((a, b) => a.order - b.order);
}

function getProfileById(id) {
    return appState.profiles.find(p => p.id === id);
}

function updateProfile(profileId, updates) {
    const profile = getProfileById(profileId);
    if (profile) {
        Object.assign(profile, updates, { updatedAt: new Date().toISOString() });
        saveData();
    }
}

function deleteProfile(profileId) {
    const profile = getProfileById(profileId);
    if (profile) {
        addToRecycleBin(profileId, 'profile', profile.platformId, profile.topicId, profile.subtopicId, profile.order);
        appState.profiles = appState.profiles.filter(p => p.id !== profileId);
        saveData();
    }
}

// ==================== DUPLICATE PROFILE DETECTION ==================== 
function checkDuplicateProfile(url) {
    const normalizedUrl = normalizeUrl(url);
    return appState.profiles.find(p => normalizeUrl(p.url) === normalizedUrl);
}

function normalizeUrl(url) {
    if (!url) return '';
    return url.toLowerCase().trim().replace(/\/$/, '').replace(/https?:\/\/(www\.)?/, '');
}

// ==================== IMAGE MANAGEMENT ==================== 
async function saveImageToIndexedDB(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const imageId = generateId('image');
            const transaction = db.transaction(['images'], 'readwrite');
            const objectStore = transaction.objectStore('images');
            
            objectStore.add({
                id: imageId,
                data: e.target.result,
                createdAt: new Date().toISOString()
            });
            
            transaction.oncomplete = () => resolve(imageId);
            transaction.onerror = () => reject(transaction.error);
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
    });
}

async function getImageFromIndexedDB(imageId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['images'], 'readonly');
        const objectStore = transaction.objectStore('images');
        const request = objectStore.get(imageId);
        
        request.onsuccess = () => {
            if (request.result) {
                const blob = new Blob([request.result.data]);
                resolve(URL.createObjectURL(blob));
            } else {
                resolve(null);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

async function deleteImageFromIndexedDB(imageId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['images'], 'readwrite');
        const objectStore = transaction.objectStore('images');
        const request = objectStore.delete(imageId);
        
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

// ==================== PROFILE URL DETECTION ==================== 
function detectPlatformFromUrl(url) {
    const urlLower = url.toLowerCase();
    const patterns = {
        instagram: /instagram\.com/,
        youtube: /(youtube\.com|youtu\.be)/,
        linkedin: /linkedin\.com/,
        reddit: /reddit\.com/,
        facebook: /facebook\.com/,
        twitter: /twitter\.com/,
        x: /x\.com/,
        threads: /threads\.net/,
        pinterest: /pinterest\.com/,
        snapchat: /snapchat\.com/,
        telegram: /t\.me|telegram\.org/,
        discord: /discord\.com|discord\.gg/,
        github: /github\.com/,
        medium: /medium\.com/,
        quora: /quora\.com/,
        twitch: /twitch\.tv/,
        tiktok: /tiktok\.com/
    };

    for (const [platform, pattern] of Object.entries(patterns)) {
        if (pattern.test(urlLower)) {
            // Find platform by name
            return appState.platforms.find(p => p.name.toLowerCase() === platform);
        }
    }
    return null;
}

// ==================== PROFILE METADATA RETRIEVAL ==================== 
async function fetchProfileMetadata(url) {
    try {
        // Try to fetch OpenGraph metadata
        const response = await fetch(url, {
            method: 'HEAD',
            mode: 'no-cors'
        });

        // For CORS issues, try alternative methods
        // Since most social platforms block direct scraping, we'll use a fallback approach
        return extractMetadataFromUrl(url);
    } catch (error) {
        console.log('Could not fetch metadata:', error);
        return null;
    }
}

function extractMetadataFromUrl(url) {
    // Extract username/handle from URL
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.replace(/\//g, '').split('?')[0];
    
    return {
        username: pathname || 'Unknown',
        name: pathname || 'Unknown Profile',
        image: null
    };
}

// ==================== RECYCLE BIN ==================== 
function addToRecycleBin(itemId, itemType, platformId, topicId = null, subtopicId = null, order = 0) {
    const trashItem = {
        id: generateId('trash'),
        itemId: itemId,
        itemType: itemType, // 'profile', 'topic', 'subtopic', 'platform'
        originalPlatformId: platformId,
        originalTopicId: topicId,
        originalSubtopicId: subtopicId,
        originalOrder: order,
        deletedAt: new Date().toISOString()
    };
    appState.recycleBin.push(trashItem);
    saveData();
}

function restoreFromRecycleBin(trashId) {
    const trashItem = appState.recycleBin.find(t => t.id === trashId);
    if (!trashItem) return;

    const itemId = trashItem.itemId;
    const itemType = trashItem.itemType;
    const platformId = trashItem.originalPlatformId;
    const topicId = trashItem.originalTopicId;
    const subtopicId = trashItem.originalSubtopicId;

    try {
        if (itemType === 'profile') {
            const profile = appState.profiles.find(p => p.id === itemId);
            if (!profile) {
                // Profile was already permanently deleted, can't restore
                return false;
            }
            // Profile is restored, just remove from recycle bin
        } else if (itemType === 'topic') {
            const topic = appState.topics.find(t => t.id === itemId);
            if (!topic) {
                return false;
            }
            // Restore associated subtopics and profiles
            const relatedSubtopics = appState.subtopics.filter(s => s.topicId === itemId);
            relatedSubtopics.forEach(s => {
                appState.profiles = appState.profiles.filter(p => p.subtopicId !== s.id);
            });
            appState.subtopics = appState.subtopics.filter(s => s.topicId !== itemId);
        } else if (itemType === 'subtopic') {
            const subtopic = appState.subtopics.find(s => s.id === itemId);
            if (!subtopic) {
                return false;
            }
            // Restore associated profiles
            appState.profiles = appState.profiles.filter(p => p.subtopicId !== itemId);
        }

        appState.recycleBin = appState.recycleBin.filter(t => t.id !== trashId);
        saveData();
        return true;
    } catch (e) {
        console.error('Error restoring item:', e);
        return false;
    }
}

function permanentlyDeleteItem(trashId) {
    const trashItem = appState.recycleBin.find(t => t.id === trashId);
    if (!trashItem) return;

    const itemId = trashItem.itemId;
    const itemType = trashItem.itemType;

    if (itemType === 'profile') {
        const profile = getProfileById(itemId);
        if (profile && profile.imageId) {
            deleteImageFromIndexedDB(profile.imageId).catch(e => console.error('Error deleting image:', e));
        }
        appState.profiles = appState.profiles.filter(p => p.id !== itemId);
    } else if (itemType === 'topic') {
        deleteTopic(itemId);
    } else if (itemType === 'subtopic') {
        deleteSubtopic(itemId);
    } else if (itemType === 'platform') {
        deletePlatform(itemId);
    }

    appState.recycleBin = appState.recycleBin.filter(t => t.id !== trashId);
    saveData();
}

function emptyRecycleBin() {
    appState.recycleBin.forEach(item => {
        permanentlyDeleteItem(item.id);
    });
    appState.recycleBin = [];
    saveData();
}

// ==================== SEARCH & FILTERING ==================== 
function searchProfiles(query) {
    if (!query) return appState.profiles;
    
    const q = query.toLowerCase();
    return appState.profiles.filter(profile => {
        return profile.name.toLowerCase().includes(q) ||
               profile.username.toLowerCase().includes(q) ||
               profile.url.toLowerCase().includes(q) ||
               profile.notes.toLowerCase().includes(q);
    });
}

function filterProfiles(platformId = null, topicId = null, subtopicId = null, priority = null) {
    let filtered = appState.profiles;

    if (platformId) {
        filtered = filtered.filter(p => p.platformId === platformId);
    }
    if (topicId) {
        filtered = filtered.filter(p => p.topicId === topicId);
    }
    if (subtopicId) {
        filtered = filtered.filter(p => p.subtopicId === subtopicId);
    }
    if (priority) {
        filtered = filtered.filter(p => p.priority === parseInt(priority));
    }

    return filtered;
}

// ==================== EXPORT & IMPORT ==================== 
function exportData() {
    const data = {
        schemaVersion: SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        platforms: appState.platforms,
        topics: appState.topics,
        subtopics: appState.subtopics,
        profiles: appState.profiles,
        recycleBin: appState.recycleBin,
        settings: appState.settings
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `social-media-profiles-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Data exported successfully', 'success');
}

function validateImportData(data) {
    return data.schemaVersion && data.platforms && data.topics && data.subtopics && data.profiles;
}

function importData(data, mode = 'merge') {
    try {
        if (!validateImportData(data)) {
            throw new Error('Invalid file format');
        }

        if (mode === 'replace') {
            appState.platforms = data.platforms || [];
            appState.topics = data.topics || [];
            appState.subtopics = data.subtopics || [];
            appState.profiles = data.profiles || [];
            appState.recycleBin = data.recycleBin || [];
        } else {
            // Merge mode - combine with existing data
            appState.platforms = [...appState.platforms, ...data.platforms];
            appState.topics = [...appState.topics, ...data.topics];
            appState.subtopics = [...appState.subtopics, ...data.subtopics];
            appState.profiles = [...appState.profiles, ...data.profiles];
            appState.recycleBin = [...appState.recycleBin, ...data.recycleBin];
        }

        saveData();
        render();
        attachEventListeners();
        showToast('Data imported successfully', 'success');
        return true;
    } catch (e) {
        console.error('Import error:', e);
        showToast('Error importing data: ' + e.message, 'error');
        return false;
    }
}

// ==================== DEMO DATA ==================== 
function loadDemoData() {
    // Create platforms
    DEFAULT_PLATFORMS.slice(0, 6).forEach(p => createPlatform(p.name));

    const instagramPlatform = appState.platforms.find(p => p.name === 'Instagram');
    const youtubePlatform = appState.platforms.find(p => p.name === 'YouTube');
    const linkedinPlatform = appState.platforms.find(p => p.name === 'LinkedIn');

    // Create topics and subtopics for Instagram
    if (instagramPlatform) {
        const techTopic = createTopic(instagramPlatform.id, 'Technology');
        const aiSubtopic = createSubtopic(techTopic.id, 'AI & Machine Learning');
        const webSubtopic = createSubtopic(techTopic.id, 'Web Development');

        createProfile({
            platformId: instagramPlatform.id,
            topicId: techTopic.id,
            subtopicId: aiSubtopic.id,
            name: 'AI Academy',
            username: '@ai.academy',
            url: 'https://instagram.com/ai.academy',
            priority: 1,
            notes: 'Great content on machine learning and AI trends'
        });

        createProfile({
            platformId: instagramPlatform.id,
            topicId: techTopic.id,
            subtopicId: webSubtopic.id,
            name: 'Web Dev Tips',
            username: '@webdevtips',
            url: 'https://instagram.com/webdevtips',
            priority: 2,
            notes: 'Useful tips for modern web development'
        });

        const financeTopic = createTopic(instagramPlatform.id, 'Finance');
        const investingSubtopic = createSubtopic(financeTopic.id, 'Investing');
        
        createProfile({
            platformId: instagramPlatform.id,
            topicId: financeTopic.id,
            subtopicId: investingSubtopic.id,
            name: 'Investing Basics',
            username: '@investbasics',
            url: 'https://instagram.com/investbasics',
            priority: 3,
            notes: 'Educational content about stock investing'
        });
    }

    // Create topics for YouTube
    if (youtubePlatform) {
        const educationTopic = createTopic(youtubePlatform.id, 'Education');
        const programmingSubtopic = createSubtopic(educationTopic.id, 'Programming');

        createProfile({
            platformId: youtubePlatform.id,
            topicId: educationTopic.id,
            subtopicId: programmingSubtopic.id,
            name: 'Code Masters',
            username: '@codemasters',
            url: 'https://youtube.com/@codemasters',
            priority: 1,
            notes: 'Comprehensive programming tutorials'
        });
    }

    // Create topics for LinkedIn
    if (linkedinPlatform) {
        const businessTopic = createTopic(linkedinPlatform.id, 'Business');
        const careerSubtopic = createSubtopic(businessTopic.id, 'Career Development');

        createProfile({
            platformId: linkedinPlatform.id,
            topicId: businessTopic.id,
            subtopicId: careerSubtopic.id,
            name: 'Career Coach Pro',
            username: 'careercoacppro',
            url: 'https://linkedin.com/in/careercoachpro',
            priority: 2,
            notes: 'Expert advice on career growth and development'
        });
    }

    saveData();
    render();
    attachEventListeners();
    showToast('Demo data loaded successfully', 'success');
}

// ==================== RENDER FUNCTIONS ==================== 
function render() {
    renderPlatformTabs();
    renderContent();
}

function renderPlatformTabs() {
    const container = document.getElementById('platformTabsContainer');
    container.innerHTML = '';

    const sortedPlatforms = [...appState.platforms].sort((a, b) => a.order - b.order);
    const currentPlatformId = appState.settings.currentPlatformId || (sortedPlatforms[0]?.id);
    appState.settings.currentPlatformId = currentPlatformId;

    sortedPlatforms.forEach(platform => {
        const tab = document.createElement('div');
        tab.className = 'platform-tab' + (platform.id === currentPlatformId ? ' active' : '');
        tab.draggable = true;
        tab.dataset.platformId = platform.id;
        tab.innerHTML = `
            <span class="drag-handle">â˜·</span>
            ${platform.icon} ${platform.name}
        `;
        
        tab.onclick = () => {
            appState.settings.currentPlatformId = platform.id;
            saveData();
            renderPlatformTabs();
            renderContent();
        };

        container.appendChild(tab);
    });
}

function renderContent() {
    const currentPlatformId = appState.settings.currentPlatformId || appState.platforms[0]?.id;
    const contentArea = document.getElementById('contentArea');
    contentArea.innerHTML = '';

    if (!currentPlatformId) {
        contentArea.innerHTML = '<div class="empty-state">No platforms available. Create one to get started.</div>';
        return;
    }

    const topics = getTopicsByPlatform(currentPlatformId);

    if (topics.length === 0) {
        contentArea.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">ðŸ“š</div>
                <div class="empty-state-title">No Topics Yet</div>
                <div class="empty-state-description">Create a topic to organize your profiles.</div>
                <button class="btn btn-primary" onclick="openAddProfileModal()">+ Add Profile</button>
            </div>
        `;
        return;
    }

    topics.forEach(topic => {
        const topicSection = renderTopicSection(topic);
        contentArea.appendChild(topicSection);
    });
}

function renderTopicSection(topic) {
    const section = document.createElement('div');
    section.className = 'topic-section';
    section.dataset.topicId = topic.id;

    const subtopics = getSubtopicsByTopic(topic.id);
    const profileCount = appState.profiles.filter(p => p.topicId === topic.id).length;

    const header = document.createElement('div');
    header.className = 'topic-header';
    header.draggable = true;
    header.dataset.topicId = topic.id;
    header.onclick = () => {
        const content = section.querySelector('.topic-content');
        header.classList.toggle('collapsed');
        content.classList.toggle('collapsed');
    };

    header.innerHTML = `
        <div class="topic-title">
            <span class="topic-toggle">â–¼</span>
            <span class="topic-name">${escapeHtml(topic.name)}</span>
            <span class="topic-meta">P${topic.priority} &middot; ${profileCount} profiles</span>
        </div>
        <div class="topic-actions">
            <button class="btn btn-small btn-secondary" onclick="event.stopPropagation(); editTopic('${topic.id}')">Edit</button>
            <button class="btn btn-small btn-danger" onclick="event.stopPropagation(); confirmDelete('topic', '${topic.id}')">Delete</button>
        </div>
    `;

    const content = document.createElement('div');
    content.className = 'topic-content';

    if (subtopics.length === 0) {
        content.innerHTML = `
            <div class="empty-state" style="padding: 2rem;">
                <div class="empty-state-icon">ðŸ“‘</div>
                <div class="empty-state-title">No Subtopics</div>
                <button class="btn btn-small btn-primary" onclick="openAddSubtopicModal('${topic.id}')">+ Add Subtopic</button>
            </div>
        `;
    } else {
        subtopics.forEach(subtopic => {
            const subtopicElement = renderSubtopicSection(subtopic);
            content.appendChild(subtopicElement);
        });
    }

    section.appendChild(header);
    section.appendChild(content);
    return section;
}

function renderSubtopicSection(subtopic) {
    const section = document.createElement('div');
    section.className = 'subtopic-section';
    section.dataset.subtopicId = subtopic.id;

    const profiles = getProfilesBySubtopic(subtopic.id);

    const topic = getTopicById(subtopic.topicId);

    const header = document.createElement('div');
    header.className = 'subtopic-header';
    header.draggable = true;
    header.dataset.subtopicId = subtopic.id;
    header.onclick = () => {
        const content = section.querySelector('.subtopic-content');
        header.classList.toggle('collapsed');
        content.classList.toggle('collapsed');
    };

    header.innerHTML = `
        <div class="subtopic-title">
            <span class="subtopic-toggle">â–¼</span>
            <span class="subtopic-name">${escapeHtml(subtopic.name)}</span>
            <span class="subtopic-count">${profiles.length}</span>
        </div>
        <div class="subtopic-actions">
            <button class="btn btn-success" onclick="event.stopPropagation(); quickAddProfile('${subtopic.id}')">Paste Link</button>
            <button class="btn btn-secondary" onclick="event.stopPropagation(); editSubtopic('${subtopic.id}')">Edit</button>
            <button class="btn btn-danger" onclick="event.stopPropagation(); confirmDelete('subtopic', '${subtopic.id}')">Delete</button>
        </div>
    `;

    const content = document.createElement('div');
    content.className = 'subtopic-content';

    if (profiles.length === 0) {
        content.innerHTML = `
            <div class="subtopic-empty">
                <div class="empty-state-icon">ðŸ”</div>
                <div class="empty-state-title">No Profiles</div>
                <button class="btn btn-small btn-success" onclick="quickAddProfile('${subtopic.id}')">Paste Link</button>
            </div>
        `;
    } else {
        profiles.forEach(profile => {
            renderProfileCard(profile).then(card => {
                content.appendChild(card);
            });
        });
    }

    section.appendChild(header);
    section.appendChild(content);
    return section;
}

async function renderProfileCard(profile) {
    const card = document.createElement('div');
    card.className = 'profile-card';
    card.draggable = true;
    card.dataset.profileId = profile.id;

    let imageHtml = '<div class="profile-image-placeholder">ðŸ“·</div>';
    if (profile.imageId) {
        try {
            const imageUrl = await getImageFromIndexedDB(profile.imageId);
            if (imageUrl) {
                imageHtml = `<img src="${imageUrl}" alt="${escapeHtml(profile.name)}" class="profile-image">`;
            }
        } catch (e) {
            console.error('Error loading image:', e);
        }
    }

    const platform = getPlatformById(profile.platformId);
    const priorityLabel = ['Highest', 'Very High', 'High', 'Medium', 'Low'][profile.priority - 1] || 'Medium';

    card.innerHTML = `
        <div class="profile-image-container">
            ${imageHtml}
        </div>
        <div class="profile-content">
            <div class="profile-header">
                <div class="profile-name">${escapeHtml(profile.name)}</div>
                ${profile.username ? `<div class="profile-username">${escapeHtml(profile.username)}</div>` : ''}
                ${platform ? `<span class="profile-platform">${platform.icon} ${platform.name}</span>` : ''}
            </div>
            <div class="profile-priority">
                <span class="priority-badge priority-${profile.priority}">P${profile.priority} - ${priorityLabel}</span>
            </div>
            ${profile.notes ? `<div class="profile-notes">${escapeHtml(profile.notes)}</div>` : ''}
            <div class="profile-actions">
                <button class="btn btn-small btn-primary" onclick="viewProfileDetails('${profile.id}')">View</button>
                <button class="btn btn-small btn-secondary" onclick="editProfile('${profile.id}')">Edit</button>
                <button class="btn btn-small btn-danger" onclick="confirmDelete('profile', '${profile.id}')">Delete</button>
            </div>
        </div>
    `;

    return card;
}

function renderRecycleBin() {
    const modal = document.getElementById('recycleBinModal');
    const content = document.getElementById('recycleBinContent');

    if (appState.recycleBin.length === 0) {
        content.innerHTML = '<div class="recycle-empty">Recycle Bin is empty</div>';
        return;
    }

    content.innerHTML = '';
    appState.recycleBin.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'recycle-item';

        let itemName = '';
        let itemMeta = '';

        if (item.itemType === 'profile') {
            const profile = appState.profiles.find(p => p.id === item.itemId);
            if (profile) {
                const platform = getPlatformById(profile.platformId);
                const topic = getTopicById(profile.topicId);
                const subtopic = getSubtopicById(profile.subtopicId);
                itemName = profile.name;
                itemMeta = `
                    <div>Type: Profile</div>
                    <div>Platform: ${platform ? platform.name : 'Unknown'}</div>
                    <div>Topic: ${topic ? topic.name : 'Unknown'}</div>
                    <div>Subtopic: ${subtopic ? subtopic.name : 'Unknown'}</div>
                    <div>Deleted: ${new Date(item.deletedAt).toLocaleDateString()}</div>
                `;
            }
        } else if (item.itemType === 'topic') {
            const topic = getTopicById(item.itemId);
            if (topic) {
                const platform = getPlatformById(topic.platformId);
                itemName = topic.name;
                itemMeta = `
                    <div>Type: Topic</div>
                    <div>Platform: ${platform ? platform.name : 'Unknown'}</div>
                    <div>Deleted: ${new Date(item.deletedAt).toLocaleDateString()}</div>
                `;
            }
        } else if (item.itemType === 'subtopic') {
            const subtopic = getSubtopicById(item.itemId);
            if (subtopic) {
                const topic = getTopicById(subtopic.topicId);
                const platform = getPlatformById(item.originalPlatformId);
                itemName = subtopic.name;
                itemMeta = `
                    <div>Type: Subtopic</div>
                    <div>Platform: ${platform ? platform.name : 'Unknown'}</div>
                    <div>Topic: ${topic ? topic.name : 'Unknown'}</div>
                    <div>Deleted: ${new Date(item.deletedAt).toLocaleDateString()}</div>
                `;
            }
        }

        if (itemName) {
            itemDiv.innerHTML = `
                <div class="recycle-item-info">
                    <div class="recycle-item-title">${escapeHtml(itemName)}</div>
                    <div class="recycle-item-meta">${itemMeta}</div>
                </div>
                <div class="recycle-item-actions">
                    <button class="btn btn-small btn-primary" onclick="restore('${item.id}')">Restore</button>
                    <button class="btn btn-small btn-danger" onclick="permanentDelete('${item.id}')">Delete</button>
                </div>
            `;
            content.appendChild(itemDiv);
        }
    });
}

// ==================== HTML ESCAPING & UTILITIES ==================== 
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== MODAL FUNCTIONS ==================== 
function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function openAddProfileModal() {
    currentEditingProfileId = null;
    document.getElementById('profileUrl').value = '';
    document.getElementById('profileName').value = '';
    document.getElementById('profileUsername').value = '';
    document.getElementById('profileNotes').value = '';
    document.getElementById('profileImage').value = '';
    document.getElementById('profilePriority').value = '3';
    document.getElementById('profilePreview').style.display = 'none';

    // Populate platform dropdown with all platforms
    const platformSelect = document.getElementById('profilePlatform');
    platformSelect.innerHTML = '<option value="">Select Platform</option>';
    appState.platforms.forEach(platform => {
        const option = document.createElement('option');
        option.value = platform.id;
        option.textContent = `${platform.icon} ${platform.name}`;
        platformSelect.appendChild(option);
    });

    const currentPlatformId = appState.settings.currentPlatformId || appState.platforms[0]?.id;
    platformSelect.value = currentPlatformId || '';
    updateTopicDropdown();

    openModal('profileModal');
}

function quickAddProfile(subtopicId) {
    const subtopic = getSubtopicById(subtopicId);
    if (!subtopic) return;

    currentEditingProfileId = null;
    document.getElementById('profileUrl').value = '';
    document.getElementById('profileName').value = '';
    document.getElementById('profileUsername').value = '';
    document.getElementById('profileNotes').value = '';
    document.getElementById('profileImage').value = '';
    document.getElementById('profilePriority').value = '3';
    document.getElementById('profilePreview').style.display = 'none';

    // Populate platform dropdown with all platforms
    const platformSelect = document.getElementById('profilePlatform');
    platformSelect.innerHTML = '<option value="">Select Platform</option>';
    appState.platforms.forEach(platform => {
        const option = document.createElement('option');
        option.value = platform.id;
        option.textContent = `${platform.icon} ${platform.name}`;
        platformSelect.appendChild(option);
    });

    // Pre-fill the selected subtopic
    const topic = getTopicById(subtopic.topicId);
    const platform = getPlatformById(topic.platformId);
    
    platformSelect.value = platform ? platform.id : '';
    updateTopicDropdown();

    const topicSelect = document.getElementById('profileTopic');
    topicSelect.value = subtopic.topicId;
    updateSubtopicDropdown();

    const subtopicSelect = document.getElementById('profileSubtopic');
    subtopicSelect.value = subtopicId;

    openModal('profileModal');
}

function updateTopicDropdown() {
    const platformId = document.getElementById('profilePlatform').value;
    const topics = getTopicsByPlatform(platformId);
    const topicSelect = document.getElementById('profileTopic');
    topicSelect.innerHTML = '<option value="">Select Topic</option>';
    topics.forEach(topic => {
        const option = document.createElement('option');
        option.value = topic.id;
        option.textContent = topic.name;
        topicSelect.appendChild(option);
    });
    updateSubtopicDropdown();
}

function updateSubtopicDropdown() {
    const topicId = document.getElementById('profileTopic').value;
    const subtopics = getSubtopicsByTopic(topicId);
    const subtopicSelect = document.getElementById('profileSubtopic');
    subtopicSelect.innerHTML = '<option value="">Select Subtopic</option>';
    subtopics.forEach(subtopic => {
        const option = document.createElement('option');
        option.value = subtopic.id;
        option.textContent = subtopic.name;
        subtopicSelect.appendChild(option);
    });
}

function editProfile(profileId) {
    const profile = getProfileById(profileId);
    if (!profile) return;

    currentEditingProfileId = profileId;
    document.getElementById('profileUrl').value = profile.url;
    document.getElementById('profileName').value = profile.name;
    document.getElementById('profileUsername').value = profile.username;
    document.getElementById('profileNotes').value = profile.notes;
    document.getElementById('profilePriority').value = profile.priority;
    document.getElementById('profileImage').value = '';

    // Populate platform dropdown with all platforms
    const platformSelect = document.getElementById('profilePlatform');
    platformSelect.innerHTML = '<option value="">Select Platform</option>';
    appState.platforms.forEach(platform => {
        const option = document.createElement('option');
        option.value = platform.id;
        option.textContent = `${platform.icon} ${platform.name}`;
        platformSelect.appendChild(option);
    });

    platformSelect.value = profile.platformId;
    updateTopicDropdown();

    const topicSelect = document.getElementById('profileTopic');
    topicSelect.value = profile.topicId;
    updateSubtopicDropdown();

    const subtopicSelect = document.getElementById('profileSubtopic');
    subtopicSelect.value = profile.subtopicId;

    document.getElementById('profilePreview').style.display = 'none';
    openModal('profileModal');
}

function viewProfileDetails(profileId) {
    const profile = getProfileById(profileId);
    if (!profile) return;

    const content = document.getElementById('profileDetailsContent');
    const platform = getPlatformById(profile.platformId);
    const topic = getTopicById(profile.topicId);
    const subtopic = getSubtopicById(profile.subtopicId);
    const priorityLabel = ['Highest', 'Very High', 'High', 'Medium', 'Low'][profile.priority - 1];

    let imageHtml = '<div class="profile-image-placeholder" style="height: 200px; font-size: 4rem;">ðŸ“·</div>';
    if (profile.imageId) {
        getImageFromIndexedDB(profile.imageId).then(url => {
            if (url) {
                content.querySelector('.profile-image-container').innerHTML = `<img src="${url}" alt="${escapeHtml(profile.name)}" class="profile-image" style="max-height: 300px; width: auto;">`;
            }
        });
    }

    content.innerHTML = `
        <div class="profile-image-container">
            ${imageHtml}
        </div>
        <div style="margin-top: 1.5rem;">
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;">
                <div>
                    <div style="font-weight: 600; color: #6b7280; font-size: 0.875rem;">Profile Name</div>
                    <div style="margin-top: 0.5rem;">${escapeHtml(profile.name)}</div>
                </div>
                <div>
                    <div style="font-weight: 600; color: #6b7280; font-size: 0.875rem;">Username</div>
                    <div style="margin-top: 0.5rem;">${escapeHtml(profile.username)}</div>
                </div>
                <div>
                    <div style="font-weight: 600; color: #6b7280; font-size: 0.875rem;">Platform</div>
                    <div style="margin-top: 0.5rem;">${platform ? platform.name : 'Unknown'}</div>
                </div>
                <div>
                    <div style="font-weight: 600; color: #6b7280; font-size: 0.875rem;">Priority</div>
                    <div style="margin-top: 0.5rem;">P${profile.priority} - ${priorityLabel}</div>
                </div>
                <div>
                    <div style="font-weight: 600; color: #6b7280; font-size: 0.875rem;">Topic</div>
                    <div style="margin-top: 0.5rem;">${topic ? topic.name : 'Unknown'}</div>
                </div>
                <div>
                    <div style="font-weight: 600; color: #6b7280; font-size: 0.875rem;">Subtopic</div>
                    <div style="margin-top: 0.5rem;">${subtopic ? subtopic.name : 'Unknown'}</div>
                </div>
                <div style="grid-column: 1 / -1;">
                    <div style="font-weight: 600; color: #6b7280; font-size: 0.875rem;">URL</div>
                    <div style="margin-top: 0.5rem;"><a href="${escapeHtml(profile.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-small btn-primary">Open Profile</a></div>
                </div>
                ${profile.notes ? `
                <div style="grid-column: 1 / -1;">
                    <div style="font-weight: 600; color: #6b7280; font-size: 0.875rem;">Notes</div>
                    <div style="margin-top: 0.5rem;">${escapeHtml(profile.notes)}</div>
                </div>
                ` : ''}
                <div style="grid-column: 1 / -1; color: #9ca3af; font-size: 0.875rem;">
                    <div>Created: ${new Date(profile.createdAt).toLocaleDateString()}</div>
                    <div>Updated: ${new Date(profile.updatedAt).toLocaleDateString()}</div>
                </div>
            </div>
        </div>
    `;

    openModal('profileDetailsModal');
}

function openAddTopicModal() {
    document.getElementById('topicName').value = '';
    const platformId = document.getElementById('profilePlatform')?.value || appState.settings.currentPlatformId || appState.platforms[0]?.id;
    populatePrioritySelect('topicPriority', getNextTopicPriority(platformId || ''), 25);
    openModal('topicModal');
}

function editTopic(topicId) {
    const topic = getTopicById(topicId);
    if (!topic) return;
    currentEditingTopicId = topicId;
    document.getElementById('editTopicName').value = topic.name;
    populatePrioritySelect('editTopicPriority', topic.priority, 25);
    openModal('editTopicModal');
}

function openAddSubtopicModal(topicId = null) {
    document.getElementById('subtopicName').value = '';
    const selectedTopicId = topicId || document.getElementById('profileTopic').value;
    if (!selectedTopicId) {
        showToast('Please select a topic first', 'warning');
        return;
    }
    populatePrioritySelect('subtopicPriority', getNextSubtopicPriority(selectedTopicId), 25);
    openModal('subtopicModal');
}

function editSubtopic(subtopicId) {
    const subtopic = getSubtopicById(subtopicId);
    if (!subtopic) return;
    currentEditingSubtopicId = subtopicId;
    document.getElementById('editSubtopicName').value = subtopic.name;
    populatePrioritySelect('editSubtopicPriority', subtopic.priority, 25);
    openModal('editSubtopicModal');
}

// ==================== EVENT LISTENERS ==================== 
function attachEventListeners() {
    // Modal close buttons
    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            const modalId = btn.dataset.close;
            closeModal(modalId);
        };
    });

    // First-run demo dialog
    document.getElementById('skipDemoBtn').onclick = () => {
        closeModal('demoDataModal');
        render();
    };
    document.getElementById('loadDemoBtn').onclick = () => {
        closeModal('demoDataModal');
        loadDemoData();
    };

    // Header buttons
    document.getElementById('addProfileBtn').onclick = openAddProfileModal;
    document.getElementById('importBtn').onclick = openImportModal;
    document.getElementById('exportBtn').onclick = exportData;
    document.getElementById('recycleBinBtn').onclick = () => {
        renderRecycleBin();
        openModal('recycleBinModal');
    };
    document.getElementById('addPlatformBtn').onclick = openAddCustomPlatformModal;

    // Profile modal
    document.getElementById('profilePlatform').onchange = updateTopicDropdown;
    document.getElementById('profileTopic').onchange = updateSubtopicDropdown;
    document.getElementById('addTopicFromModalBtn').onclick = () => {
        const topicName = prompt('Enter topic name:');
        if (topicName && topicName.trim()) {
            const platformId = document.getElementById('profilePlatform').value;
            if (platformId) {
                const newTopic = createTopic(platformId, topicName.trim());
                updateTopicDropdown();
                document.getElementById('profileTopic').value = newTopic.id;
                updateSubtopicDropdown();
                showToast('Topic created', 'success');
            } else {
                showToast('Please select a platform first', 'warning');
            }
        }
    };

    document.getElementById('addSubtopicFromModalBtn').onclick = () => {
        const topicId = document.getElementById('profileTopic').value;
        if (!topicId) {
            showToast('Please select a topic first', 'warning');
            return;
        }
        const subtopicName = prompt('Enter subtopic name:');
        if (subtopicName && subtopicName.trim()) {
            const newSubtopic = createSubtopic(topicId, subtopicName.trim());
            updateSubtopicDropdown();
            document.getElementById('profileSubtopic').value = newSubtopic.id;
            showToast('Subtopic created', 'success');
        }
    };

    document.getElementById('fetchProfileBtn').onclick = async () => {
        const url = document.getElementById('profileUrl').value.trim();
        if (!url) {
            showToast('Please enter a URL', 'warning');
            return;
        }

        try {
            new URL(url);
        } catch (e) {
            showToast('Invalid URL', 'error');
            return;
        }

        const platform = detectPlatformFromUrl(url);
        if (platform) {
            const platformSelect = document.getElementById('profilePlatform');
            platformSelect.value = platform.id;
            updateTopicDropdown();
            showToast(`Platform detected: ${platform.name}`, 'success');
        }

        const metadata = extractMetadataFromUrl(url);
        if (!document.getElementById('profileName').value) {
            document.getElementById('profileName').value = metadata.name;
        }
        if (!document.getElementById('profileUsername').value) {
            document.getElementById('profileUsername').value = metadata.username;
        }

        document.getElementById('profilePreview').style.display = 'flex';
        document.getElementById('previewName').textContent = metadata.name;
        document.getElementById('previewUsername').textContent = '@' + metadata.username;
        if (platform) {
            document.getElementById('previewPlatform').textContent = `${platform.icon} ${platform.name}`;
        }
    };

    document.getElementById('saveProfileBtn').onclick = () => {
        const url = document.getElementById('profileUrl').value.trim();
        const name = document.getElementById('profileName').value.trim();
        const username = document.getElementById('profileUsername').value.trim();
        const notes = document.getElementById('profileNotes').value.trim();
        const priority = document.getElementById('profilePriority').value;
        const platformId = document.getElementById('profilePlatform').value;
        const topicId = document.getElementById('profileTopic').value;
        const subtopicId = document.getElementById('profileSubtopic').value;

        if (!url) {
            showToast('Please enter a URL', 'warning');
            return;
        }
        if (!name) {
            showToast('Please enter a profile name', 'warning');
            return;
        }
        if (!platformId) {
            showToast('Please select a platform', 'warning');
            return;
        }

        const profileData = {
            url,
            name,
            username,
            notes,
            priority,
            platformId,
            topicId: topicId || null,
            subtopicId: subtopicId || null
        };

        if (currentEditingProfileId) {
            updateProfile(currentEditingProfileId, profileData);
            showToast('Profile updated successfully', 'success');
        } else {
            const existingProfile = checkDuplicateProfile(url);
            if (existingProfile) {
                showToast('A profile with this URL already exists', 'error');
                return;
            }
            createProfile(profileData);
            showToast('Profile created successfully', 'success');
        }

        closeModal('profileModal');
        render();
        attachEventListeners();
    };

    document.getElementById('saveTopicBtn').onclick = () => {
        const name = document.getElementById('topicName').value.trim();
        const priority = document.getElementById('topicPriority').value;
        if (!name) {
            showToast('Please enter a topic name', 'warning');
            return;
        }
        const platformId = document.getElementById('profilePlatform').value;
        if (!platformId) {
            showToast('Please select a platform first', 'warning');
            return;
        }
        createTopic(platformId, name, priority);
        showToast('Topic created successfully', 'success');
        updateTopicDropdown();
        closeModal('topicModal');
    };

    document.getElementById('saveEditTopicBtn').onclick = () => {
        const name = document.getElementById('editTopicName').value.trim();
        const priority = document.getElementById('editTopicPriority').value;
        if (!name) {
            showToast('Please enter a topic name', 'warning');
            return;
        }
        updateTopic(currentEditingTopicId, { name, priority });
        showToast('Topic updated successfully', 'success');
        closeModal('editTopicModal');
        render();
        attachEventListeners();
    };

    document.getElementById('saveSubtopicBtn').onclick = () => {
        const name = document.getElementById('subtopicName').value.trim();
        const priority = document.getElementById('subtopicPriority').value;
        if (!name) {
            showToast('Please enter a subtopic name', 'warning');
            return;
        }
        const topicId = document.getElementById('profileTopic').value;
        if (!topicId) {
            showToast('Please select a topic first', 'warning');
            return;
        }
        createSubtopic(topicId, name, priority);
        showToast('Subtopic created successfully', 'success');
        updateSubtopicDropdown();
        closeModal('subtopicModal');
    };

    document.getElementById('saveEditSubtopicBtn').onclick = () => {
        const name = document.getElementById('editSubtopicName').value.trim();
        const priority = document.getElementById('editSubtopicPriority').value;
        if (!name) {
            showToast('Please enter a subtopic name', 'warning');
            return;
        }
        updateSubtopic(currentEditingSubtopicId, { name, priority });
        showToast('Subtopic updated successfully', 'success');
        closeModal('editSubtopicModal');
        render();
        attachEventListeners();
    };

    // Recycle bin actions
    document.getElementById('emptyRecycleBinBtn').onclick = () => {
        if (confirm('Are you sure you want to empty the recycle bin?')) {
            emptyRecycleBin();
            renderRecycleBin();
            showToast('Recycle bin emptied', 'success');
        }
    };
}
