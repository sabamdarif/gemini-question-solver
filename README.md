# 🤖 Gemini Question Solver

A Flask web application that uses Google's Gemini AI to automatically solve questions from uploaded images or PDF documents.

## Prerequisites

- Python 3
- Google Gemini API key

## Installation

1. Clone the repository:
```bash
git clone https://github.com/sabamdarif/gemini-question-solver.git
cd gemini-question-solver
```

2. Install dependencies:
```bash
pip3 install -r requirements.txt
```

3. Create a `.env` file in the root directory:
```
GEMINI_API_KEY=your_api_key_here
```

Get your API key from [Google AI Studio](https://aistudio.google.com/app/apikey).

## Usage

1. Start the Flask server:
```bash
python app.py
```

#### Or, In Linux
```bash
./run
```

2. Open your browser and navigate to:
```
http://localhost:5000
```

3. Select a Gemini model from the dropdown
4. Upload an image or PDF containing questions
5. Click "Analyze & Solve Questions"
6. View the AI-generated solutions

## Available Models

- Gemini 2.5 Flash (default)
- Gemini 2.5 Pro
- Gemini 2.5 Flash Preview
- Gemini 2.5 Flash-Lite
- Gemini 2.0 Flash
- Gemini 2.0 Flash Lite