document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const chatContainer = document.querySelector('.chat-container');
    const notesList = document.getElementById('notes-list');
    const searchInput = document.getElementById('search-input');
    const categoryFilter = document.getElementById('category-filter');
    const newChatBtn = document.getElementById('new-chat-btn');
    const useSelectedNotesBtn = document.getElementById('use-selected-notes');
    const chatSessionsList = document.getElementById('chat-sessions');

    let notes = [];
    let currentSessionId = null;
    let selectedNotes = new Set();
    let isNewSession = false;

    async function createNewSession() {
        try {
            const response = await fetch('/new_session', { method: 'POST' });
            const data = await response.json();
            if (data.session_id && data.title) {
                currentSessionId = data.session_id;
                chatContainer.innerHTML = '';
                userInput.value = '';
                await loadUserSessions();
                updateSessionTitle(data.title);
                isNewSession = true;
            }
        } catch (error) {
            console.error('Error creating new session:', error);
            displayErrorMessage('Failed to create a new session. Please try again.');
        }
    }

    function updateSessionTitle(title) {
        const sessionTitle = document.getElementById('current-session-title');
        if (sessionTitle) {
            sessionTitle.textContent = title;
        }
    }

    async function loadUserSessions() {
        try {
            const response = await fetch('/get_user_sessions');
            const data = await response.json();
            updateSessionsList(data.sessions);
        } catch (error) {
            console.error('Error loading user sessions:', error);
            displayErrorMessage('Failed to load chat sessions. Please refresh the page.');
        }
    }

    function updateSessionsList(sessions) {
        chatSessionsList.innerHTML = '';
        sessions.forEach(session => {
            const sessionItem = document.createElement('li');
            sessionItem.textContent = session.title;
            sessionItem.classList.add('cursor-pointer', 'hover:bg-gray-200', 'p-2', 'rounded', 'truncate');
            sessionItem.setAttribute('data-session-id', session.id);
            sessionItem.addEventListener('click', () => switchChatSession(session.id));
            chatSessionsList.appendChild(sessionItem);
        });
    }

    async function generateSessionTitle(message) {
        try {
            console.log('Generating session title for message:', message);
            const response = await fetch('/generate_title', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message, session_id: currentSessionId }),
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            console.log('Received title generation response:', data);
            if (data.title) {
                updateSessionTitle(data.title);
                await loadUserSessions();
            } else if (data.error) {
                throw new Error(data.error);
            }
        } catch (error) {
            console.error('Error generating session title:', error);
            displayErrorMessage(`Failed to generate session title: ${error.message}`);
        }
    }

    function displayErrorMessage(message) {
        const errorDiv = document.createElement('div');
        errorDiv.textContent = message;
        errorDiv.classList.add('error-message', 'bg-red-100', 'border', 'border-red-400', 'text-red-700', 'px-4', 'py-3', 'rounded', 'relative', 'mb-4');
        chatContainer.insertBefore(errorDiv, chatContainer.firstChild);
        setTimeout(() => {
            errorDiv.remove();
        }, 5000);
    }

    async function switchChatSession(sessionId) {
        try {
            const response = await fetch(`/get_session_messages/${sessionId}`);
            const data = await response.json();
            displaySessionMessages(data.messages);
            currentSessionId = sessionId;
            const sessionItem = document.querySelector(`[data-session-id="${sessionId}"]`);
            if (sessionItem) {
                updateSessionTitle(sessionItem.textContent);
            }
        } catch (error) {
            console.error('Error switching chat session:', error);
            displayErrorMessage('Failed to switch chat session. Please try again.');
        }
    }

    function displaySessionMessages(messages) {
        chatContainer.innerHTML = '';
        messages.forEach(message => {
            appendMessage(message.role, message.content, message.is_essay);
        });
    }

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
                    body: JSON.stringify({ message, session_id: currentSessionId }),
                });

                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }

                const data = await response.json();
                appendMessage('assistant', data.response, data.is_essay, true);

                if (isNewSession) {
                    await generateSessionTitle(message);
                    isNewSession = false;
                }
            } catch (error) {
                console.error('Error:', error);
                appendMessage('error', 'An error occurred. Please try again.');
            }
        });
    }

    function appendMessage(sender, content, isEssay = false, isSaveable = false) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', 'mb-4', 'p-3', 'rounded');

        if (sender === 'user') {
            messageDiv.classList.add('user-message');
        } else if (sender === 'assistant') {
            if (isEssay) {
                messageDiv.classList.add('essay-message');
                content = `
                    <div class="essay-message-content">${formatEssayContent(content)}</div>
                    <div class="essay-floating-buttons">
                        <button class="essay-floating-button save-essay-btn" title="Save Essay">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
                            </svg>
                        </button>
                        <button class="essay-floating-button share-essay-btn" title="Share Essay">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
                            </svg>
                        </button>
                    </div>
                `;
            } else {
                messageDiv.classList.add('ai-message');
            }
        } else {
            messageDiv.classList.add('bg-red-100', 'text-red-800');
        }

        messageDiv.innerHTML = content;

        if (isSaveable && !isEssay) {
            const saveButton = document.createElement('button');
            saveButton.textContent = 'Save to Notes';
            saveButton.classList.add('btn', 'btn-primary', 'mt-2');
            saveButton.addEventListener('click', () => showSaveNoteModal(content));
            messageDiv.appendChild(saveButton);
        }

        chatContainer.appendChild(messageDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;

        if (isEssay) {
            const saveEssayBtn = messageDiv.querySelector('.save-essay-btn');
            const shareEssayBtn = messageDiv.querySelector('.share-essay-btn');

            saveEssayBtn.addEventListener('click', () => saveEssay(content));
            shareEssayBtn.addEventListener('click', () => shareEssay(content));
        }
    }

    function formatEssayContent(content) {
        const paragraphs = content.split('\n\n');
        let formattedContent = `<h2>${paragraphs[0]}</h2>`;
        for (let i = 1; i < paragraphs.length; i++) {
            formattedContent += `<p>${paragraphs[i]}</p>`;
        }
        return formattedContent;
    }

    function showSaveNoteModal(content, category = '') {
        const modal = document.createElement('div');
        modal.classList.add('fixed', 'inset-0', 'bg-gray-600', 'bg-opacity-50', 'overflow-y-auto', 'h-full', 'w-full');
        modal.innerHTML = `
            <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                <h3 class="text-lg font-bold mb-4">Save Note</h3>
                <textarea id="note-content" class="w-full p-2 border rounded mb-4" rows="4">${content}</textarea>
                <input type="text" id="note-category" class="w-full p-2 border rounded mb-4" placeholder="Category" value="${category}">
                <div class="flex justify-end">
                    <button id="cancel-save" class="btn mr-2">Cancel</button>
                    <button id="confirm-save" class="btn btn-primary">Save</button>
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
            displayErrorMessage('Failed to save note. Please try again.');
        }
    }

    function updateNotesList() {
        notesList.innerHTML = '';
        notes.forEach((note) => {
            const noteElement = document.createElement('div');
            noteElement.classList.add('note-item');
            noteElement.setAttribute('data-note-id', note.id);
            noteElement.innerHTML = `
                <input type="checkbox" class="note-select" data-note-id="${note.id}">
                <div class="note-content">
                    <p class="font-bold">${note.category}</p>
                    <p class="note-preview">${note.content.substring(0, 50)}${note.content.length > 50 ? '...' : ''}</p>
                </div>
                <div class="note-actions">
                    <button class="view-note-btn btn" data-note-id="${note.id}">View</button>
                    <button class="delete-note-btn btn" data-note-id="${note.id}">
                        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                        </svg>
                    </button>
                </div>
            `;
            notesList.appendChild(noteElement);
        });

        document.querySelectorAll('.note-select').forEach(selectButton => {
            selectButton.addEventListener('change', (e) => {
                const noteId = e.target.getAttribute('data-note-id');
                toggleNoteSelection(noteId, e.target.checked);
            });
        });

        document.querySelectorAll('.delete-note-btn').forEach(button => {
            button.addEventListener('click', async (e) => {
                const noteId = e.target.closest('.delete-note-btn').getAttribute('data-note-id');
                await deleteNote(noteId);
            });
        });

        document.querySelectorAll('.view-note-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const noteId = e.target.getAttribute('data-note-id');
                console.log(`View button clicked for note id: ${noteId}`);
                viewNote(noteId);
            });
        });
    }

    function viewNote(noteId) {
        const note = notes.find(n => n.id == noteId);
        if (!note) {
            console.error(`Note with id ${noteId} not found`);
            return;
        }

        const noteViewSidebar = document.getElementById('note-view-sidebar');
        const noteViewContent = document.getElementById('note-view-content');
        
        noteViewContent.innerHTML = `
            <h3>${note.category}</h3>
            <div>${note.content}</div>
        `;

        noteViewSidebar.classList.add('active');
        console.log('Note view sidebar activated');
    }

    document.getElementById('close-note-view').addEventListener('click', () => {
        const noteViewSidebar = document.getElementById('note-view-sidebar');
        noteViewSidebar.classList.remove('active');
        console.log('Note view sidebar deactivated');
    });

    function toggleNoteSelection(noteId, isChecked) {
        try {
            const noteElement = document.querySelector(`.note-item[data-note-id="${noteId}"]`);
            if (!noteElement) {
                throw new Error(`Note element with id ${noteId} not found`);
            }

            if (isChecked) {
                selectedNotes.add(noteId);
                noteElement.classList.add('selected');
            } else {
                selectedNotes.delete(noteId);
                noteElement.classList.remove('selected');
            }

            if (selectedNotes.size > 0) {
                useSelectedNotesBtn.classList.remove('hidden');
            } else {
                useSelectedNotesBtn.classList.add('hidden');
            }
        } catch (error) {
            console.error('Error toggling note selection:', error);
            displayErrorMessage('Failed to select note. Please try again.');
        }
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
                selectedNotes.delete(noteId);
                updateNotesList();
                updateCategoryFilter();
            } else {
                throw new Error(data.message);
            }
        } catch (error) {
            console.error('Error deleting note:', error);
            displayErrorMessage(`Failed to delete note: ${error.message}`);
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

        updateNotesList(filteredNotes);
    }

    useSelectedNotesBtn.addEventListener('click', async () => {
        if (selectedNotes.size === 0) {
            alert('Please select at least one note to use.');
            return;
        }

        try {
            const response = await fetch('/generate_essay', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    note_ids: Array.from(selectedNotes),
                    session_id: currentSessionId
                }),
            });

            if (!response.ok) {
                throw new Error('Network response was not ok');
            }

            const data = await response.json();
            if (data.success) {
                appendMessage('assistant', data.essay, true, true);
            } else {
                throw new Error(data.message);
            }
        } catch (error) {
            console.error('Error generating essay:', error);
            displayErrorMessage(`Failed to generate essay: ${error.message}`);
        }
    });

    function saveEssay(content) {
        showSaveNoteModal(content, 'Essay');
    }

    function shareEssay(content) {
        console.log('Share essay functionality to be implemented');
        alert('Sharing functionality is not yet implemented.');
    }

    fetch('/get_notes')
        .then(response => response.json())
        .then(data => {
            notes = data.notes;
            updateNotesList();
            updateCategoryFilter();
        })
        .catch(error => {
            console.error('Error fetching notes:', error);
            displayErrorMessage('Failed to load notes. Please refresh the page.');
        });

    newChatBtn.addEventListener('click', createNewSession);

    document.querySelector('form[action="/select_model"]').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const submitButton = e.target.querySelector('button[type="submit"]');
        const originalButtonText = submitButton.textContent;

        try {
            const response = await fetch('/select_model', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            if (data.success) {
                console.log('Model changed successfully');
                submitButton.textContent = 'Model Updated';
                submitButton.classList.add('bg-green-500');
                submitButton.classList.remove('bg-blue-500');
                
                setTimeout(() => {
                    submitButton.textContent = originalButtonText;
                    submitButton.classList.remove('bg-green-500');
                    submitButton.classList.add('bg-blue-500');
                }, 2000);
            } else {
                throw new Error('Failed to change model');
            }
        } catch (error) {
            console.error('Error changing model:', error);
            displayErrorMessage('Failed to change model. Please try again.');
        }
    });

    loadUserSessions().then(() => {
        if (chatSessionsList.children.length > 0) {
            const firstSessionId = chatSessionsList.children[0].getAttribute('data-session-id');
            switchChatSession(firstSessionId);
        } else {
            createNewSession();
        }
    });
});