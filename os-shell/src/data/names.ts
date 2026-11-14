export type NamePair = [string, string];

export const MALE: NamePair[] = [
  ["Rafiul Islam", "রাফিউল ইসলাম"], ["Tanvir Ahmed", "তানভীর আহমেদ"], ["Mahmudul Hasan", "মাহমুদুল হাসান"],
  ["Imran Hossain", "ইমরান হোসেন"], ["Sadman Sakib", "সাদমান সাকিব"], ["Arif Chowdhury", "আরিফ চৌধুরী"],
  ["Fahim Rahman", "ফাহিম রহমান"], ["Nayeem Uddin", "নাঈম উদ্দিন"], ["Shahriar Khan", "শাহরিয়ার খান"],
  ["Rakib Hasan", "রাকিব হাসান"], ["Zubayer Alam", "জুবায়ের আলম"], ["Tahmid Karim", "তাহমিদ করিম"],
  ["Mehedi Hasan", "মেহেদী হাসান"], ["Sabbir Ahmed", "সাব্বির আহমেদ"], ["Nafis Iqbal", "নাফিস ইকবাল"],
  ["Ariyan Sarker", "আরিয়ান সরকার"], ["Habibur Rahman", "হাবিবুর রহমান"], ["Jahid Miah", "জাহিদ মিয়া"],
  ["Anik Das", "অনিক দাস"], ["Subrata Paul", "সুব্রত পাল"], ["Mizanur Rahman", "মিজানুর রহমান"],
  ["Ayman Siddique", "আয়মান সিদ্দিক"], ["Raihan Kabir", "রায়হান কবির"], ["Omar Faruk", "ওমর ফারুক"],
];

export const FEMALE: NamePair[] = [
  ["Nusrat Jahan", "নুসরাত জাহান"], ["Tasnim Akter", "তাসনিম আক্তার"], ["Farzana Yasmin", "ফারজানা ইয়াসমিন"],
  ["Sumaiya Begum", "সুমাইয়া বেগম"], ["Maliha Chowdhury", "মালিহা চৌধুরী"], ["Ayesha Siddika", "আয়েশা সিদ্দিকা"],
  ["Mim Sultana", "মিম সুলতানা"], ["Rubaiya Haque", "রুবাইয়া হক"], ["Lamia Rahman", "লামিয়া রহমান"],
  ["Nabila Islam", "নাবিলা ইসলাম"], ["Sadia Afrin", "সাদিয়া আফরিন"], ["Tanjila Hossain", "তানজিলা হোসেন"],
  ["Mahiya Noor", "মাহিয়া নূর"], ["Jannatul Ferdous", "জান্নাতুল ফেরদৌস"], ["Puja Rani Das", "পূজা রানী দাস"],
  ["Anika Tabassum", "অনিকা তাবাসসুম"], ["Shirin Akter", "শিরিন আক্তার"], ["Riya Moni", "রিয়া মনি"],
  ["Samira Khatun", "সামিরা খাতুন"], ["Israt Jahan", "ইসরাত জাহান"], ["Priya Dey", "প্রিয়া দে"],
  ["Zarin Tasnim", "জারিন তাসনিম"], ["Fariha Ahmed", "ফারিহা আহমেদ"], ["Humayra Kabir", "হুমায়রা কবির"],
];

export const GUARDIANS: NamePair[] = [
  ["Abdul Karim", "আব্দুল করিম"], ["Mohammad Rahim", "মোহাম্মদ রহিম"], ["Shamsul Haque", "শামসুল হক"],
  ["Nurul Amin", "নূরুল আমিন"], ["Jalal Uddin", "জালাল উদ্দিন"], ["Monir Hossain", "মনির হোসেন"],
  ["Rezaul Karim", "রেজাউল করিম"], ["Delwar Hossain", "দেলোয়ার হোসেন"], ["Kamal Ahmed", "কামাল আহমেদ"],
  ["Habib Ullah", "হাবিব উল্লাহ"], ["Sirajul Islam", "সিরাজুল ইসলাম"], ["Anwar Hossain", "আনোয়ার হোসেন"],
];

export const TEACHER_NAMES: NamePair[] = [
  ["Md. Abdur Razzak", "মো. আব্দুর রাজ্জাক"], ["Shahida Parvin", "শাহিদা পারভীন"], ["Kamrul Hasan", "কামরুল হাসান"],
  ["Rokeya Sultana", "রোকেয়া সুলতানা"], ["Dilip Kumar Roy", "দিলীপ কুমার রায়"], ["Nasrin Akter", "নাসরিন আক্তার"],
  ["Mustafizur Rahman", "মুস্তাফিজুর রহমান"], ["Farhana Islam", "ফারহানা ইসলাম"], ["Abu Sayeed", "আবু সায়েদ"],
  ["Salma Khatun", "সালমা খাতুন"], ["Anwarul Haque", "আনোয়ারুল হক"], ["Jesmin Ara", "জেসমিন আরা"],
  ["Prodip Chakraborty", "প্রদীপ চক্রবর্তী"], ["Rehana Begum", "রেহানা বেগম"], ["Golam Mostafa", "গোলাম মোস্তফা"],
  ["Shirin Sultana", "শিরীন সুলতানা"], ["Alamgir Kabir", "আলমগীর কবির"], ["Taslima Nasrin", "তাসলিমা নাসরিন"],
  ["Habibur Rahman", "হাবিবুর রহমান"], ["Monowara Begum", "মনোয়ারা বেগম"], ["Sumon Deb", "সুমন দেব"],
  ["Lutfun Nahar", "লুৎফুন নাহার"], ["Faruk Ahmed", "ফারুক আহমেদ"], ["Mahmuda Khanom", "মাহমুদা খানম"],
  ["Ruhul Amin", "রুহুল আমিন"], ["Sharmin Akter", "শারমিন আক্তার"], ["Belal Hossain", "বেলাল হোসেন"],
  ["Nilufar Yasmin", "নীলুফার ইয়াসমিন"],
];

export const DESIGNATIONS = ["Assistant Teacher", "Senior Teacher", "Assistant Head Teacher", "Head of Department"];

export const SUBJECT_MASTER: { en: string; bn: string }[] = [
  { en: "Bangla", bn: "বাংলা" },
  { en: "English", bn: "ইংরেজি" },
  { en: "Mathematics", bn: "গণিত" },
  { en: "Science", bn: "বিজ্ঞান" },
  { en: "Bangladesh & Global Studies", bn: "বাংলাদেশ ও বিশ্বপরিচয়" },
  { en: "Religion", bn: "ধর্ম ও নৈতিক শিক্ষা" },
  { en: "ICT", bn: "তথ্য ও যোগাযোগ প্রযুক্তি" },
  { en: "Physics", bn: "পদার্থবিজ্ঞান" },
  { en: "Chemistry", bn: "রসায়ন" },
  { en: "Biology", bn: "জীববিজ্ঞান" },
  { en: "Higher Mathematics", bn: "উচ্চতর গণিত" },
];

export function subjectsForClass(classNo: number): string[] {
  if (classNo <= 2) return ["Bangla", "English", "Mathematics", "Religion"];
  if (classNo <= 5) return ["Bangla", "English", "Mathematics", "Science", "Bangladesh & Global Studies", "Religion"];
  if (classNo <= 8) return ["Bangla", "English", "Mathematics", "Science", "Bangladesh & Global Studies", "Religion", "ICT"];
  return ["Bangla", "English", "Mathematics", "Physics", "Chemistry", "Biology", "ICT"];
}
