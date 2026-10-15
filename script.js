
"use strict";

const API_URL =
  "https://sarpa-ai-snakesafety.onrender.com/predict";

const cameraInput = document.getElementById("cameraInput");
const galleryInput = document.getElementById("galleryInput");
const preview = document.getElementById("preview");
const placeholder = document.getElementById("previewPlaceholder");
const photoInfo = document.getElementById("photoInfo");
const photoName = document.getElementById("photoName");
const uploadArea = document.getElementById("uploadArea");
const result = document.getElementById("result");
const analyzeButton = document.getElementById("analyzeButton");

let selectedFile = null;

function openCamera() {
  cameraInput.click();
}

function openGallery() {
  galleryInput.click();
}

cameraInput.addEventListener("change", function () {
  if (this.files && this.files.length) {
    handleImage(this.files[0]);
  }
});

galleryInput.addEventListener("change", function () {
  if (this.files && this.files.length) {
    handleImage(this.files[0]);
  }
});

function handleImage(file) {
  if (!file || !file.type.startsWith("image/")) {
    alert("Please select a valid image.");
    return;
  }

  if (file.size > 15 * 1024 * 1024) {
    alert("Image is too large. Please select an image under 15 MB.");
    return;
  }

  selectedFile = file;

  const reader = new FileReader();

  reader.onload = function (event) {
    preview.src = event.target.result;
    preview.style.display = "block";
    placeholder.style.display = "none";
    photoInfo.classList.remove("hidden");
    photoName.textContent = file.name;
  };

  reader.onerror = function () {
    alert("Could not read this image. Please select it again.");
    selectedFile = null;
  };

  reader.readAsDataURL(file);
  result.classList.add("hidden");
}

function clearPhoto() {
  selectedFile = null;
  cameraInput.value = "";
  galleryInput.value = "";
  preview.removeAttribute("src");
  preview.style.display = "none";
  placeholder.style.display = "block";
  photoInfo.classList.add("hidden");
  result.classList.add("hidden");
}

uploadArea.addEventListener("dragover", function (event) {
  event.preventDefault();
  uploadArea.style.background = "#edf9e9";
});

uploadArea.addEventListener("dragleave", function () {
  uploadArea.style.background = "";
});

uploadArea.addEventListener("drop", function (event) {
  event.preventDefault();
  uploadArea.style.background = "";

  const files = event.dataTransfer.files;
  if (files && files.length) {
    handleImage(files[0]);
  }
});

function setText(id, value, fallback) {
  const element = document.getElementById(id);
  if (!element) return;

  if (value === undefined || value === null || value === "") {
    element.textContent = fallback;
  } else if (typeof value === "object") {
    element.textContent = JSON.stringify(value);
  } else {
    element.textContent = String(value);
  }
}

function firstValue(data, keys) {
  for (const key of keys) {
    const value = data && data[key];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return null;
}

function formatConfidence(value) {
  if (value === null || value === undefined || value === "") {
    return "Unavailable";
  }

  if (typeof value === "string" && value.includes("%")) {
    return value;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return String(value);
  }

  const percentage = number <= 1 ? number * 100 : number;

  if (percentage < 0 || percentage > 100) {
    return "Unavailable";
  }

  return percentage.toFixed(1) + "%";
}

function displayAnalysis(data) {
  const name = firstValue(data, [
    "species",
    "snake_name",
    "snakeName",
    "predicted_species",
    "prediction",
    "name"
  ]);

  const confidence = firstValue(data, [
    "confidence",
    "confidence_score",
    "score"
  ]);

  const classification = firstValue(data, [
    "classification",
    "venomous_status",
    "venomosity"
  ]);

  const danger = firstValue(data, [
    "danger_level",
    "dangerLevel",
    "danger"
  ]);

  const scientificName = firstValue(data, [
    "scientific_name",
    "scientificName",
    "scientific"
  ]);

  setText("snakeName", name, "Identification unavailable");
  setText("confidence", formatConfidence(confidence), "Unavailable");
  setText("classification", classification, "Unknown");
  setText("dangerLevel", danger, "Unknown");
  setText("scientificName", scientificName, "Unknown");

  const message = firstValue(data, [
    "message",
    "warning",
    "safety_advice",
    "safetyAdvice",
    "detail"
  ]);

  setText(
    "analysisMessage",
    message,
    "AI predictions can be wrong. Keep away from the snake. " +
    "Never delay medical care after a suspected bite."
  );

  const rawDetails = document.getElementById("rawResultDetails");
  const rawResult = document.getElementById("rawResult");

  if (rawDetails && rawResult) {
    rawResult.textContent = JSON.stringify(data, null, 2);
    rawDetails.classList.remove("hidden");
  }
}

async function analyzeSnake() {
  if (!selectedFile) {
    alert("Please take a photo or select a photo first.");
    return;
  }

  analyzeButton.disabled = true;
  analyzeButton.textContent = "🤖 Analyzing...";

  result.classList.remove("hidden");
  setText("snakeName", "Analysis in progress...", "");
  setText("confidence", "—", "");
  setText("classification", "Pending", "");
  setText("dangerLevel", "Pending", "");
  setText("scientificName", "Pending", "");
  setText(
    "analysisMessage",
    "Sending your image to the AI service. Please wait.",
    ""
  );

  const rawDetails = document.getElementById("rawResultDetails");
  if (rawDetails) rawDetails.classList.add("hidden");

  try {
    const formData = new FormData();

    // The backend must accept an uploaded file named "file".
    formData.append("file", selectedFile);

    const response = await fetch(API_URL, {
      method: "POST",
      body: formData
    });

    const responseText = await response.text();
    let data;

    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(
        "The server returned an unreadable response. HTTP " +
        response.status
      );
    }

    if (!response.ok) {
      const detail =
        typeof data.detail === "string"
          ? data.detail
          : typeof data.error === "string"
            ? data.error
            : JSON.stringify(data);

      throw new Error("HTTP " + response.status + ": " + detail);
    }

    if (!data || typeof data !== "object") {
      throw new Error("The server returned an unexpected result.");
    }

    displayAnalysis(data);

  } catch (error) {
    console.error("Sarpa AI analysis error:", error);

    setText("snakeName", "Analysis failed", "");
    setText("confidence", "—", "");
    setText("classification", "Unknown", "");
    setText("dangerLevel", "Unknown", "");
    setText("scientificName", "Unknown", "");

    let message = error.message || "An unknown error occurred.";

    if (error instanceof TypeError) {
      message =
        "Could not connect to the AI service. Check your internet " +
        "connection and backend CORS settings. Details: " +
        error.message;
    }

    setText(
      "analysisMessage",
      message + " If this continues, check the backend logs.",
      ""
    );

  } finally {
    analyzeButton.disabled = false;
    analyzeButton.textContent = "🤖 Analyze Snake";

    result.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }
}

function openIdentifier() {
  scrollToSection("identify");
}

function scrollToSection(id) {
  const section = document.getElementById(id);

  if (section) {
    section.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
}

function findHospitals() {
  const status = document.getElementById("locationStatus");
  const results = document.getElementById("hospitalResults");
  const link = document.getElementById("mapsLink");

  status.textContent = "Requesting your location...";

  if (!navigator.geolocation) {
    status.textContent =
      "Location is not supported by this browser.";
    return;
  }

  navigator.geolocation.getCurrentPosition(
    function (position) {
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;

      status.textContent = "Location detected successfully.";

      link.href =
        "https://www.google.com/maps/search/hospital/@" +
        latitude + "," + longitude + ",14z";

      results.classList.remove("hidden");
    },
    function () {
      status.textContent =
        "Location permission denied. Allow location access " +
        "or search for a hospital manually.";
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    }
  );
}

const languageSelect = document.getElementById("language");

if (languageSelect) {
  languageSelect.addEventListener("change", function (event) {
    const hindi = event.target.value === "hi";
    const heading = document.querySelector(".hero h1");
    const description = document.querySelector(".hero-content > p");

    if (heading) {
      heading.innerHTML = hindi
        ? 'साँप पहचानें। <span>जान बचाएँ।</span> प्रकृति बचाएँ।'
        : 'Identify Snakes. <span>Save Lives.</span> Protect Nature.';
    }

    if (description) {
      description.textContent = hindi
        ? "AI की मदद से साँप की पहचान, साँप के काटने पर प्राथमिक सहायता और आपातकालीन सहायता।"
        : "AI-assisted snake identification, snakebite first-aid guidance, and emergency assistance for communities across India.";
    }
  });
}
