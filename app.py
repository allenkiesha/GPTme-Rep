from flask import Flask, render_template, request, jsonify, redirect, url_for, flash
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'your-secret-key')
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///chat.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(120), nullable=False)
    notes = db.relationship('Note', backref='author', lazy=True)

class Note(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.Text, nullable=False)
    category = db.Column(db.String(50), nullable=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    order = db.Column(db.Integer, nullable=False, default=0)

class Article(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

@app.route('/')
def index():
    if current_user.is_authenticated:
        return redirect(url_for('chat'))
    return render_template('index.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        
        user = User.query.filter_by(username=username).first()
        if user:
            flash('Username already exists')
            return redirect(url_for('register'))
        
        new_user = User(username=username, password_hash=generate_password_hash(password))
        db.session.add(new_user)
        db.session.commit()
        
        flash('Registration successful')
        return redirect(url_for('login'))
    
    return render_template('register.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        
        user = User.query.filter_by(username=username).first()
        if user and check_password_hash(user.password_hash, password):
            login_user(user)
            return redirect(url_for('chat'))
        else:
            flash('Invalid username or password')
    
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('index'))

@app.route('/chat')
@login_required
def chat():
    return render_template('chat.html')

@app.route('/save_note', methods=['POST'])
@login_required
def save_note():
    note_content = request.json['note']
    category = request.json.get('category', 'Uncategorized')
    max_order = db.session.query(db.func.max(Note.order)).filter(Note.user_id == current_user.id).scalar() or 0
    new_note = Note(content=note_content, category=category, user_id=current_user.id, order=max_order + 1)
    db.session.add(new_note)
    db.session.commit()
    return jsonify({"success": True, "notes": [{"id": note.id, "content": note.content, "category": note.category, "order": note.order} for note in current_user.notes]})

@app.route('/get_notes', methods=['GET'])
@login_required
def get_notes():
    notes = Note.query.filter_by(user_id=current_user.id).order_by(Note.order).all()
    return jsonify({"notes": [{"id": note.id, "content": note.content, "category": note.category, "order": note.order} for note in notes]})

@app.route('/delete_note/<int:note_id>', methods=['DELETE'])
@login_required
def delete_note(note_id):
    note = Note.query.get_or_404(note_id)
    if note.user_id != current_user.id:
        return jsonify({"success": False, "message": "Unauthorized"}), 403
    db.session.delete(note)
    db.session.commit()
    return jsonify({"success": True})

@app.route('/update_notes_order', methods=['POST'])
@login_required
def update_notes_order():
    new_order = request.json['notes']
    for index, note_id in enumerate(new_order):
        note = Note.query.get(note_id)
        if note and note.user_id == current_user.id:
            note.order = index
    db.session.commit()
    return jsonify({"success": True})

@app.route('/generate_article', methods=['POST'])
@login_required
def generate_article():
    note_ids = request.json['note_ids']
    notes = Note.query.filter(Note.id.in_(note_ids), Note.user_id == current_user.id).all()
    
    if not notes:
        return jsonify({"success": False, "message": "No valid notes found"})
    
    # Here you would typically use an AI model to generate the article
    # For now, we'll just concatenate the notes
    article_content = "\n\n".join([note.content for note in notes])
    article_title = f"Generated Article {len(Article.query.filter_by(user_id=current_user.id).all()) + 1}"
    
    new_article = Article(title=article_title, content=article_content, user_id=current_user.id)
    db.session.add(new_article)
    db.session.commit()
    
    return jsonify({
        "success": True,
        "article": {
            "id": new_article.id,
            "title": new_article.title,
            "content": new_article.content
        }
    })

@app.route('/get_articles', methods=['GET'])
@login_required
def get_articles():
    articles = Article.query.filter_by(user_id=current_user.id).all()
    return jsonify({
        "articles": [
            {
                "id": article.id,
                "title": article.title,
                "content": article.content
            } for article in articles
        ]
    })

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(host='0.0.0.0', port=5000, debug=True)
