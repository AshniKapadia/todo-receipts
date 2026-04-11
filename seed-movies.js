// Seed script — fetches posters from iTunes and posts to the app API
// Usage: node seed-movies.js [BASE_URL]
// Default BASE_URL: http://localhost:3000
// Example for Railway: node seed-movies.js https://ashnisreceipts.up.railway.app

const BASE_URL = process.argv[2] || 'http://localhost:3000';

const ENGLISH = [
  "Daddio", "Coyote Ugly", "The Godfather", "The Godfather Part II",
  "Aliens in the Attic", "Monsters vs Aliens", "Zathura",
  "Jumanji", "Jurassic Park", "Dead Poets Society", "Imagine Me & You",
  "Goodrich", "We Live in Time", "Whiplash", "The Other Woman",
  "Crazy Stupid Love", "Life as We Know It", "Friends with Benefits",
  "Set It Up", "Just Go with It", "Sleeping with Other People",
  "Moneyball", "The Sandlot", "Margin Call", "The Big Short",
  "The Founder", "The Social Network", "Worth", "The Imitation Game",
  "Freedom Writers",
  "The Inventor Out for Blood in Silicon Valley",
  "The Devil Wears Prada", "We Bought a Zoo",
  "Ice Age", "Ice Age The Meltdown", "Ice Age Dawn of the Dinosaurs",
  "The Last Song", "Ramona and Beezus", "Spider-Man",
  "Zootopia", "Zootopia 2",
  "Inside Out", "Inside Out 2",
  "Bedtime Stories", "Brave", "Wreck-It Ralph",
  "Night at the Museum", "Night at the Museum Battle of the Smithsonian",
  "Bolt", "Brother Bear", "Brother Bear 2",
  "The Emperor's New Groove", "Kronk's New Groove",
  "Alvin and the Chipmunks", "Alvin and the Chipmunks The Squeakquel", "Alvin and the Chipmunks Chipwrecked",
  "Monsters Inc", "Monsters University",
  "Geek Charming", "Big Hero 6", "The Princess and the Frog",
  "The Pacifier", "Frozen", "Frozen 2", "Moana", "Moana 2",
  "Ella Enchanted", "How to Build a Better Boy", "Den Brother",
  "Cloud Nine", "High School Musical", "High School Musical 2", "High School Musical 3 Senior Year",
  "WALL-E", "My Big Fat Greek Wedding", "Soul",
  "Percy Jackson & the Olympians The Lightning Thief",
  // Avengers / MCU up to Endgame
  "Iron Man", "Iron Man 2", "Thor",
  "Captain America The First Avenger", "The Avengers",
  "Iron Man 3", "Thor The Dark World",
  "Captain America The Winter Soldier", "Guardians of the Galaxy",
  "Avengers Age of Ultron", "Ant-Man", "Captain America Civil War",
  "Doctor Strange", "Guardians of the Galaxy Vol 2",
  "Spider-Man Homecoming", "Thor Ragnarok", "Black Panther",
  "Avengers Infinity War", "Ant-Man and the Wasp",
  "Captain Marvel", "Avengers Endgame",
  "Deadpool", "Tangled", "Ratatouille",
  "Tinker Bell", "Tinker Bell and the Lost Treasure",
  "Avalon High", "Finding Dory", "Finding Nemo",
  "The Fox and the Hound",
  "Toy Story", "Toy Story 2", "Toy Story 3",
  "Frenemies", "Zapped", "Let It Shine", "Lemonade Mouth",
  "Starstruck", "Gnomeo and Juliet",
  "Rio", "Rio 2",
  "Princess Protection Program", "Camp Rock", "Camp Rock 2 The Final Jam",
  "Minutemen", "Bridge to Terabithia", "Up",
  "A Bug's Life", "The Incredibles", "Incredibles 2",
  "Cars", "Cars 2", "Cars 3",
  "Coco", "Luca",
  "The Wolf of Wall Street", "Hidden Figures", "Interstellar", "Barbie",
  "Catch Me If You Can", "Now You See Me",
  "Jobs", "The House", "Nine Lives", "Evan Almighty",
  "Kung Fu Panda", "Kung Fu Panda 2", "Kung Fu Panda 3",
  "Wonka", "Date Night", "Valentine's Day",
  "A Man Called Otto", "Life of Pi", "27 Dresses", "Made of Honor",
  "Notting Hill", "Love and Other Drugs", "The Help", "The Croods",
  "Crazy Rich Asians", "Gran Turismo", "Big Daddy",
  "Happiest Season", "Anyone But You", "A Nice Indian Boy",
  "Rise of the Planet of the Apes",
  "Bad Moms", "A Bad Moms Christmas",
  "The Upside", "The Martian", "La La Land", "Molly's Game",
  "Ready Player One", "Ender's Game",
  "The Hunger Games", "The Hunger Games Catching Fire",
  "Divergent", "Chef", "Booksmart",
  "The Perks of Being a Wallflower", "Love Simon",
  "Beauty and the Beast", "How to Train Your Dragon",
  "Burnt", "Flamin Hot",
  "How to Lose a Guy in 10 Days", "Bride Wars",
  "Home Alone", "Home Alone 2 Lost in New York",
  "The Santa Clause", "The Santa Clause 2", "The Santa Clause 3 The Escape Clause",
  "Horton Hears a Who", "The Grinch",
  "The Family Stone", "The Holiday", "Four Christmases",
  "Love Hard", "Elf", "Wine Country", "Baby Mama", "Mean Girls",
  "Megamind", "Free Guy", "Flushed Away", "Home", "Red Notice",
  "Turbo", "The Proposal",
];

const HINDI = [
  "3 Idiots", "Taare Zameen Par", "PK", "Swades", "Dunki",
  "Zindagi Na Milegi Dobara", "Yeh Jawaani Hai Deewani",
  "Dil Dhadakne Do", "Jab We Met", "Student of the Year",
  "Ae Dil Hai Mushkil", "Kapoor and Sons", "Khoobsurat", "Wake Up Sid",
  "Bachna Ae Haseeno", "Band Baaja Baaraat", "Main Hoon Na",
  "Kabhi Alvida Naa Kehna", "Dilwale Dulhania Le Jayenge",
  "Kabhi Khushi Kabhie Gham", "Om Shanti Om", "Pyaar Impossible",
  "Jab Harry Met Sejal", "Dilwale", "Happy New Year",
  "Chennai Express", "Ra.One", "Chak De India", "Kuch Kuch Hota Hai",
  "Saiyaara", "Shehzada", "Dangal", "Hum Tum",
  "Rab Ne Bana Di Jodi", "Crew", "Dostana",
  "Ladies vs Ricky Bahl", "Animal", "Ta Ra Rum Pum",
  "Dum Laga Ke Haisha", "Jolly LLB 3", "Rocket Singh",
  "Gangubai Kathiawadi", "Tezaab", "Lagaan", "Andhadhun",
  "Badmaash Company", "Delhi 6", "I Hate Luv Storys", "Rockstar",
  "Jab Tak Hai Jaan", "Goliyon Ki Rasleela Ram-Leela", "2 States",
  "English Vinglish", "Kabir Singh", "Highway",
  "Rocky Aur Rani Kii Prem Kahaani", "Brahmastra", "Shaandaar",
];

async function searchItunes(title, isHindi = false) {
  const country = isHindi ? 'in' : 'us';
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(title)}&media=movie&limit=3&country=${country}`;
  const res = await fetch(url);
  const data = await res.json();
  const result = data.results?.[0];
  if (!result?.artworkUrl100) return null;
  return {
    title: result.trackName || title,
    posterUrl: result.artworkUrl100.replace('100x100bb', '400x600bb'),
  };
}

async function addMovie(title, posterUrl, language) {
  const res = await fetch(`${BASE_URL}/api/movies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, posterUrl, language }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function seed(movies, language) {
  for (const title of movies) {
    try {
      const result = await searchItunes(title, language === 'hindi');
      if (!result) {
        console.log(`  ✗ not found: ${title}`);
        continue;
      }
      await addMovie(result.title, result.posterUrl, language);
      console.log(`  ✓ ${result.title}`);
      await new Promise(r => setTimeout(r, 120)); // rate limit
    } catch (e) {
      console.log(`  ✗ error: ${title} — ${e.message}`);
    }
  }
}

async function main() {
  // Check if already seeded
  const check = await fetch(`${BASE_URL}/api/movies`);
  const existing = await check.json();
  if (existing.movies?.length > 0) {
    console.log(`Already seeded (${existing.movies.length} movies). Skipping.`);
    console.log('Delete all movies first if you want to re-seed.');
    return;
  }

  console.log(`Seeding to ${BASE_URL}...\n`);
  console.log(`── ENGLISH (${ENGLISH.length} titles) ──`);
  await seed(ENGLISH, 'english');
  console.log(`\n── HINDI (${HINDI.length} titles) ──`);
  await seed(HINDI, 'hindi');
  console.log('\nDone!');
}

main().catch(console.error);
