let selectedImage = null;
let imageBase64 = null;
let imageMimeType = null;
let currentAnswerText = ""; // Store the current answer text
let handwritingSampleBase64 = null;
let handwritingSampleMimeType = null;
let isGeneratingHandwriting = false; // Flag to prevent multiple simultaneous requests

const imageInput = document.getElementById("imageInput");
const imagePreview = document.getElementById("imagePreview");
const pdfPreview = document.getElementById("pdfPreview");
const pdfFileName = document.getElementById("pdfFileName");
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

// Handwriting feature elements
const handwritingButtonContainer = document.getElementById("handwritingButtonContainer");
const generateHandwritingBtn = document.getElementById("generateHandwritingBtn");
const handwritingModal = document.getElementById("handwritingModal");
const closeHandwritingModal = document.getElementById("closeHandwritingModal");
const handwritingSampleInput = document.getElementById("handwritingSampleInput");
const handwritingPreview = document.getElementById("handwritingPreview");
const handwritingPreviewContainer = document.getElementById("handwritingPreviewContainer");
const handwritingUploadPrompt = document.getElementById("handwritingUploadPrompt");
const generateHandwritingImageBtn = document.getElementById("generateHandwritingImageBtn");
const generateHandwritingText = document.getElementById("generateHandwritingText");
const generatedImageContainer = document.getElementById("generatedImageContainer");
const generatedImage = document.getElementById("generatedImage");
const downloadImageLink = document.getElementById("downloadImageLink");

// Handle image upload
imageInput.addEventListener("change", handleImageUpload);

function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Validate file type
  const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
  if (!validTypes.includes(file.type)) {
    showError("Invalid file type. Please upload a JPG, PNG, GIF, WEBP image or PDF document.");
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
    if (file.type === "application/pdf") {
      imagePreview.classList.add("hidden");
      pdfPreview.classList.remove("hidden");
      pdfFileName.textContent = file.name;
    } else {
      pdfPreview.classList.add("hidden");
      imagePreview.classList.remove("hidden");
      imagePreview.src = e.target.result;
    }
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
        data: imageBase64,
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
                // Update display with markdown and math protection
                updateResults(fullResponse);
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
    
    // Store the answer text and show handwriting button
    currentAnswerText = fullResponse;
    handwritingButtonContainer.classList.remove("hidden");
  } catch (error) {
    loadingState.classList.add("hidden");
    showError(error.message || "An error occurred while analyzing the image.");
  } finally {
    analyzeBtn.disabled = false;
    analyzeText.textContent = "🔍 Analyze & Solve Questions";
  }
}

function updateResults(text) {
  // 1. Protect math blocks with alphanumeric placeholders to prevent markdown parsing issues
  const mathBlocks = [];
  const protectedText = text.replace(/\$\$([\s\S]+?)\$\$|\$((?:\\.|[^$\\])*)\$/g, (match) => {
    mathBlocks.push(match);
    return "MATHBLOCK" + (mathBlocks.length - 1) + "PH";
  });

  // 2. Parse Markdown
  let html = marked.parse(protectedText);

  // 3. Restore math blocks
  html = html.replace(/MATHBLOCK(\d+)PH/g, (match, index) => {
    return mathBlocks[parseInt(index)];
  });

  // 4. Update DOM
  resultsContent.innerHTML = html;

  // 5. Render Math with KaTeX
  if (window.renderMathInElement && window.katex) {
    try {
      renderMathInElement(resultsContent, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\(", right: "\\)", display: false },
          { left: "\\[", right: "\\]", display: true },
        ],
        throwOnError: false,
      });
    } catch (e) {
      console.error("KaTeX rendering error:", e);
    }
  }
}

function showError(message) {
  // Check if message contains HTML (like <br> tags)
  if (message.includes("<br>") || message.includes("<")) {
    errorMessage.innerHTML = message;
  } else {
    errorMessage.textContent = message;
  }
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

// Handwriting feature handlers
generateHandwritingBtn.addEventListener("click", () => {
  handwritingModal.classList.remove("hidden");
  generatedImageContainer.classList.add("hidden");
  handwritingSampleInput.value = "";
  handwritingPreviewContainer.classList.add("hidden");
  handwritingUploadPrompt.classList.remove("hidden");
  generateHandwritingImageBtn.disabled = true;
  handwritingSampleBase64 = null;
});

closeHandwritingModal.addEventListener("click", () => {
  handwritingModal.classList.add("hidden");
});

// Close modal when clicking outside
handwritingModal.addEventListener("click", (e) => {
  if (e.target === handwritingModal) {
    handwritingModal.classList.add("hidden");
  }
});

// Close modal with Escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !handwritingModal.classList.contains("hidden")) {
    handwritingModal.classList.add("hidden");
  }
});

// Handle handwriting sample upload
handwritingSampleInput.addEventListener("change", handleHandwritingSampleUpload);

function handleHandwritingSampleUpload(event) {
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

  handwritingSampleMimeType = file.type;

  // Show preview
  const reader = new FileReader();
  reader.onload = (e) => {
    handwritingPreview.src = e.target.result;
    handwritingUploadPrompt.classList.add("hidden");
    handwritingPreviewContainer.classList.remove("hidden");
    generateHandwritingImageBtn.disabled = false;
    hideError();
  };
  reader.readAsDataURL(file);

  // Convert to base64 for API
  const base64Reader = new FileReader();
  base64Reader.onload = (e) => {
    // Remove data URL prefix
    handwritingSampleBase64 = e.target.result.split(",")[1];
  };
  base64Reader.readAsDataURL(file);
}

// Handle generate handwritten image button
generateHandwritingImageBtn.addEventListener("click", generateHandwrittenImage);

async function generateHandwrittenImage() {
  // Prevent multiple simultaneous requests
  if (isGeneratingHandwriting) {
    return;
  }

  if (!handwritingSampleBase64 || !currentAnswerText) {
    showError("Please upload a handwriting sample first.");
    return;
  }

  // Set flag to prevent duplicate requests
  isGeneratingHandwriting = true;

  // Show loading state
  generateHandwritingImageBtn.disabled = true;
  generateHandwritingText.textContent = "⏳ Generating...";
  generatedImageContainer.classList.add("hidden");
  hideError();

  try {
    const response = await fetch("/api/generate-handwriting", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        answerText: currentAnswerText,
        handwritingSample: handwritingSampleBase64,
        handwritingMimeType: handwritingSampleMimeType,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to generate handwritten image");
    }

    const data = await response.json();

    if (data.success && data.image) {
      // Display the generated image
      generatedImage.src = `data:${data.mimeType};base64,${data.image}`;
      downloadImageLink.href = `data:${data.mimeType};base64,${data.image}`;
      generatedImageContainer.classList.remove("hidden");
    } else {
      throw new Error("Failed to generate handwritten image");
    }
    } catch (error) {
      let errorMessage = error.message || "An error occurred while generating the handwritten image.";
      
      // If error message contains newlines, preserve them
      if (errorMessage.includes("\n")) {
        errorMessage = errorMessage.replace(/\n/g, "<br>");
      }
      
      showError(errorMessage);
    } finally {
      // Reset flag and button state
      isGeneratingHandwriting = false;
      generateHandwritingImageBtn.disabled = false;
      generateHandwritingText.textContent = "🎨 Generate Handwritten Image";
    }
  }
