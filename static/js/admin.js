async function loadUsers() {
    try {
        const res = await fetch('/get_users');
        if (!res.ok) throw new Error('Failed to fetch users');
        const users = await res.json();
        renderUsers(users);
    } catch (e) {
        showNotification('Ошибка загрузки пользователей', 'error');
        console.error(e);
    }
}

function renderUsers(users) {
    const list = document.getElementById('usersList');
    if (!list) return;
    list.innerHTML = '';
    
    if (users.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'Пользователи не найдены.';
        list.appendChild(li);
        return;
    }

    users.forEach(userId => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${userId}</span>
            <button onclick="deleteUser('${userId}')">Удалить</button>
        `;
        list.appendChild(li);
    });
}

async function addUser() {
    const newUserIdInput = document.getElementById('newUserId');
    if (!newUserIdInput) return;
    const userId = newUserIdInput.value.trim();
    if (!userId) {
        showNotification('Введите ID пользователя', 'error');
        return;
    }
    
    try {
        const response = await fetch('/add_user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: userId })
        });
        
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Ошибка добавления');
        }
        
        newUserIdInput.value = '';
        loadUsers();
        showNotification('Пользователь добавлен', 'success');
    } catch (error) {
        showNotification(error.message, 'error');
        console.error(error);
    }
}

async function deleteUser(userId) {
    if (!confirm(`Удалить пользователя ${userId}?`)) return;
    
    try {
        const response = await fetch(`/delete_user/${userId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
             const error = await response.json();
            throw new Error(error.error || 'Ошибка удаления');
        }
        
        loadUsers();
        showNotification('Пользователь удален', 'success');
    } catch (error) {
        showNotification(error.message, 'error');
        console.error(error);
    }
}

document.addEventListener('DOMContentLoaded', loadUsers);