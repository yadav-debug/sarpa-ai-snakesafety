
"use strict";

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
const statusMessage = document.getElementById("statusMessage");

let selectedFile = null;

function openCamera() {
    cameraInput.click();
}

function openGallery() {
    galleryInput.click();
}

cameraInput.addEventListener("change", function () {
    if (this.files && this.files.length > 0) {
        handleImage(this.files[0]);
    }
});

galleryInput.addEventListener("change", function () {
    if (this.files && this.files.length > 0) {
        handleImage(this.files[0]);
    }
});

function handleImage(file) {
    const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif"
    ];

    if (!allowedTypes.includes(file.type)) {
        alert("Please select a JPG, PNG, WEBP, or GIF image.");
        return;
    }

    if (file.size > 8 * 1024 * 1024) {
        alert("Image is too large. Please select an image under 8 MB.");
        return;
    }

    selectedFile = file;

    const reader = new FileReader();

    reader.onload = function (event) {
        preview.src = event.target.result;
        preview.style.display = "block";
        placeholder.classList.add("hidden");
        photoInfo.classList.remove("hidden");
        photoName.textContent = file.name;

        result.classList.add("hidden");
        statusMessage.textContent = "Image selected. Ready for analysis.";
    };

    reader.onerror = function () {
        alert("Could not read this image. Please select another one.");
    };

    reader.readAsDataURL(file);
}

function clearPhoto() {
    selectedFile = null;

    cameraInput.value = "";
    galleryInput.value = "";
    preview.removeAttribute("src");
    preview.style.display = "none";

    placeholder.classList.remove("hidden");
    photoInfo.classList.add("hidden");
    result.classList.add("hidden");

    statusMessage.textContent = "Photo removed.";
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

    const file = event.dataTransfer.files[0];

    if (file) {
        handleImage(file);
    }
});

async function analyzeSnake() {
    if (!selectedFile) {
        alert("Please take a photo or select a photo first.");
        return;
    }

    const originalText = analyzeButton.textContent;

    analyzeButton.disabled = true;
    analyzeButton.textContent = "🤖 Analyzing...";
    statusMessage.textContent = "Uploading image and requesting AI analysis...";

    try {
        const formData = new FormData();

        // Must match the FastAPI parameter: file: UploadFile = File(...)
        formData.append("file", selectedFile);

        const response = await fetch(API_URL, {
            method: "POST",
            body: formData
        });

        let data;

        try {
            data = await response.json();
        } catch {
            throw new Error("The server returned an unreadable response.");
        }

        if (!response.ok) {
            throw new Error(
                data.detail || `Request failed with status ${response.status}.`
            );
        }

        displayResult(data);
        statusMessage.textContent = "Analysis finished. Treat the result cautiously.";

    } catch (error) {
        console.error("Snake analysis error:", error);

        statusMessage.textContent = "Analysis failed.";

        if (error instanceof TypeError) {
            alert(
                "Could not connect to the API. Check your internet connection, " +
                "the Render service status, and the backend CORS settings."
            );
        } else {
            alert("Could not analyze the image: " + error.message);
        }
    } finally {
        analyzeButton.disabled = false;
        analyzeButton.textContent = originalText;
    }
}

function displayResult(data) {
    const snakeVisible = data.snake_visible === true;

    document.getElementById("snakeName").textContent =
        snakeVisible && data.suggested_identification
            ? data.suggested_identification
            : "No clear snake detected";

    document.getElementById("confidence").textContent =
        data.confidence || "low";

    document.getElementById("snakeVisible").textContent =
        snakeVisible ? "Possibly visible" : "Not clearly visible";

    document.getElementById("classification").textContent =
        data.venom_risk || "not established";

    let riskLabel = "UNKNOWN RISK";

    if (data.venom_risk === "potentially venomous") {
        riskLabel = "POTENTIAL RISK";
    } else if (data.venom_risk === "snake not clearly visible") {
        riskLabel = "NOT IDENTIFIED";
    }

    document.getElementById("dangerLevel").textContent = riskLabel;

    // The backend does not verify a scientific name, so do not invent one.
    document.getElementById("scientificName").textContent = "Not verified";

    document.getElementById("analysisMessage").textContent =
        data.explanation || "The image could not be identified reliably.";

    document.getElementById("safetyAdvice").textContent =
        data.safety_advice ||
        "Keep away from the snake and contact a trained wildlife rescuer.";

    const warning = document.querySelector(".warning");

    if (warning && data.disclaimer) {
        warning.textContent = data.disclaimer;
    }

    document.getElementById("rawResult").textContent =
        JSON.stringify(data, null, 2);

    result.classList.remove("hidden");
    result.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
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
    const link = document.getElementById("mapsLink");

    if (!navigator.geolocation) {
        status.textContent =
            "Location is not supported by this browser. Open Google Maps and search for nearby hospitals.";
        link.href = "https://www.google.com/maps/search/hospitals+near+me/";
        link.classList.remove("hidden");
        return;
    }

    status.textContent = "Requesting location permission...";

    navigator.geolocation.getCurrentPosition(
        function (position) {
            const latitude = position.coords.latitude;
            const longitude = position.coords.longitude;

            link.href =
                "https://www.google.com/maps/search/hospitals/@" +
                latitude + "," + longitude + ",14z";

            link.classList.remove("hidden");
            status.textContent =
                "Location found. Open the map and choose an appropriate hospital.";
        },
        function () {
            status.textContent =
                "Location permission was denied. You can still search for hospitals on Google Maps.";

            link.href = "https://www.google.com/maps/search/hospitals+near+me/";
            link.classList.remove("hidden");
        },
        {
            enableHighAccuracy: false,
            timeout: 10000,
            maximumAge: 60000
        }
    );
}

document.getElementById("language").addEventListener("change", function (event) {
    const isHindi = event.target.value === "hi";

    document.querySelector(".hero h1").innerHTML = isHindi
        ? 'साँप पहचानें।<br><span>जान बचाएँ।</span><br>प्रकृति बचाएँ।'
        : 'Identify Snakes.<br><span>Save Lives.</span><br>Protect Nature.';

    document.querySelector(".hero-content > p").textContent = isHindi
        ? "AI की मदद से साँप की फोटो का सावधानीपूर्वक विश्लेषण और सुरक्षा संबंधी जानकारी प्राप्त करें।"
        : "Educational snake photo analysis, safety guidance, and emergency resources for communities across India.";
});
