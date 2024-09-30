document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const chatContainer = document.querySelector('.chat-container');
    const notesSidebar = document.querySelector('.notes-sidebar');

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
            saveButton.addEventListener('click', () => saveNote(content));
            messageDiv.appendChild(saveButton);
        }

        chatContainer.appendChild(messageDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    async function saveNote(content) {
        try {
            const response = await fetch('/save_note', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ note: content }),
            });

            if (!response.ok) {
                throw new Error('Network response was not ok');
            }

            const data = await response.json();
            updateNotesSidebar(data.notes);
        } catch (error) {
            console.error('Error saving note:', error);
        }
    }

    function updateNotesSidebar(notes) {
        notesSidebar.innerHTML = '<h2 class="text-xl font-bold mb-4">Notes</h2>';
        notes.forEach((note, index) => {
            const noteElement = document.createElement('div');
            noteElement.classList.add('mb-2', 'p-2', 'bg-gray-100', 'rounded');
            noteElement.textContent = `${index + 1}. ${note}`;
            notesSidebar.appendChild(noteElement);
        });
    }

    // Fetch initial notes
    fetch('/get_notes')
        .then(response => response.json())
        .then(data => updateNotesSidebar(data.notes))
        .catch(error => console.error('Error fetching notes:', error));
});
