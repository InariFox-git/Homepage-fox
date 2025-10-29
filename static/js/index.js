let folders = [];
let searchEngine = 'yandex';
let saveTimeout = null;
let saveQueue = Promise.resolve();
const minSaveInterval = 1000;
let lastSave = Date.now();

async function saveWithQueue(data, userId) {
    saveQueue = saveQueue.then(async () => {
        const now = Date.now();
        if (now - lastSave < minSaveInterval) {
            await new Promise(resolve => setTimeout(resolve, minSaveInterval - (now - lastSave)));
        }

        try {
            const response = await fetch(`/save_data/${userId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            showNotification('Сохранено успешно', 'success');
        } catch (error) {
            console.error('Ошибка сохранения:', error);
            showNotification('Ошибка сохранения. Проверьте соединение.', 'error');
        }
    });
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function loadFolders() {
    const urlParams = new URLSearchParams(window.location.search);
    let userId = urlParams.get('user_id');
    
    if (!userId) {
        window.location.href = '/select_user';
        return;
    }
    
    localStorage.setItem('current_user_id', userId);
    document.title = `Стартовая страница (${userId})`;

    try {
        const res = await fetch(`/get_data/${userId}`);
        if (!res.ok) throw new Error('User not found');
        
        const data = await res.json();
        folders = data.folders || [];
        searchEngine = data.search_engine || 'yandex';
        localStorage.setItem(`data_${userId}`, JSON.stringify(data));
    } catch (e) {
        console.log('Error loading data:', e);
        folders = [];
        searchEngine = 'yandex';
        localStorage.setItem(`data_${userId}`, JSON.stringify({folders, search_engine: searchEngine}));
    }
    
    const select = document.getElementById('searchEngineSelect');
    select.value = searchEngine;
    select.onchange = (e) => {
        searchEngine = e.target.value;
        document.getElementById('searchInput').placeholder = `Поиск в ${searchEngine.charAt(0).toUpperCase() + searchEngine.slice(1)}`;
        save();
    };
    
    document.getElementById('searchInput').placeholder = `Поиск в ${searchEngine.charAt(0).toUpperCase() + searchEngine.slice(1)}`;
    renderFolders();
}

function renderFolders() {
    const fc = document.getElementById('folders');
    fc.innerHTML = '';
    folders.forEach(f => {
        const div = document.createElement('div');
        div.className = 'folder';
        div.innerHTML = `
            <div><span class="folder-name">${escapeHtml(f.name)}</span></div>
            ${f.tabs.map(t => `<div class="tab" onmousedown="handleTabClick(event, '${escapeHtml(t.url)}')">${escapeHtml(t.name)}</div>`).join('')}
        `;
        fc.appendChild(div);
    });
}

function toggleEditor() {
    const m = document.getElementById('editorModal');
    m.style.display = m.style.display === 'flex' ? 'none' : 'flex';
    if (m.style.display === 'flex') renderEditor();
}

function setupTabDragAndDrop() {
    const tabItems = document.querySelectorAll('.tab-item');
    tabItems.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', 
                `${e.target.dataset.folderIndex},${e.target.dataset.tabIndex}`);
            e.target.classList.add('dragging');
        });
        item.addEventListener('dragend', (e) => {
            e.target.classList.remove('dragging');
        });
    });

    const folderItems = document.querySelectorAll('.folder-item');
    folderItems.forEach(item => {
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggingElement = document.querySelector('.dragging');
            if (draggingElement) {
                const afterElement = getDragAfterElement(item, e.clientY);
                if (afterElement) {
                    afterElement.parentNode.insertBefore(draggingElement, afterElement);
                } else {
                    item.querySelector('.tabs-list').appendChild(draggingElement);
                }
            }
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
            const draggingElement = document.querySelector('.dragging');
            if (!draggingElement) return;

            const [oldFolderIdxStr, oldTabIdxStr] = e.dataTransfer.getData('text/plain').split(',');
            const oldFolderIdx = parseInt(oldFolderIdxStr);
            const oldTabIdx = parseInt(oldTabIdxStr);

            const newFolderIdx = parseInt(item.dataset.folderIndex);
            const tabsList = item.querySelector('.tabs-list');
            const newTabIndex = [...tabsList.children].indexOf(draggingElement);

            if (isNaN(oldFolderIdx) || isNaN(oldTabIdx) || isNaN(newFolderIdx) || newTabIndex === -1) return;

            const movedTab = { ...folders[oldFolderIdx].tabs[oldTabIdx] };
            folders[oldFolderIdx].tabs.splice(oldTabIdx, 1);
            folders[newFolderIdx].tabs.splice(newTabIndex, 0, movedTab);

            save();
            renderFolders();
            renderEditor();
        });
    });
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.tab-item:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function moveFolderUp(index) {
    if (index > 0) {
        [folders[index], folders[index - 1]] = [folders[index - 1], folders[index]];
        save();
        renderFolders();
        renderEditor();
    }
}

function moveFolderDown(index) {
    if (index < folders.length - 1) {
        [folders[index], folders[index + 1]] = [folders[index + 1], folders[index]];
        save();
        renderFolders();
        renderEditor();
    }
}

function renderEditor() {
    const folderList = document.getElementById('folderList');
    folderList.innerHTML = '';

    folders.forEach((folder, folderIdx) => {
        const folderDiv = document.createElement('div');
        folderDiv.className = 'folder-item';
        folderDiv.setAttribute('data-folder-index', folderIdx);

        const tabsHtml = folder.tabs.map((tab, tabIdx) => `
            <div class="tab-item" draggable="true" data-folder-index="${folderIdx}" data-tab-index="${tabIdx}">
                <input type="text"
                       value="${escapeHtml(tab.name)}"
                       placeholder="Название"
                       oninput="updateTabField(${folderIdx}, ${tabIdx}, 'name', this.value)">
                <input type="text"
                       value="${escapeHtml(tab.url)}"
                       placeholder="URL"
                       oninput="updateTabField(${folderIdx}, ${tabIdx}, 'url', this.value)">
                <button onclick="deleteTab(${folderIdx}, ${tabIdx})" title="Удалить вкладку">×</button>
            </div>
        `).join('');

        folderDiv.innerHTML = `
            <div class="folder-item-header">
                <div class="move-buttons">
                    <button onclick="moveFolderUp(${folderIdx})" ${folderIdx === 0 ? 'disabled' : ''} title="Вверх">↑</button>
                    <button onclick="moveFolderDown(${folderIdx})" ${folderIdx === folders.length - 1 ? 'disabled' : ''} title="Вниз">↓</button>
                </div>
                <input type="text"
                       value="${escapeHtml(folder.name)}"
                       placeholder="Название папки"
                       oninput="updateFolderName(${folderIdx}, this.value)">
            </div>
            <div class="tabs-list">
                ${tabsHtml}
            </div>
            <div class="action-buttons">
                <button onclick="addTab(${folderIdx})">Добавить вкладку</button>
                <button onclick="deleteFolder(${folderIdx})">Удалить папку</button>
            </div>
        `;

        folderList.appendChild(folderDiv);
    });

    setTimeout(() => {
        setupTabDragAndDrop();
    }, 0);
}

function updateFolderName(folderIndex, newName) {
    if (folders[folderIndex]) {
        folders[folderIndex].name = newName;
        save();
        renderFolders();
    }
}

function updateTabField(folderIndex, tabIndex, field, value) {
    if (folders[folderIndex] && folders[folderIndex].tabs[tabIndex]) {
        folders[folderIndex].tabs[tabIndex][field] = value;
        save();
        renderFolders();
    }
}

function addFolder() {
    const newName = prompt('Название новой папки:');
    if (newName && newName.trim()) {
        folders.push({ name: newName.trim(), tabs: [] });
        save();
        renderFolders();
        renderEditor();
    }
}

function addTab(folderIndex) {
    const name = prompt('Название вкладки:');
    if (!name || !name.trim()) return;

    const url = prompt('URL вкладки:');
    if (!url || !url.trim()) return;

    folders[folderIndex].tabs.push({ name: name.trim(), url: url.trim() });
    save();
    renderFolders();
    renderEditor();
}

function deleteFolder(folderIndex) {
    if (confirm(`Вы уверены, что хотите удалить папку "${folders[folderIndex].name}"?`)) {
        folders.splice(folderIndex, 1);
        save();
        renderFolders();
        renderEditor();
    }
}

function deleteTab(folderIndex, tabIndex) {
    if (confirm(`Вы уверены, что хотите удалить вкладку "${folders[folderIndex].tabs[tabIndex].name}"?`)) {
        folders[folderIndex].tabs.splice(tabIndex, 1);
        save();
        renderFolders();
        renderEditor();
    }
}

function save() {
    const userId = localStorage.getItem('current_user_id');
    if (!userId) return;
    
    const userData = { folders, search_engine: searchEngine };
    localStorage.setItem(`data_${userId}`, JSON.stringify(userData));
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => saveWithQueue(userData, userId), 1000);
}

function handleTabClick(event, url) {
    if (event.button === 0) {
        event.preventDefault();
        window.location.href = url;
    } else if (event.button === 1) {
        event.preventDefault();
        window.open(url, '_blank');
    }
}

function search() {
    const q = document.getElementById('searchInput').value.trim();
    if (q) {
        const url = searchEngine === 'google' 
            ? `https://www.google.com/search?q=${encodeURIComponent(q)}` 
            : `https://yandex.ru/search/?text=${encodeURIComponent(q)}`;
        window.open(url, '_blank');
    }
}

function clearSearch() {
    document.getElementById('searchInput').value = '';
    document.querySelector('.clear-btn').style.display = 'none';
}

function exportSettings() {
    const dataStr = JSON.stringify(folders, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const link = document.createElement('a');
    link.setAttribute('href', dataUri);
    link.setAttribute('download', `bookmarks-${new Date().toISOString().slice(0, 10)}.json`);
    link.click();
}

function importSettings() {
    const userId = localStorage.getItem('current_user_id');
    if (!userId) {
        showNotification('Сначала выберите пользователя', 'error');
        return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = evt => {
            try {
                const data = JSON.parse(evt.target.result);
                if (Array.isArray(data) && data.every(f => typeof f === 'object' && typeof f.name === 'string' && Array.isArray(f.tabs))) {
                    if (confirm('Импорт заменит текущие данные. Продолжить?')) {
                        folders = data;
                        save();
                        renderFolders();
                        renderEditor();
                        showNotification('Импорт выполнен', 'success');
                    }
                } else {
                    throw new Error('Invalid format');
                }
            } catch {
                showNotification('Ошибка импорта', 'error');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

document.addEventListener('DOMContentLoaded', () => {
    loadFolders();

    document.getElementById('editorModal').addEventListener('click', function(event) {
        if (event.target === this) {
            toggleEditor();
        }
    });

    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.querySelector('.clear-btn');
    searchInput.addEventListener('input', function() {
        clearBtn.style.display = this.value ? 'inline-block' : 'none';
    });

    searchInput.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            search();
        }
    });

    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            const modal = document.getElementById('editorModal');
            if (modal.style.display !== 'none') {
                toggleEditor();
            }
        }
    });
});
