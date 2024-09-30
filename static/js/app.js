document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const chatContainer = document.querySelector('.chat-container');
    const notesList = document.getElementById('notes-list');
    const searchInput = document.getElementById('search-input');
    const categoryFilter = document.getElementById('category-filter');
    const newChatBtn = document.getElementById('new-chat-btn');
    const generateArticleBtn = document.getElementById('generate-article-btn');
    const articlesList = document.getElementById('articles-list');

    let notes = [];
    let currentSessionId = null;
    let selectedNotes = new Set();

    async function createNewSession() {
        try {
            const response = await fetch('/new_session', { method: 'POST' });
            const data = await response.json();
            if (data.session_id) {
                currentSessionId = data.session_id;
                chatContainer.innerHTML = '';
                userInput.value = '';
            }
        } catch (error) {
            console.error('Error creating new session:', error);
        }
    }

    async function generateSessionTitle(message) {
        try {
            const response = await fetch('/generate_title', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message }),
            });
            const data = await response.json();
            if (data.title) {
                addSessionToSidebar(currentSessionId, data.title);
            }
        } catch (error) {
            console.error('Error generating session title:', error);
        }
    }

    function addSessionToSidebar(sessionId, title) {
        const sessionsList = document.getElementById('chat-sessions');
        const sessionItem = document.createElement('li');
        sessionItem.textContent = title;
        sessionItem.classList.add('cursor-pointer', 'hover:bg-gray-200', 'p-2', 'rounded', 'truncate');
        sessionItem.setAttribute('data-session-id', sessionId);
        sessionItem.addEventListener('click', () => switchChatSession(sessionId));
        sessionsList.appendChild(sessionItem);
    }

    async function switchChatSession(sessionId) {
        try {
            const response = await fetch(`/get_session_messages/${sessionId}`);
            const data = await response.json();
            displaySessionMessages(data.messages);
            currentSessionId = sessionId;
        } catch (error) {
            console.error('Error switching chat session:', error);
        }
    }

    function displaySessionMessages(messages) {
        chatContainer.innerHTML = '';
        messages.forEach(message => {
            appendMessage(message.role, message.content);
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
                appendMessage('assistant', data.response, true);

                const sessionsList = document.getElementById('chat-sessions');
                if (sessionsList.children.length === 0) {
                    await generateSessionTitle(message);
                }
            } catch (error) {
                console.error('Error:', error);
                appendMessage('error', 'An error occurred. Please try again.');
            }
        });
    }

    function appendMessage(sender, content, isSaveable = false) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', 'mb-4', 'p-3', 'rounded');

        if (sender === 'user') {
            messageDiv.classList.add('user-message');
        } else if (sender === 'assistant') {
            messageDiv.classList.add('ai-message');
        } else {
            messageDiv.classList.add('bg-red-100', 'text-red-800');
        }

        messageDiv.textContent = content;

        if (isSaveable) {
            const saveButton = document.createElement('button');
            saveButton.textContent = 'Save to Notes';
            saveButton.classList.add('btn', 'btn-primary', 'mt-2');
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
        }
    }

    function updateNotesList() {
        notesList.innerHTML = '';
        notes.forEach((note) => {
            const noteElement = document.createElement('div');
            noteElement.classList.add('mb-2', 'p-2', 'flex', 'justify-between', 'items-center', 'cursor-move');
            noteElement.setAttribute('draggable', 'true');
            noteElement.setAttribute('data-note-id', note.id);
            noteElement.innerHTML = `
                <div class="flex items-center">
                    <input type="checkbox" class="note-checkbox mr-2" data-note-id="${note.id}">
                    <div>
                        <p class="font-bold">${note.category}</p>
                        <p>${note.content}</p>
                    </div>
                </div>
                <button class="delete-note-btn btn btn-danger" data-note-id="${note.id}">Delete</button>
            `;
            notesList.appendChild(noteElement);

            noteElement.addEventListener('dragstart', dragStart);
            noteElement.addEventListener('dragover', dragOver);
            noteElement.addEventListener('drop', drop);
        });

        document.querySelectorAll('.delete-note-btn').forEach(button => {
            button.addEventListener('click', async (e) => {
                const noteId = e.target.getAttribute('data-note-id');
                await deleteNote(noteId);
            });
        });

        document.querySelectorAll('.note-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const noteId = e.target.getAttribute('data-note-id');
                if (e.target.checked) {
                    selectedNotes.add(noteId);
                } else {
                    selectedNotes.delete(noteId);
                }
                updateGenerateArticleButton();
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

        updateNotesList(filteredNotes);
    }

    function dragStart(e) {
        e.dataTransfer.setData('text/plain', e.target.getAttribute('data-note-id'));
    }

    function dragOver(e) {
        e.preventDefault();
    }

    function drop(e) {
        e.preventDefault();
        const draggedNoteId = e.dataTransfer.getData('text');
        const targetNoteId = e.target.closest('[data-note-id]').getAttribute('data-note-id');
        
        if (draggedNoteId !== targetNoteId) {
            const draggedIndex = notes.findIndex(note => note.id.toString() === draggedNoteId);
            const targetIndex = notes.findIndex(note => note.id.toString() === targetNoteId);
            
            const [reorderedNote] = notes.splice(draggedIndex, 1);
            notes.splice(targetIndex, 0, reorderedNote);
            
            updateNotesList();
            updateNotesOrder();
        }
    }

    async function updateNotesOrder() {
        try {
            const response = await fetch('/update_notes_order', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ notes: notes.map(note => note.id) }),
            });

            if (!response.ok) {
                throw new Error('Network response was not ok');
            }

            const data = await response.json();
            if (data.success) {
                console.log('Notes order updated successfully');
            } else {
                console.error('Error updating notes order:', data.message);
            }
        } catch (error) {
            console.error('Error updating notes order:', error);
        }
    }

    function updateGenerateArticleButton() {
        if (selectedNotes.size > 0) {
            generateArticleBtn.classList.remove('hidden');
        } else {
            generateArticleBtn.classList.add('hidden');
        }
    }

    generateArticleBtn.addEventListener('click', async () => {
        const selectedNoteIds = Array.from(selectedNotes);
        try {
            const response = await fetch('/generate_article', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ note_ids: selectedNoteIds }),
            });

            if (!response.ok) {
                throw new Error('Network response was not ok');
            }

            const data = await response.json();
            if (data.success) {
                displayArticle(data.article);
                selectedNotes.clear();
                updateGenerateArticleButton();
                updateNotesList();
            } else {
                console.error('Error generating article:', data.message);
            }
        } catch (error) {
            console.error('Error generating article:', error);
        }
    });

    function displayArticle(article) {
        const articleElement = document.createElement('div');
        articleElement.classList.add('mb-4', 'p-2', 'bg-gray-800', 'rounded');
        articleElement.innerHTML = `
            <h3 class="font-bold mb-2">${article.title}</h3>
            <p>${article.content}</p>
        `;
        articlesList.appendChild(articleElement);
    }

    async function fetchArticles() {
        try {
            const response = await fetch('/get_articles');
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            const data = await response.json();
            displayArticles(data.articles);
        } catch (error) {
            console.error('Error fetching articles:', error);
        }
    }

    function displayArticles(articles) {
        articlesList.innerHTML = '';
        articles.forEach(article => {
            const articleElement = document.createElement('div');
            articleElement.classList.add('mb-4', 'p-2', 'bg-gray-800', 'rounded');
            articleElement.innerHTML = `
                <h3 class="font-bold mb-2">${article.title}</h3>
                <p>${article.content}</p>
            `;
            articlesList.appendChild(articleElement);
        });
    }

    fetch('/get_notes')
        .then(response => response.json())
        .then(data => {
            notes = data.notes;
            updateNotesList();
            updateCategoryFilter();
        })
        .catch(error => console.error('Error fetching notes:', error));

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
            }
        } catch (error) {
            console.error('Error changing model:', error);
        }
    });

    createNewSession();
    fetchArticles();
});
