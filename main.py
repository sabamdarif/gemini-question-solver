import json
import os

import requests
from dotenv import load_dotenv
from flask import Flask, Response, jsonify, render_template, request

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)

# Get API key from environment
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/analyze", methods=["POST"])
def analyze():
    if not GEMINI_API_KEY:
        return jsonify(
            {
                "error": "API key not configured. Please add GEMINI_API_KEY to your .env file."
            }
        ), 500

    try:
        data = request.get_json()
        image_base64 = data.get("image")
        mime_type = data.get("mimeType")
        model = data.get("model", "gemini-2.5-flash")

        if not image_base64 or not mime_type:
            return jsonify({"error": "Image data is required"}), 400

        # Prepare request to Gemini API
        gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse&key={GEMINI_API_KEY}"

        payload = {
            "contents": [
                {
                    "parts": [
                        {"inline_data": {"mime_type": mime_type, "data": image_base64}},
                        {
                            "text": "Please analyze this image and solve all the questions shown in it. Provide detailed step-by-step solutions with clear explanations."
                        },
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.7,
                "topK": 40,
                "topP": 0.95,
                "maxOutputTokens": 8192,
            },
        }

        # Stream the response from Gemini
        def generate():
            with requests.post(
                gemini_url,
                json=payload,
                stream=True,
                headers={"Content-Type": "application/json"},
            ) as response:
                if response.status_code != 200:
                    error_msg = response.text
                    try:
                        error_data = response.json()
                        error_msg = error_data.get("error", {}).get(
                            "message", error_msg
                        )
                    except:
                        pass
                    yield f"data: {json.dumps({'error': error_msg})}\n\n"
                    return

                for line in response.iter_lines():
                    if line:
                        decoded_line = line.decode("utf-8")
                        if decoded_line.startswith("data: "):
                            yield decoded_line + "\n\n"

        return Response(generate(), mimetype="text/event-stream")

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    if not GEMINI_API_KEY:
        print("⚠️  Warning: GEMINI_API_KEY not found in .env file")
        print("   Please create a .env file with your API key:")
        print("   GEMINI_API_KEY=your_api_key_here")
    app.run(debug=True, port=5000)
