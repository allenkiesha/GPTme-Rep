import os
import logging
from flask import Flask, render_template, request, jsonify, redirect, url_for, flash, session as flask_session
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from openai import OpenAI
from sqlalchemy import or_
import uuid
from datetime import datetime

logging.basicConfig(level=logging.INFO)

app = Flask(__name__)
app.config['SECRET_KEY'] = os.urandom(24)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///users.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
openai_client = OpenAI(api_key=OPENAI_API_KEY)

AI_MODELS = {
    'gpt-4o': {'name': 'GPT-4 Turbo', 'description': 'Advanced language model for complex tasks'},
    'gpt-4o-mini': {'name': 'GPT-4 Mini', 'description': 'Efficient model for simpler tasks'},
}

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(120), nullable=False)
    notes = db.relationship('Note', backref='user', lazy=True)
    chat_sessions = db.relationship('ChatSession', backref='user', lazy=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class Note(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.Text, nullable=False)
    category = db.Column(db.String(50), nullable=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    is_essay = db.Column(db.Boolean, default=False)

class ChatSession(db.Model):
    id = db.Column(db.String(36), primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    messages = db.relationship('ChatMessage', backref='chat_session', lazy=True, cascade='all, delete-orphan')

class ChatMessage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    role = db.Column(db.String(20), nullable=False)
    content = db.Column(db.Text, nullable=False)
    is_essay = db.Column(db.Boolean, default=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    chat_session_id = db.Column(db.String(36), db.ForeignKey('chat_session.id', ondelete='CASCADE'), nullable=False)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

@app.route('/')
def index():
    return redirect(url_for('chat_page'))

@app.route('/chat')
@login_required
def chat_page():
    app.logger.info(f"Chat page accessed by user {current_user.username}")
    return render_template('chat.html', ai_models=AI_MODELS)

@app.route('/select_model', methods=['POST'])
@login_required
def select_model():
    model = request.form.get('model')
    if model in AI_MODELS:
        flask_session['selected_model'] = model
        flash(f'Model changed to {AI_MODELS[model]["name"]}', 'success')
    else:
        flash('Invalid model selection', 'error')
    return jsonify({"success": True})

@app.route('/new_session', methods=['POST'])
@login_required
def new_session():
    session_id = str(uuid.uuid4())
    new_chat_session = ChatSession(id=session_id, title="New Chat", user_id=current_user.id)
    db.session.add(new_chat_session)
    db.session.commit()
    return jsonify({"session_id": session_id, "title": "New Chat"})

@app.route('/generate_title', methods=['POST'])
@login_required
def generate_title():
    user_message = request.json.get('message')
    session_id = request.json.get('session_id')
    selected_model = flask_session.get('selected_model', 'gpt-4o')
    
    if not user_message or not session_id:
        app.logger.error("Missing required parameters for title generation")
        return jsonify({"error": "Missing required parameters"}), 400
    
    app.logger.info(f"Generating title for session {session_id} with message: {user_message}")
    app.logger.info(f"Using model: {selected_model}")
    
    try:
        completion = openai_client.chat.completions.create(
            model=selected_model,
            messages=[
                {"role": "system", "content": "Generate a short, catchy title (max 5 words) for a chat session based on the user's first message."},
                {"role": "user", "content": user_message}
            ],
            max_tokens=20
        )
        title = completion.choices[0].message.content.strip()
        
        app.logger.info(f"Generated title: {title}")
        
        chat_session = ChatSession.query.get(session_id)
        if chat_session:
            chat_session.title = title
            db.session.commit()
            app.logger.info(f"Updated session {session_id} with title: {title}")
            return jsonify({"title": title})
        else:
            app.logger.error(f"Chat session {session_id} not found")
            return jsonify({"error": "Chat session not found"}), 404
    except Exception as e:
        app.logger.error(f"Error generating title: {str(e)}")
        return jsonify({"error": "An error occurred while generating the title. Please try again."}), 500

@app.route('/chat', methods=['POST'])
@login_required
def chat():
    user_message = request.json['message']
    session_id = request.json['session_id']
    chat_session = ChatSession.query.get(session_id)
    if not chat_session:
        return jsonify({"error": "Invalid session"}), 400

    selected_model = flask_session.get('selected_model', 'gpt-4o')
    
    system_messages = {
        'gpt-4o': "You are a formal and detailed AI assistant. Provide comprehensive and well-structured responses.",
        'gpt-4o-mini': "You are a casual and concise AI assistant. Provide brief and friendly responses."
    }
    
    try:
        completion = openai_client.chat.completions.create(
            model=selected_model,
            messages=[
                {"role": "system", "content": system_messages[selected_model]},
                {"role": "user", "content": user_message}
            ],
            max_tokens=1000
        )
        ai_response = completion.choices[0].message.content
        
        if not ai_response:
            raise ValueError("OpenAI returned an empty response.")
        
        user_message_db = ChatMessage(role="user", content=user_message, chat_session=chat_session)
        ai_message_db = ChatMessage(role="assistant", content=ai_response, chat_session=chat_session)
        db.session.add(user_message_db)
        db.session.add(ai_message_db)
        db.session.commit()
        
        return jsonify({"response": ai_response, "is_essay": False})
    except Exception as e:
        app.logger.error(f"Error in chat: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/generate_essay', methods=['POST'])
@login_required
def generate_essay():
    note_ids = request.json.get('note_ids', [])
    session_id = request.json['session_id']
    selected_notes = Note.query.filter(Note.id.in_(note_ids), Note.user_id == current_user.id).all()
    
    if not selected_notes:
        return jsonify({"success": False, "message": "No valid notes selected"}), 400

    notes_content = "\n\n".join([f"{note.category}: {note.content}" for note in selected_notes])
    
    selected_model = flask_session.get('selected_model', 'gpt-4o')
    
    try:
        completion = openai_client.chat.completions.create(
            model=selected_model,
            messages=[
                {"role": "system", "content": "You are an expert essay writer. Create a well-structured, comprehensive essay based on the provided notes. Draw connections between ideas, analyze relationships, and provide new insights."},
                {"role": "user", "content": f"Write an essay based on these notes:\n\n{notes_content}"}
            ],
            max_tokens=2000
        )
        essay = completion.choices[0].message.content
        
        if not essay:
            raise ValueError("OpenAI returned an empty response.")
        
        essay_message = ChatMessage(role="assistant", content=essay, is_essay=True, chat_session_id=session_id)
        db.session.add(essay_message)
        db.session.commit()
        
        return jsonify({"success": True, "essay": essay})
    except Exception as e:
        app.logger.error(f"Error generating essay: {str(e)}")
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/get_session_messages/<session_id>', methods=['GET'])
@login_required
def get_session_messages(session_id):
    chat_session = ChatSession.query.get(session_id)
    if not chat_session or chat_session.user_id != current_user.id:
        return jsonify({"error": "Invalid session"}), 400
    
    messages = [
        {
            "role": message.role,
            "content": message.content,
            "is_essay": message.is_essay
        } for message in chat_session.messages
    ]
    return jsonify({"messages": messages})

@app.route('/get_user_sessions', methods=['GET'])
@login_required
def get_user_sessions():
    sessions = ChatSession.query.filter_by(user_id=current_user.id).order_by(ChatSession.created_at.desc()).all()
    return jsonify({
        "sessions": [
            {
                "id": session.id,
                "title": session.title,
                "created_at": session.created_at.isoformat()
            } for session in sessions
        ]
    })

@app.route('/save_note', methods=['POST'])
@login_required
def save_note():
    note_content = request.json['note']
    category = request.json.get('category', 'Uncategorized')
    is_essay = request.json.get('is_essay', False)
    new_note = Note(content=note_content, category=category, user_id=current_user.id, is_essay=is_essay)
    db.session.add(new_note)
    db.session.commit()
    return jsonify({"success": True, "notes": [{"id": note.id, "content": note.content, "category": note.category, "is_essay": note.is_essay} for note in current_user.notes]})

@app.route('/get_notes', methods=['GET'])
@login_required
def get_notes():
    return jsonify({"notes": [{"id": note.id, "content": note.content, "category": note.category, "is_essay": note.is_essay} for note in current_user.notes]})

@app.route('/search_notes', methods=['GET'])
@login_required
def search_notes():
    query = request.args.get('query', '')
    category = request.args.get('category', '')
    
    notes_query = Note.query.filter_by(user_id=current_user.id)
    
    if category:
        notes_query = notes_query.filter_by(category=category)
    
    if query:
        notes_query = notes_query.filter(or_(Note.content.ilike(f'%{query}%'), Note.category.ilike(f'%{query}%')))
    
    notes = notes_query.all()
    return jsonify({"notes": [{"id": note.id, "content": note.content, "category": note.category, "is_essay": note.is_essay} for note in notes]})

@app.route('/delete_note/<int:note_id>', methods=['DELETE'])
@login_required
def delete_note(note_id):
    note = Note.query.get(note_id)
    if note and note.user_id == current_user.id:
        db.session.delete(note)
        db.session.commit()
        return jsonify({"success": True, "message": "Note deleted successfully"})
    return jsonify({"success": False, "message": "Note not found or unauthorized"}), 404

@app.route('/get_selected_notes', methods=['POST'])
@login_required
def get_selected_notes():
    note_ids = request.json.get('note_ids', [])
    selected_notes = Note.query.filter(Note.id.in_(note_ids), Note.user_id == current_user.id).all()
    return jsonify({
        "success": True,
        "notes": [{"id": note.id, "content": note.content, "category": note.category, "is_essay": note.is_essay} for note in selected_notes]
    })

@app.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('chat_page'))
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        user = User.query.filter_by(username=username).first()
        if user:
            flash('Username already exists', 'error')
            return redirect(url_for('register'))
        
        new_user = User(username=username)
        new_user.set_password(password)
        db.session.add(new_user)
        db.session.commit()
        
        app.logger.info(f'New user registered: {username}')
        flash('Registration successful. Please log in.', 'success')
        return redirect(url_for('login'))
    
    return render_template('register.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    app.logger.info("Login route accessed")
    if current_user.is_authenticated:
        app.logger.info(f"User {current_user.username} already authenticated, redirecting to chat_page")
        return redirect(url_for('chat_page'))
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        user = User.query.filter_by(username=username).first()
        if user and user.check_password(password):
            login_user(user)
            flask_session['selected_model'] = 'gpt-4o'
            app.logger.info(f'User {username} logged in successfully')
            flash('Logged in successfully.', 'success')
            app.logger.info(f"Redirecting to chat_page for user {username}")
            return redirect(url_for('chat_page'))
        else:
            flash('Invalid username or password', 'error')
            app.logger.warning(f'Failed login attempt for username: {username}')
    
    app.logger.info("Rendering login template")
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    app.logger.info(f'User {current_user.username} logged out')
    logout_user()
    return redirect(url_for('index'))

@app.route('/<path:path>')
def catch_all(path):
    app.logger.warning(f"Unexpected route accessed: /{path}")
    return redirect(url_for('index'))

with app.app_context():
    db.create_all()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)