// Dashboard welcome / motivational data.
//
// The dashboard wants three things:
//   1. A time-of-day greeting ("Good morning") based on the viewer's hour
//   2. A fun emoji that rotates every day so the page feels alive
//   3. A motivational quote that changes every day
//
// We generate these deterministically from YYYY-MM-DD so every user sees the
// same daily refresh, and the server can optionally swap the quote for a
// Claude-generated one if ANTHROPIC_API_KEY is configured (see
// app/api/inspiration/route.ts).

export interface Inspiration {
  greeting: string;
  emoji: string;
  emojiLabel: string;
  quote: string;
  author: string;
  /** "claude" if the quote was generated live, "curated" if it came from the fallback list. */
  source: "claude" | "curated";
  dateKey: string; // YYYY-MM-DD used to seed the selection
}

// Each entry is [emoji, short descriptive label]. The label is used as the
// accessible aria-label so screen readers aren't just told "emoji".
const EMOJIS: [string, string][] = [
  ["🚀", "Rocket launching"],
  ["💪", "Flexed bicep"],
  ["🌟", "Glowing star"],
  ["🔥", "Fire"],
  ["⚡", "High voltage"],
  ["🎯", "Target hit"],
  ["🌈", "Rainbow"],
  ["☀️", "Sunshine"],
  ["🌻", "Sunflower"],
  ["🦅", "Eagle"],
  ["🐉", "Dragon"],
  ["🧠", "Brain"],
  ["💎", "Gem"],
  ["🏆", "Trophy"],
  ["🎉", "Party popper"],
  ["✨", "Sparkles"],
  ["🌊", "Ocean wave"],
  ["🎨", "Artist palette"],
  ["📈", "Chart trending up"],
  ["🧘", "Meditation"],
  ["🛠️", "Tools"],
  ["⭐", "Star"],
  ["🏔️", "Mountain"],
  ["🪴", "Growing plant"],
  ["🍀", "Four-leaf clover"],
  ["🌸", "Cherry blossom"],
  ["🧩", "Puzzle piece"],
  ["🦋", "Butterfly"],
  ["🎼", "Musical notes"],
  ["🎈", "Balloon"],
];

// 52 quotes — roughly one per week so nothing repeats for a whole year even
// with a single rotation offset.
const QUOTES: { quote: string; author: string }[] = [
  { quote: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { quote: "Quality is not an act, it is a habit.", author: "Aristotle" },
  { quote: "Done is better than perfect.", author: "Sheryl Sandberg" },
  { quote: "Whether you think you can or you think you can't, you're right.", author: "Henry Ford" },
  { quote: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
  { quote: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { quote: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
  { quote: "Fall seven times, stand up eight.", author: "Japanese Proverb" },
  { quote: "A year from now you may wish you had started today.", author: "Karen Lamb" },
  { quote: "Small daily improvements are the key to staggering long-term results.", author: "Robin Sharma" },
  { quote: "Discipline equals freedom.", author: "Jocko Willink" },
  { quote: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
  { quote: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
  { quote: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
  { quote: "If you want to go fast, go alone. If you want to go far, go together.", author: "African Proverb" },
  { quote: "Opportunities don't happen. You create them.", author: "Chris Grosser" },
  { quote: "Your limitation—it's only your imagination.", author: "Unknown" },
  { quote: "Dream it. Wish it. Do it.", author: "Unknown" },
  { quote: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
  { quote: "Great things never come from comfort zones.", author: "Unknown" },
  { quote: "Push yourself, because no one else is going to do it for you.", author: "Unknown" },
  { quote: "Success doesn't just find you. You have to go out and get it.", author: "Unknown" },
  { quote: "Wake up with determination. Go to bed with satisfaction.", author: "Unknown" },
  { quote: "Hard work beats talent when talent doesn't work hard.", author: "Tim Notke" },
  { quote: "Little by little, one travels far.", author: "J.R.R. Tolkien" },
  { quote: "Be so good they can't ignore you.", author: "Steve Martin" },
  { quote: "Action is the foundational key to all success.", author: "Pablo Picasso" },
  { quote: "Energy and persistence conquer all things.", author: "Benjamin Franklin" },
  { quote: "The expert in anything was once a beginner.", author: "Helen Hayes" },
  { quote: "Start where you are. Use what you have. Do what you can.", author: "Arthur Ashe" },
  { quote: "Everything you've ever wanted is on the other side of fear.", author: "George Addair" },
  { quote: "Do what you can with all you have, wherever you are.", author: "Theodore Roosevelt" },
  { quote: "Progress, not perfection.", author: "Unknown" },
  { quote: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
  { quote: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { quote: "Courage is resistance to fear, mastery of fear—not absence of fear.", author: "Mark Twain" },
  { quote: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { quote: "Either you run the day or the day runs you.", author: "Jim Rohn" },
  { quote: "The only limit to our realization of tomorrow is our doubts of today.", author: "Franklin D. Roosevelt" },
  { quote: "Don't be afraid to give up the good to go for the great.", author: "John D. Rockefeller" },
  { quote: "Act as if what you do makes a difference. It does.", author: "William James" },
  { quote: "Stay hungry. Stay foolish.", author: "Stewart Brand" },
  { quote: "The harder you work for something, the greater you'll feel when you achieve it.", author: "Unknown" },
  { quote: "You miss 100% of the shots you don't take.", author: "Wayne Gretzky" },
  { quote: "If you want something you've never had, you must be willing to do something you've never done.", author: "Thomas Jefferson" },
  { quote: "Every accomplishment starts with the decision to try.", author: "John F. Kennedy" },
  { quote: "Motivation gets you going, but discipline keeps you growing.", author: "John C. Maxwell" },
  { quote: "The future depends on what you do today.", author: "Mahatma Gandhi" },
  { quote: "Don't let yesterday take up too much of today.", author: "Will Rogers" },
  { quote: "Inhale the future, exhale the past.", author: "Unknown" },
  { quote: "What we think, we become.", author: "Buddha" },
  { quote: "You are never too old to set another goal or to dream a new dream.", author: "C.S. Lewis" },
  { quote: "A smooth sea never made a skilled sailor.", author: "Franklin D. Roosevelt" },
];

/** Local YYYY-MM-DD for the given Date, or today if not provided. */
export function toDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Simple hash → non-negative integer. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Time-of-day greeting based on the current hour in the viewer's timezone. */
export function greetingForHour(hour: number): string {
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

/** Deterministic pick from the curated quote list for the given date. */
export function pickCuratedQuote(dateKey: string): { quote: string; author: string } {
  const idx = hash(dateKey) % QUOTES.length;
  return QUOTES[idx];
}

/** Deterministic emoji for the given date. */
export function pickEmoji(dateKey: string): { emoji: string; label: string } {
  // Offset by 7 so the emoji rotation doesn't track the quote rotation 1:1.
  const idx = (hash(dateKey) + 7) % EMOJIS.length;
  const [emoji, label] = EMOJIS[idx];
  return { emoji, label };
}

// Default rotation for "house" attributions when the quote has no real
// author (Unknown / proverb). Andrei is prioritized 2:1 over Management.
const HOUSE_ATTRIBUTIONS = ["Andrei", "Andrei", "Management"];

// What to print after "a friendly reminder from …" on the dashboard hero.
//
// Rules:
//   AI-generated quote (source=claude)  → "Anthropic"
//   Real author (not Unknown / Proverb) → the author's name
//   Unknown / proverb / fallback        → daily rotation between Andrei and
//                                         Management (Andrei 2x more often)
//
// The deterministic hash of dateKey is reused so the rotation is stable for
// a full day.
export function attributionFor(insp: Pick<Inspiration, "author" | "source" | "dateKey">): string {
  if (insp.source === "claude") return "Anthropic";
  const author = (insp.author ?? "").trim();
  if (!author) return rotatingHouse(insp.dateKey);
  const lower = author.toLowerCase();
  if (lower === "unknown" || lower === "anonymous" || lower.includes("proverb")) {
    return rotatingHouse(insp.dateKey);
  }
  return author;
}

function rotatingHouse(dateKey: string): string {
  const idx = hash(dateKey) % HOUSE_ATTRIBUTIONS.length;
  return HOUSE_ATTRIBUTIONS[idx];
}

/** Build a full curated inspiration object for today (no API calls). */
export function curatedInspiration(date: Date = new Date()): Inspiration {
  const dateKey = toDateKey(date);
  const { emoji, label } = pickEmoji(dateKey);
  const { quote, author } = pickCuratedQuote(dateKey);
  return {
    greeting: greetingForHour(date.getHours()),
    emoji,
    emojiLabel: label,
    quote,
    author,
    source: "curated",
    dateKey,
  };
}
