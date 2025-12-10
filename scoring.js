function getMalnutritionRiskScore() {
  const payload = localStorage.getItem('malnutritionForm');
  const parsedPayload = payload ? JSON.parse(payload) : null;
  if (!parsedPayload) {
    throw new Error('Malnutrition form data not found in localStorage');
  }
  let score = 0;
  switch (parsedPayload.weightLoss) {
    case 'no':
      score += 0;
      break;
    case '1-5':
      score += 1;
      break;
    case '6-10':
      score += 2;
      break;
    case '11-15':
      score += 3;
      break;
    case '15plus':
      score += 4;
      break;
    default:
      score += 0;
  }
  switch (parsedPayload.appetite) {
    case 'yes':
      score += 1;
      break;
    case 'no':
      score += 0;
      break;
    case 'unsure':
      score += 2;
      break;
    default:
      score += 0;
  }
  let category = '';
  if (score <= 1) {
    category = 'Low';
  } else if (score === 2) {
    category = 'Moderate';
  } else if (score >= 3) {
    category = 'High';
  }
  return { score, category };
}

function getAgeFromDob(dob) {
  const birthDate = new Date(dob);
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
    if (reps > 16) return 'High';
    if (reps >= 11 && reps <= 15) return 'Moderate';
    if (reps < 13) return 'Low';
  } else if (age >= 31 && age <= 50) {
    if (reps > 14) return 'High';
    if (reps >= 10 && reps <= 13) return 'Moderate';
    if (reps < 10) return 'Low';
  } else if (age >= 51 && age <= 65) {
    if (reps > 12) return 'High';
    // Moderate category not specified, so skip
    if (reps < 8) return 'Low';
  } else if (age >= 66 && age <= 75) {
    if (reps > 11) return 'High';
    if (reps >= 7 && reps <= 11) return 'Moderate';
    if (reps < 7) return 'Low';
  } else if (age >= 76 && age <= 85) {
    if (reps > 10) return 'High';
    if (reps >= 6 && reps <= 9) return 'Moderate';
    if (reps < 6) return 'Low';
  } else if (age > 85) {
    if (reps > 9) return 'High';
    if (reps >= 5 && reps <= 8) return 'Moderate';
    if (reps < 5) return 'Low';
  }
  return 'Unknown';
}

function getFallRiskScore() {
  const profileData = localStorage.getItem('profile-data');
  const parsedProfileData = profileData ? JSON.parse(profileData) : null;
  if (!parsedProfileData) {
    throw new Error('Profile data not found in localStorage');
  }
  const dob = parsedProfileData.dob;
  const age = getAgeFromDob(dob);

  const sitStandSummary = localStorage.getItem('sit-stand-summary');
  const parsedSitStandSummary = sitStandSummary
    ? JSON.parse(sitStandSummary)
    : null;
  if (!parsedSitStandSummary) {
    throw new Error('Sit-stand summary data not found in localStorage');
  }
  const reps = parsedSitStandSummary.reps;
  const performanceCategory = getSitStandPerformanceCategory(age, reps);
  return performanceCategory;
}
