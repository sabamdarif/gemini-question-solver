let selectedImage = null;
let imageBase64 = null;
let imageMimeType = null;

const imageInput = document.getElementById("imageInput");
const imagePreview = document.getElementById("imagePreview");
const imagePreviewContainer = document.getElementById("imagePreviewContainer");
const uploadPrompt = document.getElementById("uploadPrompt");
const analyzeBtn = document.getElementById("analyzeBtn");
const analyzeText = document.getElementById("analyzeText");
const resultsSection = document.getElementById("resultsSection");
const loadingState = document.getElementById("loadingState");
const resultsContent = document.getElementById("resultsContent");
const errorSection = document.getElementById("errorSection");
const errorMessage = document.getElementById("errorMessage");
const modelSelect = document.getElementById("modelSelect");

// Handle image upload
imageInput.addEventListener("change", handleImageUpload);

function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Validate file type
  const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!validTypes.includes(file.type)) {
    showError("Invalid file type. Please upload a JPG, PNG, GIF, or WEBP image.");
    return;
  }

  // Validate file size (20MB)
  if (file.size > 20 * 1024 * 1024) {
    showError("File size too large. Please upload an image smaller than 20MB.");
    return;
  }

  selectedImage = file;
  imageMimeType = file.type;

  // Show preview
  const reader = new FileReader();
  reader.onload = (e) => {
    imagePreview.src = e.target.result;
    uploadPrompt.classList.add("hidden");
    imagePreviewContainer.classList.remove("hidden");
    analyzeBtn.disabled = false;
    hideError();
  };
  reader.readAsDataURL(file);

  // Convert to base64 for API
  const base64Reader = new FileReader();
  base64Reader.onload = (e) => {
    // Remove data URL prefix
    imageBase64 = e.target.result.split(",")[1];
  };
  base64Reader.readAsDataURL(file);
}

// Handle analyze button click
analyzeBtn.addEventListener("click", analyzeImage);

async function analyzeImage() {
  if (!selectedImage || !imageBase64) {
    showError("Please upload an image first.");
    return;
  }

  // Show loading state
  resultsSection.classList.remove("hidden");
  loadingState.classList.remove("hidden");
  resultsContent.innerHTML = "";
  analyzeBtn.disabled = true;
  analyzeText.textContent = "⏳ Analyzing...";
  hideError();

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image: imageBase64,
        mimeType: imageMimeType,
        model: modelSelect.value,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "API request failed");
    }

    // Hide loading, show content area
    loadingState.classList.add("hidden");

    // Process streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const jsonStr = line.slice(6);
            const data = JSON.parse(jsonStr);

            // Check for error in stream
            if (data.error) {
              throw new Error(data.error);
            }

            if (data.candidates && data.candidates[0]?.content?.parts) {
              const parts = data.candidates[0].content.parts;
              if (parts[0]?.text) {
                fullResponse += parts[0].text;
                // Update display with markdown
                resultsContent.innerHTML = marked.parse(fullResponse);
              }
            }
          } catch (e) {
            if (e.message && !e.message.includes("JSON")) {
              throw e;
            }
            // Skip invalid JSON
          }
        }
      }
    }

    if (!fullResponse) {
      throw new Error("No response generated. Please try again.");
    }
  } catch (error) {
    loadingState.classList.add("hidden");
    showError(error.message || "An error occurred while analyzing the image.");
  } finally {
    analyzeBtn.disabled = false;
    analyzeText.textContent = "🔍 Analyze & Solve Questions";
  }
}

function showError(message) {
  errorMessage.textContent = message;
  errorSection.classList.remove("hidden");
  setTimeout(() => {
    errorSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, 100);
}

function hideError() {
  errorSection.classList.add("hidden");
}

// Drag and drop support
const uploadArea = document.querySelector(".upload-area");

uploadArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadArea.style.borderColor = "#3b82f6";
  uploadArea.style.backgroundColor = "#eff6ff";
});

uploadArea.addEventListener("dragleave", (e) => {
  e.preventDefault();
  uploadArea.style.borderColor = "#d1d5db";
  uploadArea.style.backgroundColor = "transparent";
});

uploadArea.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadArea.style.borderColor = "#d1d5db";
  uploadArea.style.backgroundColor = "transparent";

  const files = e.dataTransfer.files;
  if (files.length > 0) {
    imageInput.files = files;
    handleImageUpload({ target: { files: files } });
  }
});
