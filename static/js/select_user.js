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
    const grid = document.getElementById('usersGrid');
    if (!grid) return;
    grid.innerHTML = '';
    
    if (users.length === 0) {
        grid.innerHTML = '<p>Пользователи не найдены. Создайте нового.</p>';
        return;
    }
    
    users.forEach(userId => {
        const userCard = document.createElement('div');
        userCard.className = 'user-card';
        userCard.innerHTML = `
            <span>${userId}</span>
            <button onclick="selectUser('${userId}')">Выбрать</button>
        `;
        grid.appendChild(userCard);
    });
}

function selectUser(userId) {
    localStorage.setItem('current_user_id', userId);
    window.location.href = `/?user_id=${userId}`;
}

async function createUser() {
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
            throw new Error(result.error || 'Ошибка создания');
        }
        
        showNotification('Пользователь создан', 'success');
        newUserIdInput.value = '';
        loadUsers();
    } catch (error) {
        showNotification(error.message, 'error');
        console.error(error);
    }
}

document.addEventListener('DOMContentLoaded', loadUsers);