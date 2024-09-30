import os
from flask import Flask, render_template, request, jsonify
from openai import OpenAI

app = Flask(__name__)

# Initialize OpenAI client
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
openai_client = OpenAI(api_key=OPENAI_API_KEY)

# In-memory storage for notes
notes = []

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/chat', methods=['POST'])
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
        return jsonify({"error": str(e)}), 500

@app.route('/save_note', methods=['POST'])
def save_note():
    note = request.json['note']
    notes.append(note)
    return jsonify({"success": True, "notes": notes})

@app.route('/get_notes', methods=['GET'])
def get_notes():
    return jsonify({"notes": notes})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
