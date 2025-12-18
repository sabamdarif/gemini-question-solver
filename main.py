import json
import os

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, render_template, request
from google import genai
from google.genai import types

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
        file_base64 = data.get("data") or data.get("image")
        mime_type = data.get("mimeType")
        model = data.get("model", "gemini-2.5-flash")

        if not file_base64 or not mime_type:
            return jsonify({"error": "File data is required"}), 400

        # Initialize Google Gen AI client
        client = genai.Client(api_key=GEMINI_API_KEY)

        # using generate_content method to generate response with a custom prompt
        response = client.models.generate_content(
            model=model,
            contents=[
                types.Content(
                    parts=[
                        types.Part(
                            inline_data=types.Blob(
                                mime_type=mime_type, data=file_base64
                            )
                        ),
                        types.Part(
                            text="Please analyze this document/image and solve all the questions shown in it. Provide detailed step-by-step solutions with clear explanations, but if the step is so easy that a little child can understand then jump that step."
                        ),
                    ]
                )
            ],
        )

        # Stream the response (simulated for compatibility)
        def generate():
            # extraction of text from response
            text_result = response.text

            # The frontend expects a JSON structure in the 'data:' field
            # We mock the structure: data.candidates[0].content.parts[0].text
            fake_response = {
                "candidates": [{"content": {"parts": [{"text": text_result}]}}]
            }
            yield f"data: {json.dumps(fake_response)}\n\n"

        return Response(generate(), mimetype="text/event-stream")

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    if not GEMINI_API_KEY:
        print("⚠️  Warning: GEMINI_API_KEY not found in .env file")
        print("   Please create a .env file with your API key:")
        print("   GEMINI_API_KEY=your_api_key_here")
    app.run(debug=True, port=5000)
