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

export function normalizeReview(review) {
  return review.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function validateRecentReviews(reviews = []) {
  if (!Array.isArray(reviews) || reviews.length > 8 || reviews.some(review => typeof review !== 'string' || !review.trim() || review.length > 650)) throw new Error('Invalid recent review history.');
  return reviews.map(review => review.trim());
}

const detailAlternatives = {
  English: {
    friendly: ['The staff were friendly.', 'I liked how friendly the staff were.', 'The friendly staff stood out to me.'],
    unhelpful: ['The staff could have been more helpful.', 'I expected more help from the staff.', 'The staff were not as helpful as I had hoped.'],
    'quality-good': ['I was happy with the quality.', 'The quality was good.', 'I liked the quality.'],
    'quality-poor': ['The quality fell short of what I expected.', 'I was disappointed with the quality.', 'The quality could have been better.'],
    'fair-price': ['The prices felt fair.', 'I thought the pricing was reasonable.', 'The prices seemed fair to me.'],
    expensive: ['It felt too expensive for what I got.', 'The price was too high for what I got.', 'I did not feel it was worth the price.'],
    clean: ['The place was clean.', 'I liked that the place was clean.', 'The cleanliness stood out to me.'],
    'needs-cleaning': ['The place needed better cleaning.', 'I felt the place could have been cleaner.', 'The cleanliness needs improvement.'],
    quick: ['The service was quick.', 'I liked how quick the service was.', 'The speed of service stood out to me.'],
    slow: ['The wait was longer than I would have liked.', 'I felt the wait was too long.', 'The long wait was a downside for me.']
  },
  Hindi: {
    friendly: ['स्टाफ का व्यवहार अच्छा था।', 'स्टाफ का दोस्ताना व्यवहार अच्छा लगा।', 'स्टाफ ने दोस्ताना व्यवहार किया।'],
    unhelpful: ['स्टाफ से और बेहतर मदद की उम्मीद थी।', 'स्टाफ से उतनी मदद नहीं मिली जितनी उम्मीद थी।', 'स्टाफ को और मददगार होना चाहिए था।'],
    'quality-good': ['गुणवत्ता अच्छी लगी।', 'गुणवत्ता से संतुष्टि हुई।', 'मुझे गुणवत्ता पसंद आई।'],
    'quality-poor': ['गुणवत्ता उम्मीद से कम थी।', 'गुणवत्ता से निराशा हुई।', 'गुणवत्ता बेहतर हो सकती थी।'],
    'fair-price': ['कीमतें उचित लगीं।', 'मुझे कीमतें वाजिब लगीं।', 'कीमतों से संतुष्टि हुई।'],
    expensive: ['जो मिला उसके हिसाब से कीमत ज़्यादा लगी।', 'कीमत के हिसाब से उतना संतोष नहीं मिला।', 'जो मिला उसके लिए कीमत बहुत ज़्यादा थी।'],
    clean: ['जगह साफ थी।', 'सफाई अच्छी लगी।', 'जगह की सफाई पसंद आई।'],
    'needs-cleaning': ['सफाई बेहतर होनी चाहिए थी।', 'जगह और साफ हो सकती थी।', 'सफाई पर और ध्यान देने की ज़रूरत है।'],
    quick: ['सेवा जल्दी मिली।', 'सेवा की तेज़ी अच्छी लगी।', 'सेवा जल्दी मिलने से संतुष्टि हुई।'],
    slow: ['इंतज़ार उम्मीद से ज़्यादा था।', 'इंतज़ार बहुत लंबा लगा।', 'लंबा इंतज़ार अच्छा नहीं लगा।']
  },
  Telugu: {
    friendly: ['సిబ్బంది స్నేహపూర్వకంగా ఉన్నారు.', 'సిబ్బంది స్నేహపూర్వకంగా ఉండటం నచ్చింది.', 'సిబ్బంది స్నేహపూర్వక ప్రవర్తన బాగుంది.'],
    unhelpful: ['సిబ్బంది మరింత సహాయం చేసి ఉంటే బాగుండేది.', 'సిబ్బంది నుంచి ఆశించినంత సహాయం అందలేదు.', 'సిబ్బంది ఇంకా సహాయకరంగా ఉండాలి.'],
    'quality-good': ['నాణ్యత నచ్చింది.', 'నాణ్యత బాగుంది.', 'నాణ్యతతో సంతృప్తి కలిగింది.'],
    'quality-poor': ['నాణ్యత ఆశించిన స్థాయిలో లేదు.', 'నాణ్యత నిరాశ కలిగించింది.', 'నాణ్యత ఇంకా మెరుగ్గా ఉండాలి.'],
    'fair-price': ['ధరలు సరసంగా అనిపించాయి.', 'ధరలు సమంజసంగా ఉన్నాయి.', 'ధరలు నాకు సరైనవిగా అనిపించాయి.'],
    expensive: ['అందిన దానితో పోలిస్తే ధర ఎక్కువగా అనిపించింది.', 'అందిన దానికి ధర మరీ ఎక్కువగా ఉంది.', 'ధరకు తగినంత విలువ లేదనిపించింది.'],
    clean: ['ప్రదేశం శుభ్రంగా ఉంది.', 'ప్రదేశం శుభ్రంగా ఉండటం నచ్చింది.', 'శుభ్రత బాగుంది.'],
    'needs-cleaning': ['శుభ్రత మెరుగుపడాలి.', 'ప్రదేశం మరింత శుభ్రంగా ఉండాలి.', 'శుభ్రతపై ఇంకా శ్రద్ధ పెట్టాలి.'],
    quick: ['సేవ త్వరగా అందింది.', 'వేగంగా సేవ అందడం నచ్చింది.', 'సేవ వేగం బాగుంది.'],
    slow: ['అనుకున్న దానికంటే ఎక్కువసేపు వేచి ఉండాల్సి వచ్చింది.', 'వేచి ఉండే సమయం ఎక్కువగా అనిపించింది.', 'ఎక్కువసేపు వేచి ఉండటం నచ్చలేదు.']
  }
};

export function basicExperienceReview(input, businessName, previousReviews = [], random = Math.random) {
  const opening = {
    English: [`My experience at ${businessName} was disappointing.`, `My experience at ${businessName} could have been better.`, `My experience at ${businessName} was mixed overall.`, `I had a good experience at ${businessName}.`, `I had a really good experience at ${businessName}.`],
    Hindi: [`${businessName} में अनुभव निराशाजनक रहा।`, `${businessName} में अनुभव बेहतर हो सकता था।`, `${businessName} में अनुभव मिला-जुला रहा।`, `${businessName} में अनुभव अच्छा रहा।`, `${businessName} में अनुभव बहुत अच्छा रहा।`],
    Telugu: [`${businessName}లో అనుభవం నిరాశ కలిగించింది.`, `${businessName}లో అనుభవం ఇంకా మెరుగ్గా ఉండాల్సింది.`, `${businessName}లో అనుభవం మిశ్రమంగా ఉంది.`, `${businessName}లో మంచి అనుభవం కలిగింది.`, `${businessName}లో చాలా మంచి అనుభవం కలిగింది.`]
  };
  const summaries = {
    English: [
      ['Overall, I was disappointed with my experience.', 'It was a disappointing experience for me.'],
      ['Overall, my experience could have been better.', 'I was not very happy with the experience overall.'],
      ['Overall, it was a mixed experience for me.', 'There were both good and bad parts to the experience.'],
      ['Overall, I was happy with my experience.', 'It was a good experience for me overall.'],
      ['Overall, I was very happy with my experience.', 'It was a really good experience for me.']
    ],
    Hindi: [
      ['कुल मिलाकर अनुभव निराशाजनक रहा।', 'अनुभव से निराशा हुई।'],
      ['कुल मिलाकर अनुभव बेहतर हो सकता था।', 'कुल मिलाकर अनुभव से खास संतुष्टि नहीं हुई।'],
      ['कुल मिलाकर अनुभव मिला-जुला रहा।', 'अनुभव में अच्छी और बुरी दोनों बातें थीं।'],
      ['कुल मिलाकर अनुभव अच्छा रहा।', 'अनुभव से संतुष्टि हुई।'],
      ['कुल मिलाकर अनुभव बहुत अच्छा रहा।', 'अनुभव से बहुत संतुष्टि हुई।']
    ],
    Telugu: [
      ['మొత్తంగా అనుభవం నిరాశ కలిగించింది.', 'ఈ అనుభవంతో నిరాశ చెందాను.'],
      ['మొత్తంగా అనుభవం ఇంకా మెరుగ్గా ఉండాల్సింది.', 'మొత్తంగా అనుభవం అంతగా నచ్చలేదు.'],
      ['మొత్తంగా అనుభవం మిశ్రమంగా ఉంది.', 'అనుభవంలో మంచి, చెడు రెండూ ఉన్నాయి.'],
      ['మొత్తంగా మంచి అనుభవం కలిగింది.', 'ఈ అనుభవంతో సంతృప్తి కలిగింది.'],
      ['మొత్తంగా చాలా మంచి అనుభవం కలిగింది.', 'ఈ అనుభవంతో చాలా సంతృప్తి కలిగింది.']
    ]
  };
  const neutralName = { English: `My experience at ${businessName}:`, Hindi: `${businessName} में मेरा अनुभव:`, Telugu: `${businessName}లో నా అనుభవం:` };
  const candidates = [];
  for (let variant = 0; variant < 3; variant++) {
    const facts = input.highlights.map((id, i) => detailAlternatives[input.language][id][(variant + i) % 3]);
    for (const ordered of [facts, facts.slice().reverse()]) {
      const details = ordered.join(' ');
      candidates.push(`${opening[input.language][input.rating - 1]} ${details}`);
      for (const summary of summaries[input.language][input.rating - 1]) {
        candidates.push(`${neutralName[input.language]} ${details} ${summary}`);
        candidates.push(`${neutralName[input.language]} ${summary} ${details}`);
      }
    }
  }
  const recent = new Set(previousReviews.map(normalizeReview));
  const unique = [...new Map(candidates.map(review => [normalizeReview(review), review])).values()];
  const start = Math.floor(random() * unique.length) % unique.length;
  for (let offset = 0; offset < unique.length; offset++) {
    const candidate = unique[(start + offset) % unique.length];
    if (!recent.has(normalizeReview(candidate))) return candidate;
  }
  // There are at least 15 distinct drafts per rating/language even with just one fact,
  // and only the last eight are supplied by the customer page.
  throw new Error('Could not find fresh wording. Please try again.');
}
