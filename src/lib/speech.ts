// Reusable Voice Helper Utility using browser Web Speech API for rural accessibility

export const langMap: Record<string, string> = {
  English: 'en-IN',
  'हिंदी (Hindi)': 'hi-IN',
  'বাংলা (Bengali)': 'bn-IN',
  'मराठी (Marathi)': 'mr-IN',
  'తెలుగు (Telugu)': 'te-IN',
  // Short/fallback keys for resilience:
  Hindi: 'hi-IN',
  Bengali: 'bn-IN',
  Marathi: 'mr-IN',
  Telugu: 'te-IN',
  'हिंदी': 'hi-IN',
  'বাংলা': 'bn-IN',
  'मराठी': 'mr-IN',
  'తెలుగు': 'te-IN',
  'en-IN': 'en-IN',
  'hi-IN': 'hi-IN',
  'bn-IN': 'bn-IN',
  'mr-IN': 'mr-IN',
  'te-IN': 'te-IN',
};

export const LANG_LOCALE_MAP = langMap;

export function normalizeLanguageKey(lang = 'English'): string {
  if (!lang) return 'English';
  const lower = lang.toLowerCase().trim();
  if (lower.startsWith('hi') || lang.includes('हिंदी') || lower.includes('hindi')) return 'हिंदी (Hindi)';
  if (lower.startsWith('bn') || lang.includes('বাংলা') || lower.includes('bengali') || lower.includes('bangla')) return 'বাংলা (Bengali)';
  if (lower.startsWith('mr') || lang.includes('मराठी') || lower.includes('marathi')) return 'मराठी (Marathi)';
  if (lower.startsWith('te') || lang.includes('తెలుగు') || lower.includes('telugu')) return 'తెలుగు (Telugu)';
  return 'English';
}

export function getLocaleForLanguage(lang = 'English'): string {
  return langMap[lang] || langMap[normalizeLanguageKey(lang)] || 'en-IN';
}

export type VoiceFieldKey =
  | 'phoneInput'
  | 'otpInput'
  | 'emailInput'
  | 'passwordInput'
  | 'signInSubmit'
  | 'authTypeSelect'
  | 'assistedProfile'
  | 'workerName'
  | 'workerCategory'
  | 'workerSkills'
  | 'workerExperience'
  | 'jobTitle'
  | 'jobCategory'
  | 'workersCount'
  | 'workerSkillsRequired'
  | 'dailyWage'
  | 'jobLocation'
  | 'jobDescription'
  | 'searchSkills'
  | 'skillMatcherModal'
  | 'categoryFilter'
  | 'equipTitle'
  | 'equipCategory'
  | 'equipRent'
  | 'equipDeposit'
  | 'equipLocation'
  | 'equipDesc'
  | 'searchEquipment'
  | 'bankName'
  | 'bankAccountNo'
  | 'confirmAccountNo'
  | 'bankIfsc'
  | 'upiId'
  | 'paymentAmount'
  | 'paymentUtr'
  | 'paymentMethod'
  | 'roleSelection';

export const VOICE_GUIDANCE_DICTIONARY: Record<string, Record<VoiceFieldKey, string>> = {
  English: {
    phoneInput: 'Please enter your ten digit mobile phone number.',
    otpInput: 'Please enter the six digit verification OTP code received on your phone.',
    emailInput: 'Please enter your email address.',
    passwordInput: 'Please enter your account password with at least six characters.',
    signInSubmit: 'Tap to sign in or create your account.',
    authTypeSelect: 'Choose to login with Mobile OTP or Email and Password.',
    assistedProfile: 'Assisted profile option. Check this if registering for a worker without a smartphone.',
    workerName: "Please enter the worker's full name.",
    workerCategory: 'Select work domain: Agriculture, Construction, Daily work, or Skilled self-employed.',
    workerSkills: 'Enter work skills separated by commas, such as tractor driving, harvesting, or masonry.',
    workerExperience: 'Enter total years of work experience.',
    jobTitle: 'Enter the job title, for example, need four harvester operators.',
    jobCategory: 'Select the category of work needed: Agriculture, Construction, Daily work, or Skilled self-employed.',
    workersCount: 'Enter the number of workers needed for this work.',
    workerSkillsRequired: 'Enter required skills for this job, or tap suggested skill tags.',
    dailyWage: 'Enter the offered daily wage in rupees per day.',
    jobLocation: 'Enter the village name, area, or district location.',
    jobDescription: 'Enter work details, reporting location, and timings.',
    searchSkills: 'Search workers by skill, for example tractor, masonry, or harvesting.',
    skillMatcherModal: 'Discover skilled workers. Filter by category or search by skill, then tap a worker profile to call them directly.',
    categoryFilter: 'Filter workers by work category: Agriculture, Construction, Daily work, or Skilled self-employed.',
    equipTitle: 'Enter the tool or machine name, such as tractor, concrete mixer, or power sprayer.',
    equipCategory: 'Select equipment category: Agriculture, Construction, Daily work, or Skilled self-employed.',
    equipRent: 'Enter the daily rental rate in rupees per day.',
    equipDeposit: 'Enter the optional security deposit amount in rupees.',
    equipLocation: 'Enter the village, area, or district where this equipment is stationed.',
    equipDesc: 'Enter usage instructions, condition, operator availability, and return guidelines.',
    searchEquipment: 'Search machinery and tools by name, for example tractor, mixer, sprayer, or drill.',
    bankName: 'Select or enter your bank name, such as State Bank of India, Bank of Baroda, or Bank of Maharashtra.',
    bankAccountNo: 'Enter your bank savings account number carefully.',
    confirmAccountNo: 'Re-enter your bank account number to confirm and avoid payment errors.',
    bankIfsc: 'Enter your eleven character bank branch IFSC code, for example SBIN0001234.',
    upiId: 'Enter your direct UPI ID, for example your phone number at paytm or your name at upi.',
    paymentAmount: 'Enter the wage or rental amount in rupees to pay.',
    paymentUtr: 'Enter the twelve digit bank transaction reference number or UTR number from your payment app.',
    paymentMethod: 'Select payment method: Direct UPI, Net Banking IMPS or NEFT, or Cash in hand.',
    roleSelection: 'Select your role. Choose Worker if you are looking for daily wages, or Job Hirer if you want to hire workers or machinery.',
  },
  'हिंदी (Hindi)': {
    phoneInput: 'कृपया अपना दस अंकों का मोबाइल फोन नंबर दर्ज करें।',
    otpInput: 'कृपया अपने फोन पर प्राप्त छह अंकों का ओटीपी कोड दर्ज करें।',
    emailInput: 'कृपया अपना ईमेल पता दर्ज करें।',
    passwordInput: 'कृपया कम से कम छह अक्षरों का अपना पासवर्ड दर्ज करें।',
    signInSubmit: 'साइन इन करने या नया खाता बनाने के लिए दबाएं।',
    authTypeSelect: 'मोबाइल ओटीपी या ईमेल और पासवर्ड से लॉगिन चुनें।',
    assistedProfile: 'सहायक प्रोफाइल विकल्प। बिना स्मार्टफोन वाले कामगार के लिए यह चुनें।',
    workerName: 'कृपया कामगार का पूरा नाम दर्ज करें।',
    workerCategory: 'कार्य की श्रेणी चुनें: कृषि, निर्माण, दैनिक श्रम, या कुशल स्व-रोजगार।',
    workerSkills: 'कार्य कौशल अल्पविराम लगाकर लिखें, जैसे ट्रैक्टर चलाना, कटाई, या राजमिस्त्री।',
    workerExperience: 'कार्य अनुभव के कुल वर्ष दर्ज करें।',
    jobTitle: 'काम का शीर्षक दर्ज करें, जैसे गेहूं कटाई हेतु चार मजदूर चाहिए।',
    jobCategory: 'कार्य की श्रेणी चुनें: कृषि कार्य, निर्माण, दैनिक श्रम, या कुशल कारीगर।',
    workersCount: 'इस काम के लिए आवश्यक कामगारों की संख्या दर्ज करें।',
    workerSkillsRequired: 'आवश्यक कौशल दर्ज करें, या नीचे दिए गए कौशल टैग चुनें।',
    dailyWage: 'रुपये प्रति दिन में तय की गई दैनिक मजदूरी दर्ज करें।',
    jobLocation: 'गांव का नाम, क्षेत्र, या जिले का स्थान दर्ज करें।',
    jobDescription: 'काम का विवरण, समय और पहुंचने के निर्देश दर्ज करें।',
    searchSkills: 'कौशल से कामगार खोजें, जैसे ट्रैक्टर, राजमिस्त्री, या कटाई।',
    skillMatcherModal: 'कुशल कामगार खोजें। श्रेणी या कौशल से खोजें, और सीधे फोन करने के लिए प्रोफाइल पर टैप करें।',
    categoryFilter: 'कार्य श्रेणी के अनुसार कामगार चुनें: कृषि कार्य, निर्माण, दैनिक श्रम, या कुशल कारीगर।',
    equipTitle: 'उपकरण या मशीन का नाम दर्ज करें, जैसे ट्रैक्टर, कंक्रीट मिक्सर या स्प्रेयर।',
    equipCategory: 'उपकरण की श्रेणी चुनें: कृषि, निर्माण, दैनिक श्रम या कुशल कारीगर।',
    equipRent: 'प्रति दिन रुपये में दैनिक किराया दर्ज करें।',
    equipDeposit: 'रुपये में वैकल्पिक सुरक्षा जमा राशि दर्ज करें।',
    equipLocation: 'गांव, क्षेत्र या जिले का नाम दर्ज करें जहां यह उपकरण उपलब्ध है।',
    equipDesc: 'उपयोग निर्देश, स्थिति, ऑपरेटर की उपलब्धता और लौटने के नियम दर्ज करें।',
    searchEquipment: 'मशीन या औजार खोजें, जैसे ट्रैक्टर, मिक्सर, स्प्रेयर या ड्रिल।',
    bankName: 'अपने बैंक का नाम चुनें या दर्ज करें, जैसे भारतीय स्टेट बैंक, बैंक ऑफ बड़ौदा या बैंक ऑफ महाराष्ट्र।',
    bankAccountNo: 'अपना बैंक बचत खाता नंबर ध्यानपूर्वक दर्ज करें।',
    confirmAccountNo: 'पुष्टि करने और गलतियों से बचने के लिए अपना बैंक खाता संख्या पुनः दर्ज करें।',
    bankIfsc: 'अपनी बैंक शाखा का 11 अक्षरों का आईएफएससी कोड दर्ज करें, जैसे SBIN0001234।',
    upiId: 'अपनी सीधी यूपीआई आईडी दर्ज करें, जैसे 9876543210@paytm या नाम@upi।',
    paymentAmount: 'भुगतान की जाने वाली मजदूरी या किराए की राशि रुपये में दर्ज करें।',
    paymentUtr: 'अपने बैंक या यूपीआई ऐप से प्राप्त 12 अंकों का यूटीआर या ट्रांजेक्शन रेफरेंस नंबर दर्ज करें।',
    paymentMethod: 'भुगतान का तरीका चुनें: डायरेक्ट यूपीआई, नेट बैंकिंग या नकद।',
    roleSelection: 'अपनी भूमिका चुनें। यदि आप दैनिक मजदूरी की तलाश में हैं तो कामगार चुनें, या यदि आप कामगार या मशीन किराए पर लेना चाहते हैं तो नियोक्ता चुनें।',
  },
  'मराठी (Marathi)': {
    phoneInput: 'कृपया आपला दहा अंकी मोबाईल फोन नंबर टाका.',
    otpInput: 'कृपया तुमच्या फोनवर आलेला सहा अंकी ओटीपी पडताळणी कोड टाका.',
    emailInput: 'कृपया आपला ईमेल पत्ता टाका.',
    passwordInput: 'कृपया किमान सहा अक्षरांचा आपला पासवर्ड टाका.',
    signInSubmit: 'साइन इन करण्यासाठी किंवा नवीन खाते तयार करण्यासाठी दाबा.',
    authTypeSelect: 'मोबाईल ओटीपी किंवा ईमेल आणि पासवर्डने लॉगिन निवडा.',
    assistedProfile: 'सहाय्यक प्रोफाइल पर्याय. स्मार्टफोन नसलेल्या कामगारासाठी ही नोंदणी निवडा.',
    workerName: 'कृपया कामगाराचे पूर्ण नाव टाका.',
    workerCategory: 'कामाचा प्रकार निवडा: शेती काम, बांधकाम, रोजंदारी, किंवा कुशल व्यावसायिक.',
    workerSkills: 'कामाची कौशल्ये स्वल्पविराम देऊन लिहा, जसे ट्रॅक्टर चालवणे, काढणी, किंवा गवंडी काम.',
    workerExperience: 'कामाच्या अनुभवाची एकूण वर्षे टाका.',
    jobTitle: 'कामाचे नाव टाका, जसे गहू काढणीसाठी चार मजूर हवेत.',
    jobCategory: 'कामाचा प्रकार निवडा: शेती काम, बांधकाम, रोजंदारी किंवा कुशल व्यावसायिक.',
    workersCount: 'या कामासाठी किती मजूर हवेत ती संख्या टाका.',
    workerSkillsRequired: 'आवश्यक कौशल्ये टाका किंवा खालील टॅग निवडा.',
    dailyWage: 'प्रति दिवस रुपये मध्ये ठरवलेली दैनिक मजुरी टाका.',
    jobLocation: 'गावचे नाव, परिसर, किंवा तालुक्याचे ठिकाण टाका.',
    jobDescription: 'कामाचा तपशील, कामाची वेळ आणि सूचना टाका.',
    searchSkills: 'कौशल्याने कामगार शोधा, जसे ट्रॅक्टर, गवंडी, वेल्डिंग किंवा शेतीकाम.',
    skillMatcherModal: 'कुशल कामगार शोधा. कामाचा प्रकार किंवा कौशल्य निवडून कामगारांना थेट फोन लावा.',
    categoryFilter: 'कामाच्या प्रकारानुसार कामगार निवडा: शेती काम, बांधकाम, रोजंदारी किंवा कुशल व्यावसायिक.',
    equipTitle: 'यंत्र किंवा अवजाराचे नाव टाका, जसे ट्रॅक्टर, सिमेंट मिक्सर किंवा स्प्रे पंप.',
    equipCategory: 'कामाचा प्रकार निवडा: शेती काम, बांधकाम, रोजंदारी किंवा कुशल व्यावसायिक.',
    equipRent: 'प्रति दिवस रुपये मध्ये दैनिक भाडे टाका.',
    equipDeposit: 'रुपये मध्ये ऐच्छिक अनामत रक्कम टाका.',
    equipLocation: 'गाव किंवा तालुक्याचे ठिकाण टाका जिथे हे यंत्र उपलब्ध आहे.',
    equipDesc: 'वापराच्या सूचना, यंत्राची स्थिती, ऑपरेटरची उपलब्धता आणि नियम टाका.',
    searchEquipment: 'यंत्र किंवा अवजार शोधा, जसे ट्रॅक्टर, मिक्सर, वेल्डिंग किंवा पंप.',
    bankName: 'आपल्या बँकेचे नाव निवडा किंवा टाका, जसे स्टेट बँक ऑफ इंडिया, बँक ऑफ महाराष्ट्र किंवा बँक ऑफ बडोदा.',
    bankAccountNo: 'आपला बँक खाते क्रमांक काळजीपूर्वक टाका.',
    confirmAccountNo: 'खात्री करण्यासाठी आणि चूक टाळण्यासाठी आपला बँक खाते क्रमांक पुन्हा टाका.',
    bankIfsc: 'आपल्या बँक शाखेचा ११ अंकी आयएफएससी कोड टाका, जसे MAHB0000123 किंवा SBIN0001234.',
    upiId: 'आपला थेट यूपीआय आयडी टाका, जसे मोबाईल@paytm किंवा नाव@okhdfcbank.',
    paymentAmount: 'देण्यात येणारी मजुरी किंवा भाड्याची रक्कम रुपये मध्ये टाका.',
    paymentUtr: 'आपल्या पेमेंट ॲपमधील १२ अंकी बँक संदर्भ क्रमांक किंवा युटीआर नंबर टाका.',
    paymentMethod: 'पेमेंटचा प्रकार निवडा: थेट यूपीआय, नेट बँकिंग किंवा रोख.',
    roleSelection: 'तुमची भूमिका निवडा. जर तुम्ही कामाच्या शोधात असाल तर कामगार निवडा, किंवा कामगार अथवा यंत्रे हवी असल्यास मालक निवडा.',
  },
  'বাংলা (Bengali)': {
    phoneInput: 'অনুগ্রহ করে আপনার দশ সংখ্যার মোবাইল ফোন নম্বর লিখুন।',
    otpInput: 'অনুগ্রহ করে আপনার ফোনে পাওয়া ছয় সংখ্যার ওটিপি কোড লিখুন।',
    emailInput: 'অনুগ্রহ করে আপনার ইমেল ঠিকানা লিখুন।',
    passwordInput: 'অনুগ্রহ করে কমপক্ষে ছয়টি অক্ষরের পাসওয়ার্ড লিখুন।',
    signInSubmit: 'সাইন ইন করতে বা নতুন অ্যাকাউন্ট তৈরি করতে চাপুন।',
    authTypeSelect: 'মোবাইল ওটিপি অথবা ইমেল এবং পাসওয়ার্ড দিয়ে লগইন বেছে নিন।',
    assistedProfile: 'সহায়ক প্রোফাইল বিকল্প। স্মার্টফোন না থাকা কর্মীর জন্য এটি নির্বাচন করুন।',
    workerName: 'অনুগ্রহ করে কর্মীর পুরো নাম লিখুন।',
    workerCategory: 'কাজের বিভাগ নির্বাচন করুন: কৃষিকাজ, নির্মাণকাজ, দিনমজুরি, বা দক্ষ পেশা।',
    workerSkills: 'কমা দিয়ে কাজের দক্ষতা লিখুন, যেমন ট্রাক্টর চালনা, ধান কাটা, বা রাজমিস্ত্রি।',
    workerExperience: 'মোট কাজের অভিজ্ঞতার বছর লিখুন।',
    jobTitle: 'কাজের নাম লিখুন, যেমন ধান কাটার জন্য চারজন কর্মী প্রয়োজন।',
    jobCategory: 'কাজের বিভাগ নির্বাচন করুন: কৃষিকাজ, নির্মাণকাজ, দিনমজুরি বা দক্ষ পেশা।',
    workersCount: 'এই কাজের জন্য কতজন কর্মী প্রয়োজন সেই সংখ্যা লিখুন।',
    workerSkillsRequired: 'প্রয়োজনীয় দক্ষতা লিখুন বা নিচে দেওয়া ট্যাগ বাছাই করুন।',
    dailyWage: 'প্রতি দিনের জন্য দৈনিক মজুরির টাকা লিখুন।',
    jobLocation: 'গ্রামের নাম, এলাকা, বা জেলার নাম লিখুন।',
    jobDescription: 'কাজের বিবরণ, সময় এবং পৌঁছানোর নির্দেশাবলী লিখুন।',
    searchSkills: 'দক্ষতা দিয়ে কর্মী খুঁজুন, যেমন ট্রাক্টর, রাজমিস্ত্রি, বা ফসল কাটা।',
    skillMatcherModal: 'দক্ষ কর্মী খুঁজুন। কাজের বিভাগ বা দক্ষতা অনুযায়ী ফিল্টার করুন এবং সরাসরি ফোন করতে প্রোফাইলে চাপুন।',
    categoryFilter: 'কাজের বিভাগ অনুযায়ী কর্মী ফিল্টার করুন: কৃষিকাজ, নির্মাণকাজ, দিনমজুরি বা দক্ষ পেশা।',
    equipTitle: 'সরঞ্জাম বা যন্ত্রের নাম লিখুন, যেমন ট্রাক্টর, কংক্রিট মিক্সার বা স্প্রে পাম্প।',
    equipCategory: 'কাজের বিভাগ নির্বাচন করুন: কৃষিকাজ, নির্মাণকাজ, দিনমজুরি বা দক্ষ পেশা।',
    equipRent: 'প্রতি দিনের জন্য দৈনিক ভাড়ার পরিমাণ লিখুন।',
    equipDeposit: 'ঐচ্ছিক নিরাপত্তা আমানতের পরিমাণ লিখুন।',
    equipLocation: 'গ্রাম বা এলাকার নাম লিখুন যেখানে এই সরঞ্জামটি রয়েছে।',
    equipDesc: 'ব্যবহারের নিয়ম, বর্তমান অবস্থা, চালক সহ পাওয়া যাবে কিনা তা লিখুন।',
    searchEquipment: 'সরঞ্জাম বা যন্ত্রের নাম দিয়ে খুঁজুন, যেমন ট্রাক্টর, মিক্সার, ড্রিল।',
    bankName: 'আপনার ব্যাংকের নাম নির্বাচন করুন বা লিখুন, যেমন স্টেট ব্যাংক অফ ইন্ডিয়া বা ব্যাংক অফ বরোদা।',
    bankAccountNo: 'আপনার ব্যাংক অ্যাকাউন্ট নম্বরটি সতর্কতার সাথে লিখুন।',
    confirmAccountNo: 'নিশ্চিত করতে এবং ভুল এড়াতে আপনার ব্যাংক অ্যাকাউন্ট নম্বর পুনরায় লিখুন।',
    bankIfsc: 'আপনার ব্যাংক শাখার এগারো সংখ্যার আইএফএসসি কোড লিখুন, যেমন SBIN0001234।',
    upiId: 'আপনার সরাসরি ইউপিআই আইডি লিখুন, যেমন মোবাইল@paytm বা নাম@upi।',
    paymentAmount: 'মজুরি বা ভাড়ার টাকার পরিমাণ লিখুন।',
    paymentUtr: 'আপনার পেমেন্ট অ্যাপ থেকে বারো সংখ্যার ইউটিআর বা লেনদেন রেফারেন্স নম্বর লিখুন।',
    paymentMethod: 'পেমেন্ট মাধ্যম বেছে নিন: সরাসরি ইউপিআই, নেট ব্যাংকিং বা নগদ।',
    roleSelection: 'আপনার ভূমিকা নির্বাচন করুন। কাজের সন্ধানে থাকলে শ্রমিক নির্বাচন করুন, অথবা কর্মী বা যন্ত্রপাতি ভাড়া করতে চাইলে নিয়োগকর্তা নির্বাচন করুন।',
  },
  'తెలుగు (Telugu)': {
    phoneInput: 'దయచేసి మీ పది అంకెల మొబైల్ ఫోన్ నంబర్ నమోదు చేయండి.',
    otpInput: 'దయచేసి మీ ఫోన్‌కు వచ్చిన ఆరు అంకెల ఓటీపీ వెరిఫికేషన్ కోడ్ నమోదు చేయండి.',
    emailInput: 'దయచేసి మీ ఈమెయిల్ చిరునామా నమోదు చేయండి.',
    passwordInput: 'దయచేసి కనీసం ఆరు అక్షరాల మీ పాస్‌వర్డ్ నమోదు చేయండి.',
    signInSubmit: 'సైన్ ఇన్ చేయడానికి లేదా కొత్త ఖాతా సృష్టించడానికి నొక్కండి.',
    authTypeSelect: 'మొబైల్ ఓటీపీ లేదా ఈమెయిల్ మరియు పాస్‌వర్డ్‌తో లాగిన్ ఎంచుకోండి.',
    assistedProfile: 'సహాయక ప్రొఫైల్ ఎంపిక. స్మార్ట్‌ఫోన్ లేని కార్మికుడి కోసం దీన్ని ఎంచుకోండి.',
    workerName: 'దయచేసి కార్మికుని పూర్తి పేరు నమోదు చేయండి.',
    workerCategory: 'పని విభాగాన్ని ఎంచుకోండి: వ్యవసాయం, భవన నిర్మాణం, రోజువారీ శ్రమ, లేదా నైపుణ్యం గల నిపుణులు.',
    workerSkills: 'మీ నైపుణ్యాలను కామాలతో నమోదు చేయండి, ఉదాహరణకు ట్రాక్టర్ డ్రైవింగ్, కోత, లేదా మేస్త్రీ.',
    workerExperience: 'మొత్తం పని అనుభవ సంవత్సరాలు నమోదు చేయండి.',
    jobTitle: 'పని పేరు నమోదు చేయండి, ఉదాహరణకు వరి కోతకు నలుగురు కార్మికులు కావాలి.',
    jobCategory: 'పని విభాగాన్ని ఎంచుకోండి: వ్యవసాయం, భవన నిర్మాణం, రోజువారీ శ్రమ లేదా నిపుణులు.',
    workersCount: 'ఈ పనికి కావలసిన కార్మికుల సంఖ్యను నమోదు చేయండి.',
    workerSkillsRequired: 'అవసరమైన నైపుణ్యాలు నమోదు చేయండి లేదా ట్యాగ్‌లను ఎంచుకోండి.',
    dailyWage: 'రోజుకు అందించే రోజువారీ వేతనం రూపాయలలో నమోదు చేయండి.',
    jobLocation: 'గ్రామం పేరు, ప్రాంతం, లేదా జిల్లా పేరు నమోదు చేయండి.',
    jobDescription: 'పని వివరాలు, పని సమయాలు మరియు సూచనలు నమోదు చేయండి.',
    searchSkills: 'నైపుణ్యంతో కార్మికులను వెతకండి, ఉదాహరణకు ట్రాక్టర్, మేస్త్రీ, లేదా కోత.',
    skillMatcherModal: 'నైపుణ్యం గల కార్మికులను కనుగొనండి. విభాగం లేదా నైపుణ్యంతో వెతికి, నేరుగా ఫోన్ చేయడానికి ప్రొఫైల్‌పై నొక్కండి.',
    categoryFilter: 'విభాగం వారీగా కార్మికులను ఎంచుకోండి: వ్యవసాయం, భవన నిర్మాణం, రోజువారీ శ్రమ లేదా నిపుణులు.',
    equipTitle: 'పరికరం లేదా యంత్రం పేరు నమోదు చేయండి, ఉదాహరణకు ట్రాక్టర్, కాంక్రీట్ మిక్సర్ లేదా స్ప్రేయర్.',
    equipCategory: 'విభాగాన్ని ఎంచుకోండి: వ్యవసాయం, భవన నిర్మాణం, రోజువారీ శ్రమ లేదా నిపుణులు.',
    equipRent: 'రోజుకు అద్దె మొత్తం రూపాయలలో నమోదు చేయండి.',
    equipDeposit: 'ఐచ్ఛిక సెక్యూరిటీ డిపాజిట్ మొత్తం నమోదు చేయండి.',
    equipLocation: 'ఈ పరికరం అందుబాటులో ఉన్న గ్రామం లేదా ప్రాంతం పేరు నమోదు చేయండి.',
    equipDesc: 'వినియోగ సూచనలు, పరిస్థితి మరియు నిబంధనలు నమోదు చేయండి.',
    searchEquipment: 'యంత్రాలు లేదా పరికరాలను వెతకండి, ఉదాహరణకు ట్రాక్టర్, మిక్సర్ లేదా పంప్.',
    bankName: 'మీ బ్యాంక్ పేరును ఎంచుకోండి లేదా నమోదు చేయండి, ఉదాహరణకు స్టేట్ బ్యాంక్ ఆఫ్ ఇండియా లేదా బ్యాంక్ ఆఫ్ బరోడా.',
    bankAccountNo: 'మీ బ్యాంక్ ఖాతా నంబర్‌ను జాగ్రత్తగా నమోదు చేయండి.',
    confirmAccountNo: 'ధృవీకరించడానికి మరియు లోపాలను నివారించడానికి మీ బ్యాంక్ ఖాతా సంఖ్యను మళ్లీ నమోదు చేయండి.',
    bankIfsc: 'మీ బ్యాంక్ బ్రాంచ్ పదకొండు అక్షరాల ఐఎఫ్‌ఎస్‌సి కోడ్ నమోదు చేయండి, ఉదాహరణకు SBIN0001234.',
    upiId: 'మీ నేరుగా యుపిఐ ఐడిని నమోదు చేయండి, ఉదాహరణకు మొబైల్@paytm లేదా పేరు@upi.',
    paymentAmount: 'చెల్లించాల్సిన వేతనం లేదా అద్దె మొత్తం రూపాయలలో నమోదు చేయండి.',
    paymentUtr: 'మీ చెల్లింపు యాప్ నుండి పన్నెండు అంకెల యుటిఆర్ లేదా లావాదేవీ రిఫరెన్స్ నంబర్ నమోదు చేయండి.',
    paymentMethod: 'చెల్లింపు పద్ధతిని ఎంచుకోండి: డైరెక్ట్ యుపిఐ, నెట్ బ్యాంకింగ్ లేదా నగదు.',
    roleSelection: 'మీ పాత్రను ఎంచుకోండి. రోజువారీ పని కోసం చూస్తున్నట్లయితే కార్మికుడిని ఎంచుకోండి, లేదా కార్మికులను లేదా యంత్రాలను అద్దెకు తీసుకోవాలనుకుంటే యజమానిని ఎంచుకోండి.',
  },
};

// Global state for reactive speech status across all components
type SpeechListener = (speakingText: string | null) => void;
const speechListeners = new Set<SpeechListener>();

let currentSpeakingText: string | null = null;
let activeUtterance: SpeechSynthesisUtterance | null = null;
let globalSpeechRate = 0.8; // Default 0.8x for clear rural accessibility

export function setGlobalSpeechRate(rate: number): void {
  globalSpeechRate = Math.max(0.5, Math.min(1.5, rate));
}

export function getGlobalSpeechRate(): number {
  return globalSpeechRate;
}

export function subscribeToSpeech(listener: SpeechListener): () => void {
  speechListeners.add(listener);
  listener(currentSpeakingText);
  return () => {
    speechListeners.delete(listener);
  };
}

function notifySpeechListeners(text: string | null): void {
  currentSpeakingText = text;
  speechListeners.forEach((fn) => {
    try {
      fn(text);
    } catch {
      // Ignore listener error
    }
  });
}

export function getCurrentSpeakingText(): string | null {
  return currentSpeakingText;
}

export function getActiveUtterance(): SpeechSynthesisUtterance | null {
  return activeUtterance;
}

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

export function stopSpeaking(): void {
  if (isSpeechSupported()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore
    }
    activeUtterance = null;
    notifySpeechListeners(null);
  }
}

export function getVoiceGuidance(fieldKey: VoiceFieldKey, lang = 'English'): string {
  const normKey = normalizeLanguageKey(lang);
  const dict = VOICE_GUIDANCE_DICTIONARY[normKey] || VOICE_GUIDANCE_DICTIONARY['English'];
  return dict?.[fieldKey] || VOICE_GUIDANCE_DICTIONARY['English']?.[fieldKey] || '';
}

// Spoken text generators for Jobs across all 5 languages
export function getJobSpeechText(
  job: {
    title: string;
    category: string;
    offered_wages: number | string;
    required_skills?: string[] | null;
    description?: string | null;
  },
  lang = 'English'
): string {
  const norm = normalizeLanguageKey(lang);
  const skillsStr = (job.required_skills && job.required_skills.length > 0)
    ? job.required_skills.join(', ')
    : '';

  switch (norm) {
    case 'हिंदी (Hindi)':
      return `काम: ${job.title}। कार्य श्रेणी: ${job.category}। दैनिक मजदूरी: ${job.offered_wages} रुपये प्रतिदिन। ${
        skillsStr ? `आवश्यक कौशल: ${skillsStr}।` : ''
      } ${job.description ? `विवरण: ${job.description}।` : ''}`;

    case 'मराठी (Marathi)':
      return `काम: ${job.title}. कामाचा प्रकार: ${job.category}. दैनिक मजुरी: ${job.offered_wages} रुपये प्रतिदिन. ${
        skillsStr ? `कौशल्ये: ${skillsStr}.` : ''
      } ${job.description ? `तपशील: ${job.description}.` : ''}`;

    case 'বাংলা (Bengali)':
      return `কাজ: ${job.title}। কাজের বিভাগ: ${job.category}। দৈনিক মজুরি: ${job.offered_wages} টাকা প্রতিদিন। ${
        skillsStr ? `দক্ষতা: ${skillsStr}।` : ''
      } ${job.description ? `বিবরণ: ${job.description}।` : ''}`;

    case 'తెలుగు (Telugu)':
      return `పని: ${job.title}. పని విభాగం: ${job.category}. రోజువారీ వేతనం: రోజుకు ${job.offered_wages} రూపాయలు. ${
        skillsStr ? `నైపుణ్యాలు: ${skillsStr}.` : ''
      } ${job.description ? `వివరాలు: ${job.description}.` : ''}`;

    default:
      return `Job: ${job.title}. Category: ${job.category}. Offered wage: ${job.offered_wages} rupees per day. ${
        skillsStr ? `Required skills: ${skillsStr}.` : ''
      } ${job.description ? `Details: ${job.description}.` : ''}`;
  }
}

// Spoken text generators for Workers across all 5 languages
export function getWorkerSpeechText(
  worker: {
    name?: string | null;
    profiles?: { full_name?: string | null } | null;
    category: string;
    experience_years?: number | null;
    skills?: string[] | null;
  },
  lang = 'English'
): string {
  const norm = normalizeLanguageKey(lang);
  const name = worker.name || worker.profiles?.full_name || 'Verified Worker';
  const exp = worker.experience_years || 1;
  const skillsStr = (worker.skills && worker.skills.length > 0) ? worker.skills.join(', ') : '';

  switch (norm) {
    case 'हिंदी (Hindi)':
      return `कामगार: ${name}। श्रेणी: ${worker.category}। कार्य अनुभव: ${exp} वर्ष। ${
        skillsStr ? `सत्यापित कौशल: ${skillsStr}।` : ''
      } संपर्क करने के लिए कॉल बटन दबाएं।`;

    case 'मराठी (Marathi)':
      return `कामगार: ${name}. कामाचा प्रकार: ${worker.category}. अनुभव: ${exp} वर्षे. ${
        skillsStr ? `कौशल्ये: ${skillsStr}.` : ''
      } थेट बोलण्यासाठी कॉल बटण दाबा.`;

    case 'বাংলা (Bengali)':
      return `কর্মী: ${name}। কাজের বিভাগ: ${worker.category}। কাজের অভিজ্ঞতা: ${exp} বছর। ${
        skillsStr ? `যাচাইকৃত দক্ষতা: ${skillsStr}।` : ''
      } সরাসরি যোগাযোগ করতে কল বাটনে চাপুন।`;

    case 'తెలుగు (Telugu)':
      return `కార్మికుడు: ${name}. విభాగం: ${worker.category}. అనుభవం: ${exp} సంవత్సరాలు. ${
        skillsStr ? `నైపుణ్యాలు: ${skillsStr}.` : ''
      } నేరుగా మాట్లాడటానికి కాల్ బటన్ నొక్కండి.`;

    default:
      return `Worker: ${name}. Domain: ${worker.category}. Experience: ${exp} years. ${
        skillsStr ? `Verified skills: ${skillsStr}.` : ''
      } Tap call button to contact directly.`;
  }
}

// Spoken text generators for Screen / Tab summaries across all 5 languages
export function getTabSummarySpeechText(tab: string, lang = 'English'): string {
  const norm = normalizeLanguageKey(lang);

  const summaries: Record<string, Record<string, string>> = {
    home: {
      English:
        'QuickHire Home. Direct rural employment without middlemen. Explore work categories, live job opportunities, and verified local workers.',
      'हिंदी (Hindi)':
        'क्विकहायर मुख्य पृष्ठ। बिना दलाली के सीधा ग्रामीण रोजगार। कार्य श्रेणियां, हाल के उपलब्ध काम और कामगार देखें।',
      'मराठी (Marathi)':
        'क्विकहायर मुख्य पृष्ठ. कोणत्याही दलालीशिवाय थेट ग्रामीण रोजगार. कामाचे प्रकार आणि स्थानिक कामगार शोधा.',
      'বাংলা (Bengali)':
        'কুইকহায়ার হোম পেজ। কোনো মাধ্যম ছাড়া সরাসরি গ্রামীণ কর্মসংস্থান। কাজের সুযোগ এবং স্থানীয় কর্মী দেখুন।',
      'తెలుగు (Telugu)':
        'క్విక్‌హైర్ హోమ్ పేజీ. ఎటువంటి దళారీ లేకుండా ప్రత్యక్ష గ్రామీణ ఉపాధి. పని అవకాశాలు మరియు కార్మికులను చూడండి.',
    },
    workers: {
      English:
        'Worker Directory. Discover local farm, construction, and daily wage workers. Filter by skill and call workers directly.',
      'हिंदी (Hindi)':
        'कामगार डायरेक्टरी। स्थानीय कृषि, निर्माण और दैनिक श्रमिकों को खोजें और सीधे फोन पर बात करें।',
      'मराठी (Marathi)':
        'कामगार यादी. शेती, बांधकाम व रोजंदारी मजुरांची माहिती पहा आणि थेट फोन लावून संपर्क साधा.',
      'বাংলা (Bengali)':
        'কর্মী ডিরেক্টরি। স্থানীয় কৃষি ও নির্মাণ শ্রমিকদের সন্ধান করুন এবং সরাসরি ফোনে কথা বলুন।',
      'తెలుగు (Telugu)':
        'కార్మికుల డైరెక్టరీ. స్థానిక వ్యవసాయ, నిర్మాణ కార్మికులను కనుగొని నేరుగా ఫోన్‌లో మాట్లాడండి.',
    },
    'post-job': {
      English:
        'Post a Job. Enter work details, worker count, location, and daily wage to connect with nearby workers in minutes.',
      'हिंदी (Hindi)':
        'काम पोस्ट करें। काम का विवरण, कामगारों की संख्या, स्थान और दैनिक मजदूरी दर्ज करके तुरंत मजदूर पाएं।',
      'मराठी (Marathi)':
        'नवीन काम नोंदवा. कामाचे नाव, मजुरांची संख्या, ठिकाण आणि दैनिक मजुरी नोंदवून कामगार शोधा.',
      'বাংলা (Bengali)':
        'কাজ পোস্ট করুন। কাজের বিবরণ, কর্মীর সংখ্যা, এলাকা ও দৈনিক মজুরি লিখে কয়েক মিনিটে কর্মী খুঁজুন।',
      'తెలుగు (Telugu)':
        'కొత్త పనిని పోస్ట్ చేయండి. పని వివరాలు, కార్మికుల సంఖ్య మరియు రోజువారీ వేతనం నమోదు చేయండి.',
    },
    'my-jobs': {
      English:
        'Employer Workforce Dashboard. View your posted jobs and contact interested workers directly by phone.',
      'हिंदी (Hindi)':
        'नियोक्ता डैशबोर्ड। अपने पोस्ट किए काम देखें और इच्छुक कामगारों को सीधे फोन कॉल करें।',
      'मराठी (Marathi)':
        'नियोक्ता डॅशबोर्ड. तुमची नोंदवलेली कामे पहा आणि अर्ज केलेल्या कामगारांना थेट कॉल करा.',
      'বাংলা (Bengali)':
        'নিয়োগকর্তা ড্যাশবোর্ড। আপনার পোস্ট করা কাজ পরিচালনা করুন এবং আগ্রহী কর্মীদের সরাসরি কল করুন।',
      'తెలుగు (Telugu)':
        'యజమాని డాష్‌బోర్డ్. మీ పనులను పర్యవేక్షించండి మరియు ఆసక్తి చూపిన కార్మికులకు నేరుగా కాల్ చేయండి.',
    },
    safety: {
      English:
        'Safety & Guidelines. Zero middlemen commission, transparent same-day wages, clean drinking water, and assisted profile support.',
      'हिंदी (Hindi)':
        'सुरक्षा व दिशानिर्देश। शून्य कमीशन, उसी दिन पारदर्शी भुगतान, स्वच्छ पानी और सहायक प्रोफाइल सुविधा।',
      'मराठी (Marathi)':
        'सुरक्षितता व नियम. शून्य कमिशन, त्याच दिवशी मजुरी, पिण्याचे पाणी आणि सहाय्यक प्रोफाइल सुविधा.',
      'বাংলা (Bengali)':
        'নিরাপত্তা ও নিয়মাবলী। শূন্য কমিশন, একই দিনে স্বচ্ছ মজুরি এবং সহায়ক প্রোফাইল সুবিধা।',
      'తెలుగు (Telugu)':
        'భద్రత & మార్గదర్శకాలు. 0% కమీషన్, అదే రోజు వేతనం మరియు సహాయక ప్రొఫైల్ సదుపాయం.',
    },
    equipment: {
      English:
        'Equipment Rentals. Rent tractors, power sprayers, concrete mixers, and tools directly from local village owners with zero platform commissions.',
      'हिंदी (Hindi)':
        'उपकरण और मशीनरी किराया। स्थानीय गांव के मालिकों से सीधे बिना किसी कमीशन के ट्रैक्टर, स्प्रेयर और निर्माण उपकरण किराए पर लें।',
      'मराठी (Marathi)':
        'अवजारे आणि यंत्रे भाडे. ट्रॅक्टर, सिमेंट मिक्सर आणि शेती अवजारे थेट स्थानिक मालकांकडून विना कमिशन भाड्याने घ्या.',
      'বাংলা (Bengali)':
        'যন্ত্রপাতি ও সরঞ্জাম ভাড়া। স্থানীয় মালিকদের থেকে সরাসরি ট্রাক্টর, স্প্রেয়ার ও নির্মাণ সরঞ্জাম ভাড়া নিন।',
      'తెలుగు (Telugu)':
        'పరికరాలు & యంత్రాల అద్దె. ట్రాక్టర్లు, మిక్సర్లు మరియు వ్యవసాయ పరికరాలను నేరుగా స్థానిక యజమానుల నుండి అద్దెకు తీసుకోండి.',
    },
    bank: {
      English:
        'Bank & Payout Accounts. Set up your bank account and UPI ID to receive direct wages and rental payouts with 0% commission, and inspect your digital passbook.',
      'हिंदी (Hindi)':
        'बैंक और भुगतान खाता। 0% कमीशन के साथ सीधी मजदूरी और किराया प्राप्त करने के लिए अपना बैंक और यूपीआई जोड़ें, और डिजिटल पासबुक देखें।',
      'मराठी (Marathi)':
        'बँक आणि पैसे जमा खाते. शून्य टक्के कमिशनने थेट मजुरी आणि भाडे मिळवण्यासाठी बँक व यूपीआय जोडा आणि डिजिटल पासबुक तपासा.',
      'বাংলা (Bengali)':
        'ব্যাংক ও পেমেন্ট অ্যাকাউন্ট। শূন্য শতাংশ কমিশনে সরাসরি মজুরি ও ভাড়া পেতে ব্যাংক ও ইউপিআই যুক্ত করুন এবং ডিজিটাল পাসবই দেখুন।',
      'తెలుగు (Telugu)':
        'బ్యాంక్ & చెల్లింపు ఖాతా. 0% కమీషన్‌తో నేరుగా వేతనాలు మరియు అద్దెను స్వీకరించడానికి మీ బ్యాంక్ మరియు యుపిఐని సెట్ చేసుకోండి, మరియు డిజిటల్ పాస్‌బుక్‌ను పరిశీలించండి.',
    },
    authGate: {
      English:
        'Welcome to QuickHire. Please select your role as a Worker or Job Hirer, and enter your 10-digit mobile number to log in securely.',
      'हिंदी (Hindi)':
        'क्विकहायर में आपका स्वागत है। कृपया कामगार या नियोक्ता के रूप में अपनी भूमिका चुनें, और सुरक्षित लॉगिन के लिए 10 अंकों का मोबाइल नंबर दर्ज करें।',
      'मराठी (Marathi)':
        'क्विकहायर मध्ये आपले स्वागत आहे. कृपया कामगार किंवा मालक म्हणून तुमची भूमिका निवडा आणि सुरक्षित लॉगिनसाठी 10 अंकी मोबाईल नंबर टाका.',
      'বাংলা (Bengali)':
        'কুইকহায়ারে আপনাকে স্বাগতম। অনুগ্রহ করে শ্রমিক বা নিয়োগকর্তা হিসেবে আপনার ভূমিকা নির্বাচন করুন এবং নিরাপদে লগইন করতে 10 সংখ্যার মোবাইল নম্বর লিখুন।',
      'తెలుగు (Telugu)':
        'క్విక్‌హైర్‌కి స్వాగతం. దయచేసి కార్మికుడు లేదా యజమానిగా మీ పాత్రను ఎంచుకోండి మరియు సురక్షితంగా లాగిన్ చేయడానికి మీ 10 అంకెల మొబైల్ నంబర్‌ను నమోదు చేయండి.',
    },
  };

  return summaries[tab]?.[norm] || summaries[tab]?.['English'] || summaries['home']['English'];
}

interface SpeakOptions {
  rate?: number;
  pitch?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: () => void;
}

/**
 * Speaks text using the native browser Web Speech API.
 * Maps application language names to appropriate Indian locale codes.
 * Uses a slower rate (0.8) so rural and elderly listeners can easily understand.
 */
export function speakText(text: string, currentLang = 'English', options: SpeakOptions = {}): void {
  if (!isSpeechSupported() || !text || !text.trim()) {
    return;
  }

  const cleanText = text.trim();

  try {
    const synth = window.speechSynthesis;
    // Cancel any previous utterance to avoid overlap
    synth.cancel();

    const locale = getLocaleForLanguage(currentLang);
    const utterance = new SpeechSynthesisUtterance(cleanText);

    // Keep active reference to prevent Chromium garbage collection bug
    activeUtterance = utterance;

    utterance.lang = locale;
    utterance.rate = options.rate ?? globalSpeechRate;
    utterance.pitch = options.pitch ?? 1.0;

    // Intelligent voice matching for Indian languages
    const voices = synth.getVoices();
    if (voices && voices.length > 0) {
      const targetPrefix = locale.slice(0, 2).toLowerCase();

      // 1. Look for exact locale match (e.g. bn-IN, mr-IN, te-IN, hi-IN, en-IN)
      let matchedVoice = voices.find((v) => v.lang.toLowerCase() === locale.toLowerCase());

      // 2. Look for language prefix match (bn, mr, te, hi, en)
      if (!matchedVoice) {
        matchedVoice = voices.find((v) =>
          v.lang.toLowerCase().replace('_', '-').startsWith(targetPrefix)
        );
      }

      // 3. For Marathi (Devanagari script), fall back to Hindi voice if Marathi voice is not installed
      if (!matchedVoice && targetPrefix === 'mr') {
        matchedVoice = voices.find((v) =>
          v.lang.toLowerCase().replace('_', '-').startsWith('hi')
        );
      }

      // 4. For Indian English, prefer en-IN voice
      if (!matchedVoice && targetPrefix === 'en') {
        matchedVoice = voices.find((v) => v.lang.toLowerCase().includes('in'));
      }

      // Set voice only if it matches the language/script family
      // (Never set an English voice for Bengali/Telugu/Marathi text!)
      if (matchedVoice) {
        utterance.voice = matchedVoice;
      }
    }

    utterance.onstart = () => {
      notifySpeechListeners(cleanText);
      if (options.onStart) options.onStart();
    };

    utterance.onend = () => {
      activeUtterance = null;
      notifySpeechListeners(null);
      if (options.onEnd) options.onEnd();
    };

    utterance.onerror = () => {
      activeUtterance = null;
      notifySpeechListeners(null);
      if (options.onError) options.onError();
    };

    synth.speak(utterance);
  } catch (err) {
    console.warn('Speech synthesis error:', err);
    activeUtterance = null;
    notifySpeechListeners(null);
    if (options.onError) options.onError();
  }
}
