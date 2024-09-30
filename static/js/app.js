document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const chatContainer = document.querySelector('.chat-container');
    const notesList = document.getElementById('notes-list');
    const searchInput = document.getElementById('search-input');
    const categoryFilter = document.getElementById('category-filter');

    let notes = [];

    if (chatForm) {
        chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const message = userInput.value.trim();
            if (!message) return;

            appendMessage('user', message);
            userInput.value = '';

            try {
                const response = await fetch('/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ message }),
                });

                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }

                const data = await response.json();
                appendMessage('ai', data.response, true);
            } catch (error) {
                console.error('Error:', error);
                appendMessage('error', 'An error occurred. Please try again.');
            }
        });
    }

    function appendMessage(sender, content, isSaveable = false) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('mb-4', 'p-2', 'rounded');

        if (sender === 'user') {
            messageDiv.classList.add('bg-blue-100', 'text-blue-800');
        } else if (sender === 'ai') {
            messageDiv.classList.add('bg-green-100', 'text-green-800');
        } else {
            messageDiv.classList.add('bg-red-100', 'text-red-800');
        }

        messageDiv.textContent = content;

        if (isSaveable) {
            const saveButton = document.createElement('button');
            saveButton.textContent = 'Save to Notes';
            saveButton.classList.add('ml-2', 'px-2', 'py-1', 'bg-yellow-500', 'text-white', 'rounded');
            saveButton.addEventListener('click', () => showSaveNoteModal(content));
            messageDiv.appendChild(saveButton);
        }

        chatContainer.appendChild(messageDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function showSaveNoteModal(content) {
        const modal = document.createElement('div');
        modal.classList.add('fixed', 'inset-0', 'bg-gray-600', 'bg-opacity-50', 'overflow-y-auto', 'h-full', 'w-full');
        modal.innerHTML = `
            <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                <h3 class="text-lg font-bold mb-4">Save Note</h3>
                <textarea id="note-content" class="w-full p-2 border rounded mb-4" rows="4">${content}</textarea>
                <input type="text" id="note-category" class="w-full p-2 border rounded mb-4" placeholder="Category">
                <div class="flex justify-end">
                    <button id="cancel-save" class="px-4 py-2 bg-gray-300 text-black rounded mr-2">Cancel</button>
                    <button id="confirm-save" class="px-4 py-2 bg-blue-500 text-white rounded">Save</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('cancel-save').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        document.getElementById('confirm-save').addEventListener('click', () => {
            const noteContent = document.getElementById('note-content').value;
            const noteCategory = document.getElementById('note-category').value || 'Uncategorized';
            saveNote(noteContent, noteCategory);
            document.body.removeChild(modal);
        });
    }

    async function saveNote(content, category) {
        try {
            const response = await fetch('/save_note', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ note: content, category: category }),
            });

            if (!response.ok) {
                throw new Error('Network response was not ok');
            }

            const data = await response.json();
            notes = data.notes;
            updateNotesList();
            updateCategoryFilter();
        } catch (error) {
            console.error('Error saving note:', error);
        }
    }

    function updateNotesList() {
        notesList.innerHTML = '';
        notes.forEach((note) => {
            const noteElement = document.createElement('div');
            noteElement.classList.add('mb-2', 'p-2', 'bg-gray-100', 'rounded', 'flex', 'justify-between', 'items-center');
            noteElement.innerHTML = `
                <div>
                    <p class="font-bold">${note.category}</p>
                    <p>${note.content}</p>
                </div>
                <button class="delete-note-btn px-2 py-1 bg-red-500 text-white rounded" data-note-id="${note.id}">Delete</button>
            `;
            notesList.appendChild(noteElement);
        });

        // Add event listeners to delete buttons
        document.querySelectorAll('.delete-note-btn').forEach(button => {
            button.addEventListener('click', async (e) => {
                const noteId = e.target.getAttribute('data-note-id');
                await deleteNote(noteId);
            });
        });
    }

    async function deleteNote(noteId) {
        try {
            const response = await fetch(`/delete_note/${noteId}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                throw new Error('Network response was not ok');
            }

            const data = await response.json();
            if (data.success) {
                notes = notes.filter(note => note.id != noteId);
                updateNotesList();
                updateCategoryFilter();
            } else {
                console.error('Error deleting note:', data.message);
            }
        } catch (error) {
            console.error('Error deleting note:', error);
        }
    }

    function updateCategoryFilter() {
        const categories = new Set(notes.map(note => note.category));
        categoryFilter.innerHTML = '<option value="">All Categories</option>';
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categoryFilter.appendChild(option);
        });
    }

    searchInput.addEventListener('input', filterNotes);
    categoryFilter.addEventListener('change', filterNotes);

    function filterNotes() {
        const searchQuery = searchInput.value.toLowerCase();
        const selectedCategory = categoryFilter.value;

        const filteredNotes = notes.filter(note => {
            const matchesSearch = note.content.toLowerCase().includes(searchQuery) || note.category.toLowerCase().includes(searchQuery);
            const matchesCategory = !selectedCategory || note.category === selectedCategory;
            return matchesSearch && matchesCategory;
        });

        notesList.innerHTML = '';
        filteredNotes.forEach((note) => {
            const noteElement = document.createElement('div');
            noteElement.classList.add('mb-2', 'p-2', 'bg-gray-100', 'rounded', 'flex', 'justify-between', 'items-center');
            noteElement.innerHTML = `
                <div>
                    <p class="font-bold">${note.category}</p>
                    <p>${note.content}</p>
                </div>
                <button class="delete-note-btn px-2 py-1 bg-red-500 text-white rounded" data-note-id="${note.id}">Delete</button>
            `;
            notesList.appendChild(noteElement);
        });

        // Add event listeners to delete buttons
        document.querySelectorAll('.delete-note-btn').forEach(button => {
            button.addEventListener('click', async (e) => {
                const noteId = e.target.getAttribute('data-note-id');
                await deleteNote(noteId);
            });
        });
    }

    // Fetch initial notes
    fetch('/get_notes')
        .then(response => response.json())
        .then(data => {
            notes = data.notes;
            updateNotesList();
            updateCategoryFilter();
        })
        .catch(error => console.error('Error fetching notes:', error));

    // New function to switch chat sessions
    function switchChatSession(sessionId) {
        console.log(`Switching to chat session ${sessionId}`);
        // Placeholder: In the future, this will load the selected chat session
    }

    // Add event listeners for chat session switching
    document.querySelectorAll('#chat-sessions li').forEach(session => {
        session.addEventListener('click', (e) => {
            const sessionId = e.target.textContent.split(' ')[1];
            switchChatSession(sessionId);
        });
    });
});
