function getMalnutritionRiskScore() {
  const payload = localStorage.getItem("malnutritionForm");
  const parsedPayload = payload ? JSON.parse(payload) : null;
  if (!parsedPayload) {
    throw new Error("Malnutrition form data not found in localStorage");
  }
  let score = 0;
  switch (parsedPayload.weightLoss) {
    case "no":
      score += 0;
      break;
    case "1-5":
      score += 1;
      break;
    case "6-10":
      score += 2;
      break;
    case "11-15":
      score += 3;
      break;
    case "15plus":
      score += 4;
      break;
    default:
      score += 0;
  }
  switch (parsedPayload.appetite) {
    case "yes":
      score += 1;
      break;
    case "no":
      score += 0;
      break;
    case "unsure":
      score += 2;
      break;
    default:
      score += 0;
  }
  let category = "";
  if (score <= 1) {
    category = "Low";
  } else if (score === 2) {
    category = "Moderate";
  } else if (score >= 3) {
    category = "High";
  }
  return { score, category };
}

function getAgeFromDob(dob) {
  // Parse DD/MM/YYYY format
  let birthDate;
  if (typeof dob === "string" && dob.includes("/")) {
    const [day, month, year] = dob.split("/").map(Number);
    birthDate = new Date(year, month - 1, day);
  } else {
    birthDate = new Date(dob);
  }
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

function getSitStandPerformanceCategory(age, reps) {
  if (age >= 18 && age <= 30) {
    if (reps > 16) return "High";
    if (reps >= 11 && reps <= 15) return "Moderate";
    if (reps < 13) return "Low";
  } else if (age >= 31 && age <= 50) {
    if (reps > 14) return "High";
    if (reps >= 10 && reps <= 13) return "Moderate";
    if (reps < 10) return "Low";
  } else if (age >= 51 && age <= 65) {
    if (reps > 12) return "High";
    // Moderate category not specified, so skip
    if (reps < 8) return "Low";
  } else if (age >= 66 && age <= 75) {
    if (reps > 11) return "High";
    if (reps >= 7 && reps <= 11) return "Moderate";
    if (reps < 7) return "Low";
  } else if (age >= 76 && age <= 85) {
    if (reps > 10) return "High";
    if (reps >= 6 && reps <= 9) return "Moderate";
    if (reps < 6) return "Low";
  } else if (age > 85) {
    if (reps > 9) return "High";
    if (reps >= 5 && reps <= 8) return "Moderate";
    if (reps < 5) return "Low";
  }
  return "Unknown";
}

function getFallRiskScore() {
  const profileData = localStorage.getItem("profile-data");
  const parsedProfileData = profileData ? JSON.parse(profileData) : null;
  if (!parsedProfileData) {
    throw new Error("Profile data not found in localStorage");
  }
  const dob = parsedProfileData.dob;
  const age = getAgeFromDob(dob);

  const sitStandSummary = localStorage.getItem("sit-stand-summary");
  const parsedSitStandSummary = sitStandSummary
    ? JSON.parse(sitStandSummary)
    : null;
  if (!parsedSitStandSummary) {
    throw new Error("Sit-stand summary data not found in localStorage");
  }
  const reps = parsedSitStandSummary.reps;
  const performanceCategory = getSitStandPerformanceCategory(age, reps);
  return { reps, performanceCategory };
}

const fallRiskContent = {
  low: "Your fall risk is low — this means your muscle strength and balance are within a safe range.",
  moderate: "[To insert]",
  high: "Your fall risk appears high (below cut-off value for you age group) — this may indicate challenges with strength or balance during daily movements"
};

const malnutritionContent = {
  low: "Your malnutrition risk appears low — your current nutrition seems sufficient to support daily activities.",
  moderate:
    "Your malnutrition risk appears moderate — this may reflect early signs of reduced food or protein intake.",
  high: "Your malnutrition risk appears moderate — this may reflect early signs of reduced food or protein intake."
};

async function callStsApi(profileData, malnutritionForm, sitStandSummary) {
  if (!profileData || !malnutritionForm || !sitStandSummary) {
    throw new Error("Missing required data for API call");
  }
  // Ensure array format for multi-select fields
  function toArray(val) {
    if (Array.isArray(val)) return val;
    if (typeof val === "string" && val !== "") return [val];
    return [];
  }

  const payload = {
    // Compulsory fields
    consent: profileData.consent,
    age: getAgeFromDob(profileData.dob),
    reps: sitStandSummary.reps,
    full_rep_counter: sitStandSummary.fullrepcounter,
    partial_rep_counter: sitStandSummary.partialRepcounter,
    malnutrition_weight_loss: malnutritionForm.weightLoss,
    malnutrition_poor_appetite: malnutritionForm.appetite,
    // Optional fields
    gender: profileData.gender,
    height_cm: profileData.height,
    weight_kg: profileData.weight,
    medical_conditions: toArray(malnutritionForm.diseases),
    recent_medical_history: toArray(malnutritionForm.changes),
    product_in_use: toArray(malnutritionForm.danoneProducts),
    //TODO: add product frequency,
    // analysis_data: null, //TODO: add sit-stand detailed analysis data
    additional_data: {
      test: true,
      description: "Payload from sit stand demo"
    }
  };
  const response = await fetch(
    `https://dan-dh-api-eu-uat.hive.digital4danone.com/adults/sit-to-stand-tracker/v1`,
    {
      method: "POST",
      headers: {
        dapm_key: "DH-Tech-API-Test",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );
  const res = await response.json();
  return res;
}
