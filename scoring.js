function getAgeFromDob(dob) {
  // Parse DD/MM/YYYY format
  let birthDate;
  if (typeof dob === 'string' && dob.includes('/')) {
    const [day, month, year] = dob.split('/').map(Number);
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

const AT_RISK_THRESHOLDS = [
  { performanceAgeGroup: '18-30', minAtRiskRepCount: 11, maxAtRiskCount: 16 }, // Moderate: 11–15, High: >16
  { performanceAgeGroup: '31-50', minAtRiskRepCount: 10, maxAtRiskCount: 14 }, // Moderate: 10–13, High: >14
  { performanceAgeGroup: '51-65', minAtRiskRepCount: 8, maxAtRiskCount: 12 }, // Moderate: 8–11, High: >12
  { performanceAgeGroup: '66-75', minAtRiskRepCount: 7, maxAtRiskCount: 11 }, // Moderate: 7–11, High: >11
  { performanceAgeGroup: '76-85', minAtRiskRepCount: 6, maxAtRiskCount: 10 }, // Moderate: 6–9, High: >10
  { performanceAgeGroup: '85+', minAtRiskRepCount: 5, maxAtRiskCount: 8 }, // Moderate: 5–8, High: >9
];

const fallPerformanceCategoryContent = {
  Low: 'Below recommended level, indicating possible lower muscle weakness',
  Moderate: '“Within normal range for your age group” ',
  High: 'Above average lower-body strength and endurance for your age group',
};

const fallRiskContent = {
  'Not at risk':
    'Your fall risk is low — this means your muscle strength and balance are within a safe range.',
  'At risk':
    'Your fall risk appears high (below cut-off value for you age group) — this may indicate challenges with strength or balance during daily movements',
};

const malnutritionRiskContent = {
  Low: 'Your malnutrition risk appears low — your current nutrition seems sufficient to support daily activities.',
  Moderate:
    'Your malnutrition risk appears moderate — this may reflect early signs of reduced food or protein intake.',
  High: 'Your malnutrition risk appears high — this may reflect early signs of reduced food or protein intake.',
};

const fallRiskRecommendations = {
  'Not at risk':
    'To maintain strength and balance, stay active and include good sources of protein. Danone’s specialized nutrition products can help support muscle health. Retake the full test in 3 weeks to track your progress.',
  'At risk':
    'To support your strength and stability, try simple leg‑strengthening activities and increase your protein intake. Danone’s protein‑rich specialized nutrition options can help. Retake the full test in 3 weeks to monitor changes.',
};

const malnutritionRiskRecommendations = {
  Low: 'Maintain balanced meals with protein throughout the day. Danone’s specialized nutrition range can help you keep supporting muscle health. Retake the test in 3 weeks to stay on track.',
  Moderate:
    'Try adding more protein to your meals to support energy and muscle function. Danone’s protein‑enriched nutrition products can help fill gaps. Retake the full test in 3 weeks.',
  High: 'Your body may benefit from more protein and energy. Danone’s high‑protein specialized nutrition options can help support your daily needs. Consider retaking the full test in 3 weeks to check progress',
};

async function callStsApi(profileData, malnutritionForm, sitStandSummary) {
  if (!profileData || !malnutritionForm || !sitStandSummary) {
    throw new Error('Missing required data for API call');
  }
  // Ensure array format for multi-select fields
  function toArray(val) {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string' && val !== '') return [val];
    return [];
  }
  try {
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
      product_frequency: malnutritionForm.productFrequency,
      analysis_data: null, //TODO: add sit-stand detailed analysis data
      additional_data: {
        test: true,
        description: 'Payload from sit stand demo',
      },
    };
    const response = await fetch(
      `https://dan-dh-api-eu-uat.hive.digital4danone.com/adults/sit-to-stand-tracker/v1`,
      {
        method: 'POST',
        headers: {
          dapm_key: 'DH-Tech-API-Test',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );
    // Check if HTTP response is not OK
    if (!response.ok) {
      let errorMessage = `API request failed with status ${response.status}`;
      const errorData = await response.json();
      errorMessage += `: ${errorData.message || JSON.stringify(errorData)}`;
      throw new Error(errorMessage);
    }
    const res = await response.json();
    return res;
  } catch (error) {
    console.error('Error calling STS API:', error);
    throw error;
  }
}
