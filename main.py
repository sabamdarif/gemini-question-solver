import base64
import json
import os

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, render_template, request
from google import genai
from google.genai import types
from PIL import Image
import io

# Load .env file
load_dotenv()

app = Flask(__name__)

# Get API key
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

        # using generate_content method to generate response
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


@app.route("/api/generate-handwriting", methods=["POST"])
def generate_handwriting():
    if not GEMINI_API_KEY:
        return jsonify(
            {
                "error": "API key not configured. Please add GEMINI_API_KEY to your .env file."
            }
        ), 500

    try:
        data = request.get_json()
        answer_text = data.get("answerText")
        handwriting_sample_base64 = data.get("handwritingSample")
        handwriting_mime_type = data.get("handwritingMimeType", "image/jpeg")

        if not answer_text:
            return jsonify({"error": "Answer text is required"}), 400

        if not handwriting_sample_base64:
            return jsonify({"error": "Handwriting sample image is required"}), 400

        # Initialize Google Gen AI client
        client = genai.Client(api_key=GEMINI_API_KEY)

        # Decode the handwriting sample image
        handwriting_image_bytes = base64.b64decode(handwriting_sample_base64)
        
        # Create prompt for generating handwritten text
        prompt = (
            f"Convert the text from answer response to handwritten form from the sample which I given and generate an image. "
            f"Write the following text in the exact same handwriting style as shown in the sample image:\n\n{answer_text}"
        )

        # Generate handwritten image using gemini-2.5-flash-image model
        # Use only one model to avoid multiple API calls
        response = client.models.generate_content(
            model="gemini-2.5-flash-image",
            contents=[
                types.Part.from_bytes(
                    data=handwriting_image_bytes,
                    mime_type=handwriting_mime_type,
                ),
                prompt,
            ],
        )

        # Extract the generated image from response
        generated_image_base64 = None
        for part in response.parts:
            if part.inline_data is not None:
                # Convert image to base64
                image = part.as_image()
                # Convert PIL Image to base64
                buffered = io.BytesIO()
                image.save(buffered, format="PNG")
                generated_image_base64 = base64.b64encode(buffered.getvalue()).decode("utf-8")
                break
            elif part.text is not None:
                # If model returns text instead of image, return error
                return jsonify(
                    {
                        "error": "Model returned text instead of image. Please try again or use a different handwriting sample."
                    }
                ), 500

        if not generated_image_base64:
            return jsonify(
                {"error": "Failed to generate handwritten image. Please try again."}
            ), 500

        return jsonify(
            {
                "success": True,
                "image": generated_image_base64,
                "mimeType": "image/png",
            }
        )

    except Exception as e:
        error_str = str(e)
        error_message = "An error occurred while generating the handwritten image."
        
        # Parse quota/rate limit errors
        if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
            error_message = (
                "⚠️ Quota Exceeded: The free tier for image generation models has been exhausted. "
                "Image generation models have very limited quota on the free tier.\n\n"
                "Options:\n"
                "1. Wait and try again later (quota resets daily)\n"
                "2. Upgrade your Google AI Studio plan for higher quotas\n"
                "3. Check your usage at: https://ai.dev/usage?tab=rate-limit\n\n"
                "For more information: https://ai.google.dev/gemini-api/docs/rate-limits"
            )
            # Try to extract retry delay from error
            if "retry" in error_str.lower() or "Please retry in" in error_str:
                import re
                retry_match = re.search(r"retry in ([\d.]+)s", error_str, re.IGNORECASE)
                if retry_match:
                    retry_seconds = float(retry_match.group(1))
                    retry_minutes = int(retry_seconds / 60)
                    retry_secs = int(retry_seconds % 60)
                    error_message += f"\n\nPlease retry in approximately {retry_minutes}m {retry_secs}s"
        
        return jsonify({"error": error_message}), 500


if __name__ == "__main__":
    if not GEMINI_API_KEY:
        print("⚠️  Warning: GEMINI_API_KEY not found in .env file")
        print("   Please create a .env file with your API key:")
        print("   GEMINI_API_KEY=your_api_key_here")
    app.run()
