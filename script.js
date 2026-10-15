
const API_URL = "https://sarpa-ai-snakesafety.onrender.com/predict";

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
  if (this.files.length) {
    handleImage(this.files[0]);
  }
});

galleryInput.addEventListener("change", function () {
  if (this.files.length) {
    handleImage(this.files[0]);
  }
});

function handleImage(file) {
  if (!file.type.startsWith("image/")) {
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

  reader.readAsDataURL(file);
  result.classList.add("hidden");
}

function clearPhoto() {
  selectedFile = null;
  cameraInput.value = "";
  galleryInput.value = "";
  preview.src = "";
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

  if (event.dataTransfer.files.length) {
    handleImage(event.dataTransfer.files[0]);
  }
});

// Real AI analysis using your Render backend
async function analyzeSnake() {
  if (!selectedFile) {
    alert("Please take a photo or select a photo first.");
    return;
  }

  analyzeButton.disabled = true;
  analyzeButton.textContent = "🤖 Analyzing...";

  result.classList.remove("hidden");
  result.textContent =
    "Analyzing your image. Please wait...";

  try {
    const formData = new FormData();
    formData.append("file", selectedFile);

    const response = await fetch(API_URL, {
      method: "POST",
      body: formData
    });

    const rawResponse = await response.text();

    let data;

    try {
      data = JSON.parse(rawResponse);
    } catch {
      throw new Error(
        "The server returned an invalid response. Please try again."
      );
    }

    if (!response.ok) {
      const detail =
        typeof data.detail === "string"
          ? data.detail
          : typeof data.error === "string"
            ? data.error
            : JSON.stringify(data);

      throw new Error(
        "Server error (" + response.status + "): " + detail
      );
    }

    // Display the actual response returned by the backend.
    result.textContent =
      "AI Analysis Result\n\n" +
      JSON.stringify(data, null, 2) +
      "\n\nSafety: Keep away from the snake. " +
      "AI identification may be incorrect.";

  } catch (error) {
    console.error("Snake analysis error:", error);

    result.textContent =
      "Analysis failed.\n\n" +
      error.message +
      "\n\nCheck your internet connection and backend configuration. " +
      "If the problem continues, share this error.";

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
  document.getElementById(id)?.scrollIntoView({
    behavior: "smooth"
  });
}

function findHospitals() {
  const status = document.getElementById("locationStatus");
  const results = document.getElementById("hospitalResults");
  const link = document.getElementById("mapsLink");

  status.textContent = "Requesting your location...";

  if (!navigator.geolocation) {
    status.textContent = "Location is not supported by this browser.";
    return;
  }

  navigator.geolocation.getCurrentPosition(
    function (position) {
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;

      status.textContent = "Location detected successfully.";

      link.href =
        `https://www.google.com/maps/search/hospital/@${latitude},${longitude},14z`;

      results.classList.remove("hidden");
    },
    function () {
      status.textContent =
        "Location permission denied. Enable location access or search for a hospital manually.";
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
    const description = document.querySelector(".hero p");

    if (heading) {
      heading.innerHTML = hindi
        ? 'साँप पहचानें। <span>जान बचाएँ।</span> प्रकृति बचाएँ।'
        : 'Identify Snakes. <span>Save Lives.</span> Protect Nature.';
    }

    if (description) {
      description.textContent = hindi
        ? "AI की मदद से साँप की पहचान, साँप के काटने पर प्राथमिक सहायता और आपातकालीन सहायता।"
        : "AI-powered snake identification, snakebite first-aid guidance and emergency assistance for communities across India.";
    }
  });
}
