import os
import logging
from flask import Flask, render_template, request, jsonify, redirect, url_for, flash
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from openai import OpenAI

logging.basicConfig(level=logging.INFO)

app = Flask(__name__)
app.config['SECRET_KEY'] = os.urandom(24)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///users.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'

# Initialize OpenAI client
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
openai_client = OpenAI(api_key=OPENAI_API_KEY)

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(120), nullable=False)
    notes = db.relationship('Note', backref='user', lazy=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class Note(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.Text, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/chat')
@login_required
def chat_page():
    app.logger.info(f"Chat page accessed by user {current_user.username}")
    if not current_user.is_authenticated:
        app.logger.warning(f'Unauthenticated user tried to access chat page')
        return redirect(url_for('login'))
    app.logger.info(f'Rendering chat template for user {current_user.username}')
    return render_template('chat.html')

@app.route('/chat', methods=['POST'])
@login_required
def chat():
    user_message = request.json['message']
    
    try:
        completion = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": user_message}],
            max_tokens=150
        )
        ai_response = completion.choices[0].message.content
        
        if not ai_response:
            raise ValueError("OpenAI returned an empty response.")
        
        return jsonify({"response": ai_response})
    except Exception as e:
        app.logger.error(f"Error in chat: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/save_note', methods=['POST'])
@login_required
def save_note():
    note_content = request.json['note']
    new_note = Note(content=note_content, user_id=current_user.id)
    db.session.add(new_note)
    db.session.commit()
    return jsonify({"success": True, "notes": [note.content for note in current_user.notes]})

@app.route('/get_notes', methods=['GET'])
@login_required
def get_notes():
    return jsonify({"notes": [note.content for note in current_user.notes]})

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
