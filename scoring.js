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
      `https://dan-dh-api-eu.hive.digital4danone.com/adults/sit-to-stand-tracker/v1`,
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
