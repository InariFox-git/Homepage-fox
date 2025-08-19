// 1. Сначала объявляем класс
class DataManager {
    constructor() {
        this.saveQueue = Promise.resolve();
        this.lastSave = Date.now();
        this.minSaveInterval = 1000;
    }

    async saveWithQueue(data, userId) {
        this.saveQueue = this.saveQueue.then(async () => {
            const now = Date.now();
            if (now - this.lastSave < this.minSaveInterval) {
                await new Promise(resolve => setTimeout(resolve, this.minSaveInterval - (now - this.lastSave)));
            }

            try {
                const response = await fetch(`/save_folders/${userId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                this.showNotification('Сохранено успешно', 'success');
            } catch (error) {
                console.error('Ошибка сохранения:', error);
                this.showNotification('Ошибка сохранения. Проверьте соединение.', 'error');
            }
        });
    }

    showNotification(message, type = 'info') {
        const container = document.getElementById('notification-container');
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        container.appendChild(notification);
        setTimeout(() => {
            notification.style.animation = 'slideDown 0.3s ease-out reverse';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

// 2. Теперь создаём экземпляр
const dataManager = new DataManager();

// 3. Остальной код
let folders = [];
let saveTimeout = null;

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
        const res = await fetch(`/get_folders/${userId}`);
        if (!res.ok) throw new Error('User not found');
        
        folders = await res.json();
        localStorage.setItem(`folders_${userId}`, JSON.stringify(folders));
    } catch (e) {
        console.log('Creating new user folders');
        folders = [];
        localStorage.setItem(`folders_${userId}`, JSON.stringify(folders));
    }
    
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
        // Меняем местами текущую папку и предыдущую
        const temp = folders[index];
        folders[index] = folders[index - 1];
        folders[index - 1] = temp;
        
        save();
        renderFolders();
        renderEditor();
    }
}

function moveFolderDown(index) {
    if (index < folders.length - 1) {
        // Меняем местами текущую папку и следующую
        const temp = folders[index];
        folders[index] = folders[index + 1];
        folders[index + 1] = temp;
        
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
                       id="tab-name-${folderIdx}-${tabIdx}"
                       name="tab-name-${folderIdx}-${tabIdx}"
                       value="${escapeHtml(tab.name)}"
                       placeholder="Название вкладки"
                       oninput="updateTabName(${folderIdx}, ${tabIdx}, this.value)">
                <input type="text"
                       id="tab-url-${folderIdx}-${tabIdx}"
                       name="tab-url-${folderIdx}-${tabIdx}"
                       value="${escapeHtml(tab.url)}"
                       placeholder="URL вкладки"
                       oninput="updateTabUrl(${folderIdx}, ${tabIdx}, this.value)">
                <button onclick="deleteTab(${folderIdx}, ${tabIdx})" title="Удалить вкладку">×</button>
            </div>
        `).join('');

        folderDiv.innerHTML = `
            <div class="move-buttons">
                <button onclick="moveFolderUp(${folderIdx})" 
                    ${folderIdx === 0 ? 'disabled' : ''} 
                    title="Вверх">↑</button>
                <button onclick="moveFolderDown(${folderIdx})" 
                    ${folderIdx === folders.length - 1 ? 'disabled' : ''} 
                    title="Вниз">↓</button>
            </div>
            <input type="text"
                   id="folder-name-${folderIdx}"
                   name="folder-name-${folderIdx}"
                   value="${escapeHtml(folder.name)}"
                   placeholder="Название папки"
                   oninput="updateFolderName(${folderIdx}, this.value)">
            <div class="tabs-list">${tabsHtml}</div>
            <div class="action-buttons">
                <button onclick="addTab(${folderIdx})">Добавить вкладку</button>
                <button onclick="deleteFolder(${folderIdx})" style="background-color: var(--red);">Удалить папку</button>
            </div>
        `;

        folderList.appendChild(folderDiv);
    });

    setTimeout(() => {
        setupTabDragAndDrop();
    }, 0);
}

function updateFolderName(i, v) {
    if (v.trim()) {
        folders[i].name = v.trim();
        save();
        renderFolders();
    }
}

function addFolder() {
    const n = prompt('Название папки:');
    if (n) { folders.push({ name: n, tabs: [] }); save(); renderFolders(); renderEditor(); }
}

function addTab(i) {
    const name = prompt('Название вкладки:');
    const url = prompt('URL:');
    if (name && url) { folders[i].tabs.push({ name, url }); save(); renderFolders(); renderEditor(); }
}

function deleteFolder(i) {
    if (confirm('Удалить папку?')) { folders.splice(i, 1); save(); renderFolders(); renderEditor(); }
}

function save() {
    const userId = localStorage.getItem('current_user_id');
    if (!userId) return;
    
    localStorage.setItem(`folders_${userId}`, JSON.stringify(folders));
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => dataManager.saveWithQueue(folders, userId), 1000);
}

function handleTabClick(event, url) {
    if (event.button === 0) {               // левая кнопка
        event.preventDefault();
        window.location.href = url;         // открыть в текущем окне
    } else if (event.button === 1) {        // средняя кнопка
        event.preventDefault();
        window.open(url, '_blank');         // открыть в новой вкладке
    }
}

function searchYandex() {
    const q = document.getElementById('searchInput').value.trim();
    if (q) window.open(`https://yandex.ru/search/?text=${encodeURIComponent(q)}`, '_blank');
}

function clearSearch() {
    document.getElementById('searchInput').value = '';
    document.querySelector('.clear-btn').style.display = 'none';
}

// Экспорт
function exportSettings() {
    const dataStr = JSON.stringify(folders, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const link = document.createElement('a');
    link.setAttribute('href', dataUri);
    link.setAttribute('download', `bookmarks-${new Date().toISOString().slice(0, 10)}.json`);
    link.click();
}

// Импорт
function importSettings() {
    const userId = localStorage.getItem('current_user_id');
    if (!userId) {
        dataManager.showNotification('Сначала выберите пользователя', 'error');
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
                        localStorage.setItem(`folders_${userId}`, JSON.stringify(folders));
                        dataManager.saveWithQueue(folders, userId);
                        renderFolders();
                        renderEditor();
                        dataManager.showNotification('Импорт выполнен', 'success');
                    }
                } else {
                    throw new Error('Invalid format');
                }
            } catch {
                dataManager.showNotification('Ошибка импорта', 'error');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

document.addEventListener('DOMContentLoaded', loadFolders);