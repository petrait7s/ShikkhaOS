import * as React from "react";

export type Lang = "en" | "bn";
let current: Lang = "en";
try { const s = localStorage.getItem("sos.lang"); if (s === "bn") current = "bn"; } catch { /* storage unavailable */ }

/** English strings are the keys; Bengali translations cover the core flows (shell, sign-in, dashboards, results, attendance, messages, homework, notices). Missing keys fall back to English. */
const bn: Record<string, string> = {
  // shell & navigation
  "Dashboard": "ড্যাশবোর্ড", "Students": "শিক্ষার্থী", "Teachers": "শিক্ষক", "Academics": "একাডেমিক", "My classes": "আমার ক্লাস", "Attendance": "উপস্থিতি", "Class tests": "ক্লাস টেস্ট",
  "Homework": "বাড়ির কাজ", "Exams": "পরীক্ষা", "Marks entry": "নম্বর এন্ট্রি", "Submissions inbox": "জমা-ইনবক্স", "Results": "ফলাফল", "Messages": "বার্তা", "Notices": "নোটিশ",
  "Documents": "নথিপত্র", "Reports": "রিপোর্ট", "Moderation": "মডারেশন", "Roles & permissions": "ভূমিকা ও অনুমতি", "Audit log": "অডিট লগ", "School settings": "স্কুল সেটিংস",
  "My results": "আমার ফলাফল", "My attendance": "আমার উপস্থিতি", "Overview": "সারসংক্ষেপ", "People": "মানুষ", "Communication": "যোগাযোগ", "Administration": "প্রশাসন",
  "Search students, notices, exams…": "শিক্ষার্থী, নোটিশ, পরীক্ষা খুঁজুন…", "Search or jump to…": "খুঁজুন বা যান…", "No matches": "কিছু পাওয়া যায়নি", "Searching…": "খোঁজা হচ্ছে…",
  "Live": "সংযুক্ত", "Connecting…": "সংযোগ হচ্ছে…", "Offline — refreshing every 30 s": "অফলাইন — প্রতি ৩০ সেকেন্ডে হালনাগাদ", "Notifications": "বিজ্ঞপ্তি", "Mark all read": "সব পঠিত করুন",
  "See all": "সব দেখুন", "You're all caught up": "সব দেখা হয়েছে", "No notifications": "কোনো বিজ্ঞপ্তি নেই", "Profile & settings": "প্রোফাইল ও সেটিংস", "Sign out": "সাইন আউট",
  "Compact density": "সংকুচিত দৃশ্য", "Comfortable density": "স্বাভাবিক দৃশ্য", "Toggle theme": "থিম পরিবর্তন",
  // roles
  "Headmaster": "প্রধান শিক্ষক", "Register": "রেজিস্ট্রার", "Teacher": "শিক্ষক", "Student": "শিক্ষার্থী",
  // sign-in
  "One School. One System. One Connected Community.": "এক স্কুল। এক সিস্টেম। এক সংযুক্ত সম্প্রদায়।", "Username, email or student ID": "ইউজারনেম, ইমেইল বা শিক্ষার্থী আইডি", "Password": "পাসওয়ার্ড",
  "Sign in": "সাইন ইন", "Forgot your password? Ask the school office to reset it.": "পাসওয়ার্ড ভুলে গেছেন? স্কুল অফিসে রিসেট করতে বলুন।", "Incorrect username or password.": "ইউজারনেম বা পাসওয়ার্ড ভুল।",
  "Too many attempts. Try again in a few minutes.": "অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।", "Choose a new password": "নতুন পাসওয়ার্ড বাছুন", "Save password": "পাসওয়ার্ড সংরক্ষণ",
  "New password": "নতুন পাসওয়ার্ড", "Current (temporary) password": "বর্তমান (অস্থায়ী) পাসওয়ার্ড", "Change password": "পাসওয়ার্ড পরিবর্তন",
  // dashboards
  "Welcome,": "স্বাগতম,", "Latest result": "সর্বশেষ ফলাফল", "Homework due": "জমার বাকি বাড়ির কাজ", "Published results": "প্রকাশিত ফলাফল", "Latest notices": "সর্বশেষ নোটিশ",
  "No published results yet": "এখনও কোনো ফলাফল প্রকাশিত হয়নি", "To enter": "এন্ট্রি বাকি", "Needs correction": "সংশোধন দরকার", "With the Register": "রেজিস্ট্রারের কাছে", "Verified": "যাচাইকৃত",
  "Awaiting approval": "অনুমোদনের অপেক্ষায়", "Approved, to publish": "অনুমোদিত, প্রকাশ বাকি", "Published": "প্রকাশিত", "Students enrolled": "ভর্তিকৃত শিক্ষার্থী", "Awaiting review": "যাচাইয়ের অপেক্ষায়",
  // results / attendance / student pages
  "Published exam results": "প্রকাশিত পরীক্ষার ফলাফল", "No results published yet": "এখনও ফলাফল প্রকাশিত হয়নি", "You'll be notified when a result is published.": "ফলাফল প্রকাশিত হলে আপনাকে জানানো হবে।",
  "Download report card (PDF)": "রিপোর্ট কার্ড ডাউনলোড (PDF)", "Subject": "বিষয়", "Marks": "নম্বর", "Grade": "গ্রেড", "Absent": "অনুপস্থিত", "Present": "উপস্থিত", "Late": "বিলম্ব", "Date": "তারিখ", "Status": "অবস্থা",
  "No attendance recorded yet": "এখনও উপস্থিতি রেকর্ড হয়নি", "Class tests are not official exam results.": "ক্লাস টেস্ট অফিসিয়াল পরীক্ষার ফলাফল নয়।", "Shared by your teachers": "শিক্ষকদের শেয়ার করা",
  "No class tests shared yet": "এখনও কোনো ক্লাস টেস্ট শেয়ার হয়নি", "Passed": "উত্তীর্ণ", "Not passed": "অনুত্তীর্ণ", "Revised": "সংশোধিত",
  // homework / notices / messages
  "Your assignments": "আপনার অ্যাসাইনমেন্ট", "No homework": "কোনো বাড়ির কাজ নেই", "You're all caught up.": "সব শেষ করেছেন।", "To do": "করতে হবে", "Submitted": "জমা হয়েছে", "Overdue": "সময় পেরিয়েছে",
  "Submit": "জমা দিন", "Resubmit": "আবার জমা দিন", "Your answer": "আপনার উত্তর", "School noticeboard": "স্কুলের নোটিশ বোর্ড", "No notices": "কোনো নোটিশ নেই",
  "Direct messages, class groups and school channels": "সরাসরি বার্তা, ক্লাস গ্রুপ ও স্কুল চ্যানেল", "New message": "নতুন বার্তা", "Send": "পাঠান", "Write a message": "বার্তা লিখুন", "No messages yet": "এখনও কোনো বার্তা নেই",
  "Select a conversation": "একটি কথোপকথন বাছুন", "No conversations yet": "এখনও কোনো কথোপকথন নেই", "Read-only for students": "শিক্ষার্থীদের জন্য শুধু পড়া",
  "You can read this conversation but not post in it.": "আপনি এটি পড়তে পারবেন, কিন্তু লিখতে পারবেন না।", "Start conversation": "কথোপকথন শুরু", "Report message": "বার্তা রিপোর্ট",
  // status labels
  "Draft": "খসড়া", "Sent back": "ফেরত পাঠানো", "Under review": "যাচাই চলছে", "Correction requested": "সংশোধনের অনুরোধ", "Approved": "অনুমোদিত",
  // generic
  "Cancel": "বাতিল", "Close": "বন্ধ", "Save": "সংরক্ষণ", "Confirm": "নিশ্চিত করুন", "Load more": "আরও দেখুন", "Try again": "আবার চেষ্টা করুন", "Something went wrong": "কিছু ভুল হয়েছে", "You appear to be offline": "আপনি অফলাইন আছেন",
  "Not found": "পাওয়া যায়নি", "You don't have access to this": "এতে আপনার প্রবেশাধিকার নেই", "Nothing here yet": "এখানে এখনও কিছু নেই", "Appearance": "চেহারা", "Theme": "থিম", "Language": "ভাষা",
  "Match system": "সিস্টেম অনুযায়ী", "Light": "হালকা", "Dark": "গাঢ়", "Signed-in devices": "সাইন-ইন করা ডিভাইস", "Keyboard shortcuts": "কিবোর্ড শর্টকাট", "Customize": "কাস্টমাইজ", "Close tab": "ট্যাব বন্ধ",
  "Pinned": "পিন করা", "Pin to dock": "ডকে পিন করুন", "Unpin": "পিন সরান", "Charts": "চার্ট", "Table": "টেবিল", "Chart": "চার্ট",
};

export const t = (s: string): string => (current === "bn" ? bn[s] ?? s : s);
export const currentLang = (): Lang => current;

const Ctx = React.createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "en", setLang: () => {} });
export const useLang = () => React.useContext(Ctx);

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = React.useState<Lang>(current);
  current = lang; // set before children render so t() is correct on this pass
  const setLang = (l: Lang) => { current = l; try { localStorage.setItem("sos.lang", l); } catch { /* ignore */ } document.documentElement.lang = l; setLangState(l); };
  React.useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  return <Ctx.Provider value={{ lang, setLang }}><React.Fragment key={lang}>{children}</React.Fragment></Ctx.Provider>;
}
