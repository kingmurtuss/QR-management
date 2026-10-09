// Fixed customer choices are shared by the page and the server. No free text is needed.
export const experienceChoices = [
  { id: 'friendly', group: 'staff', label: 'Friendly staff', English: 'The staff were friendly.', Hindi: 'स्टाफ का व्यवहार अच्छा था।', Telugu: 'సిబ్బంది స్నేహపూర్వకంగా ఉన్నారు.' },
  { id: 'unhelpful', group: 'staff', label: 'Unhelpful staff', English: 'The staff could have been more helpful.', Hindi: 'स्टाफ से और बेहतर मदद की उम्मीद थी।', Telugu: 'సిబ్బంది మరింత సహాయం చేసి ఉంటే బాగుండేది.' },
  { id: 'quality-good', group: 'quality', label: 'Good quality', English: 'I was happy with the quality.', Hindi: 'गुणवत्ता अच्छी लगी।', Telugu: 'నాణ్యత నచ్చింది.' },
  { id: 'quality-poor', group: 'quality', label: 'Poor quality', English: 'The quality fell short of what I expected.', Hindi: 'गुणवत्ता उम्मीद से कम थी।', Telugu: 'నాణ్యత ఆశించిన స్థాయిలో లేదు.' },
  { id: 'fair-price', group: 'price', label: 'Fair prices', English: 'The prices felt fair.', Hindi: 'कीमतें उचित लगीं।', Telugu: 'ధరలు సరసంగా అనిపించాయి.' },
  { id: 'expensive', group: 'price', label: 'Too expensive', English: 'It felt too expensive for what I got.', Hindi: 'जो मिला उसके हिसाब से कीमत ज़्यादा लगी।', Telugu: 'అందిన దానితో పోలిస్తే ధర ఎక్కువగా అనిపించింది.' },
  { id: 'clean', group: 'space', label: 'Clean space', English: 'The place was clean.', Hindi: 'जगह साफ थी।', Telugu: 'ప్రదేశం శుభ్రంగా ఉంది.' },
  { id: 'needs-cleaning', group: 'space', label: 'Needs cleaning', English: 'The place needed better cleaning.', Hindi: 'सफाई बेहतर होनी चाहिए थी।', Telugu: 'శుభ్రత మెరుగుపడాలి.' },
  { id: 'quick', group: 'speed', label: 'Quick service', English: 'The service was quick.', Hindi: 'सेवा जल्दी मिली।', Telugu: 'సేవ త్వరగా అందింది.' },
  { id: 'slow', group: 'speed', label: 'Long wait', English: 'The wait was longer than I would have liked.', Hindi: 'इंतज़ार उम्मीद से ज़्यादा था।', Telugu: 'అనుకున్న దానికంటే ఎక్కువసేపు వేచి ఉండాల్సి వచ్చింది.' }
];

export function validateExperience(body) {
  if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) throw new Error('Choose your rating from 1 to 5.');
  if (!Array.isArray(body.highlights) || body.highlights.length < 1 || body.highlights.length > 3) throw new Error('Choose 1 to 3 things that match your experience.');
  const choices = body.highlights.map(id => experienceChoices.find(choice => choice.id === id));
  if (choices.some(choice => !choice) || new Set(choices.map(choice => choice.group)).size !== choices.length) throw new Error('Choose one description per topic.');
  const language = ['English', 'Hindi', 'Telugu'].includes(body.language) ? body.language : 'English';
  return { rating: body.rating, highlights: choices.map(choice => choice.id), language };
}

export function experienceFacts(input) {
  return input.highlights.map(id => experienceChoices.find(choice => choice.id === id).English);
}

export function basicExperienceReview(input, businessName) {
  const opening = {
    English: [`My experience at ${businessName} was disappointing.`, `My experience at ${businessName} could have been better.`, `My experience at ${businessName} was mixed overall.`, `I had a good experience at ${businessName}.`, `I had a really good experience at ${businessName}.`],
    Hindi: [`${businessName} में अनुभव निराशाजनक रहा।`, `${businessName} में अनुभव बेहतर हो सकता था।`, `${businessName} में अनुभव मिला-जुला रहा।`, `${businessName} में अनुभव अच्छा रहा।`, `${businessName} में अनुभव बहुत अच्छा रहा।`],
    Telugu: [`${businessName}లో అనుభవం నిరాశ కలిగించింది.`, `${businessName}లో అనుభవం ఇంకా మెరుగ్గా ఉండాల్సింది.`, `${businessName}లో అనుభవం మిశ్రమంగా ఉంది.`, `${businessName}లో మంచి అనుభవం కలిగింది.`, `${businessName}లో చాలా మంచి అనుభవం కలిగింది.`]
  };
  const details = input.highlights.map(id => experienceChoices.find(choice => choice.id === id)[input.language]).join(' ');
  return `${opening[input.language][input.rating - 1]} ${details}`;
}
