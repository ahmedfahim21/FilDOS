/**
 * What the eval testbed contains. Everything is declared here and built by
 * `build.ts`: generated text, PDFs and DOCX (deterministic), pinned media
 * downloads (SHA-256 checked), and traps the indexer must skip. Paths are
 * relative to the testbed root and use '/'.
 *
 * The graph suite reads `GROUPS`, the index suite `EXPECT`; search and chat
 * queries live in `eval/queries/*.json` and reference these paths.
 */
import { FIXTURES } from './engineering';

export interface TextFile {
  path: string;
  content: string;
}

export interface PdfFile {
  path: string;
  pages: string[];
}

export interface DocxFile {
  path: string;
  paragraphs: string[];
}

export interface MediaFile {
  /** Where it lands in the testbed. */
  path: string;
  /** File name in the pinned dataset revision below. */
  source: string;
  sha256: string;
}

/** A Hugging Face dataset of small sample media, pinned to one revision. */
export const MEDIA_BASE =
  'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/542437c29cc5273cfd29e25c77696f2b349badd7';

// ---------------------------------------------------------------------------
// Generated long documents
// ---------------------------------------------------------------------------

const BIRDS = [
  'heron', 'kestrel', 'wren', 'finch', 'plover', 'curlew', 'swift', 'nuthatch', 'warbler', 'grebe',
  'bittern', 'lapwing', 'redstart', 'dipper', 'siskin', 'linnet', 'shrike', 'stonechat', 'merlin', 'osprey',
];
const HABITATS = ['reed beds', 'chalk downland', 'upland moor', 'estuary mud', 'beech woodland', 'shingle coast'];
const HABITS = ['forages at dawn', 'nests low in scrub', 'migrates south in September', 'feeds on insects', 'sings from high perches'];

/** One filler page of the field guide: plausible, varied, and about nothing in particular. */
function guidePage(n: number): string {
  const bird = BIRDS[n % BIRDS.length];
  const habitat = HABITATS[n % HABITATS.length];
  const habit = HABITS[(n * 7) % HABITS.length];
  const sentences: string[] = [`Page ${n}. Notes on the ${bird}.`];
  for (let i = 0; i < 18; i++) {
    const b = BIRDS[(n + i * 3) % BIRDS.length];
    const h = HABITATS[(n + i) % HABITATS.length];
    sentences.push(
      `The ${b} is often recorded in ${h}, where observers note that it ${HABITS[(n + i) % HABITS.length]} and ` +
        `keeps to territories of a few hectares through the breeding season.`,
    );
  }
  sentences.push(`Across ${habitat} the ${bird} ${habit}.`);
  return sentences.join(' ');
}

/** Facts placed on specific pages, so page-level and long-file recall is testable. */
const GUIDE_FACTS: Record<number, string> = {
  5: 'Identification key for owls. The tawny owl has dark eyes and a rounded head without ear tufts; its call is the familiar hoot heard in autumn.',
  120: 'The kingfisher dives from a low branch over clear streams, and the bright cobalt back flashes as it flies fast and straight along the riverbank.',
  190: 'Snowy owl winter range: in hard winters the snowy owl irrupts south into open farmland and coastal dunes, far from its Arctic tundra breeding grounds.',
};

const fieldGuide: string[] = Array.from({ length: 200 }, (_, i) => {
  const n = i + 1;
  return GUIDE_FACTS[n] ? `Page ${n}. ${GUIDE_FACTS[n]} ${guidePage(n + 1000)}` : guidePage(n);
});

const lease: string[] = [
  'Residential Lease Agreement. This lease is made between Harbour Lane Properties (the landlord) and the tenant named below for the flat at 14 Harbour Lane.',
  'Term. The tenancy begins on the first of March and runs for twelve months. Either party may end it with two months written notice after the first six months.',
  'Rent. Monthly rent is payable in advance on the first day of each month by bank transfer. Late payment after seven days incurs a fee.',
  'Deposit. A security deposit equal to five weeks of rent is held in a government-approved deposit protection scheme and returned within ten days of the end of the tenancy.',
  'Repairs and maintenance. The landlord keeps the structure, heating and plumbing in repair. The tenant reports defects promptly and keeps the flat clean.',
  'Alterations. The tenant must not paint, drill or alter fixtures without written consent from the landlord.',
  'Pets. The tenant may keep one cat or one small dog with the landlord\'s written consent. Any pet damage to carpets or doors is deducted from the deposit, and the flat must be professionally cleaned at the end of the tenancy.',
  'Subletting. The tenant must not sublet or take in lodgers without written permission.',
  'Signatures. Signed by the landlord and the tenant on the date shown above.',
];

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

const ENGINEERING_DOCS = new Set([
  'api-guide.md', 'deployment.md', 'CHANGELOG.md', 'architecture.md', 'onboarding.md', 'search-design.md',
  'cron-jobs.md', 'observability.md',
]);

export const TEXT_FILES: TextFile[] = [
  // Cooking
  {
    path: 'Home/Recipes/sourdough.md',
    content: `# Country sourdough

Mix 500 g bread flour, 350 g water and 100 g active starter. Rest 30 minutes, then add 10 g salt.
Stretch and fold every half hour for two hours. Bulk ferment until the dough has risen by half, then shape.
Proof overnight in the fridge. Bake in a preheated Dutch oven at 250°C for 20 minutes with the lid on,
then 25 minutes uncovered at 230°C until the crust is deep brown.`,
  },
  {
    path: 'Home/Recipes/weeknight-pasta.md',
    content: `# Weeknight tomato pasta

Boil salted water for the spaghetti. Meanwhile soften garlic in olive oil, add a tin of chopped tomatoes,
a pinch of chilli and simmer for fifteen minutes. Toss the drained pasta with the sauce, basil and parmesan.`,
  },
  {
    path: 'Home/Recipes/ডাল.txt',
    content: `মসুর ডালের রেসিপি। এক কাপ লাল মসুর ডাল ধুয়ে নিন। হলুদ, লবণ আর তিন কাপ পানি দিয়ে সেদ্ধ করুন।
পেঁয়াজ, রসুন আর শুকনো মরিচ তেলে ভেজে ডালে ফোড়ন দিন। গরম ভাতের সঙ্গে পরিবেশন করুন।`,
  },
  {
    path: 'Home/Recipes/gazpacho-receta.txt',
    content: `Receta de gazpacho andaluz. Tritura tomates maduros, pepino, pimiento verde, ajo, aceite de oliva,
vinagre de jerez y sal. Enfría en la nevera al menos dos horas y sirve muy frío en verano.`,
  },
  // Finance
  {
    path: 'Home/Finance/invoice-march.txt',
    content: `Invoice INV-20431 from Northwind Design to Harbour Studio.
Brand identity work, March: logo refinement 12 h, typography system 8 h, print collateral 6 h.
Total due: 2,340.00 EUR within 30 days. Bank transfer to IBAN DE89 3704 0044 0532 0130 00.`,
  },
  {
    path: 'Home/Finance/tax-notes.md',
    content: `# Tax return notes

Self-assessment deadline is 31 January. Gather invoices issued, expense receipts, the home-office
allowance calculation and pension contributions. Claim mileage for client visits at the approved rate.`,
  },
  {
    path: 'Home/Finance/orders-export.csv',
    content: `order_id,date,customer,amount_eur
ORD-48151623,2026-02-11,Harbour Studio,1250.00
ORD-48151624,2026-02-12,Lumen Labs,320.50
ORD-48151625,2026-02-14,Northwind Design,980.00
ORD-48151626,2026-02-15,Pinecrest Ltd,75.25`,
  },
  {
    path: 'Home/Finance/measurements.txt',
    content: Array.from({ length: 120 }, (_, i) => `${1000 + i} ${(i * 37) % 991} ${(i * 53) % 877} ${(i * 11) % 97}`).join('\n'),
  },
  // Travel
  {
    path: 'Home/Travel/lisbon-itinerary.md',
    content: `# Lisbon, five days

Day 1: arrive, tram 28 through Alfama, sunset at Miradouro da Senhora do Monte.
Day 2: Belém — the tower, the monastery and pastéis de nata. Day 3: day trip to Sintra's palaces.
Day 4: LX Factory and the riverside. Day 5: fado dinner, fly home in the evening.`,
  },
  {
    path: 'Home/Travel/packing-list.md',
    content: `# Packing list

Passport, boarding passes, travel adapter, light rain jacket, walking shoes, sunscreen, a reusable water
bottle and a small day pack. Download offline maps before the flight.`,
  },
  // Pets
  {
    path: 'Home/Pets/corgi-care.md',
    content: `# Caring for Biscuit (corgi)

Two walks a day, kibble measured to keep his weight down — corgis put on weight easily and it strains their
backs. Brush twice a week in spring when he sheds his undercoat. Vet check-up and vaccinations every March.`,
  },
  {
    path: 'Home/Pets/ملاحظات-القطط.txt',
    content: `ملاحظات عن رعاية القطط. تحتاج القطة إلى ماء نظيف وطعام متوازن وصندوق رمل نظيف كل يوم.
يجب تطعيم القطط سنويا وزيارة الطبيب البيطري عند ظهور أي مرض.`,
  },
  // Work (engineering notes; see projects/webapp for the codebase)
  {
    path: 'Work/bug-report-ERR.txt',
    content: `Bug: checkout fails with ERR_K7Q2LM after the payment provider times out.
Steps: add an item, pay by card, wait 30 s. The retry path never re-reads the session and the order is lost.`,
  },
  ...FIXTURES.filter((f) => /\.(md|txt)$/.test(f.name) && !ENGINEERING_DOCS.has(f.name)).map((f) => ({
    path: `Work/notes/${f.name}`,
    content: f.content.trim(),
  })),
  // A codebase: only its docs should be indexed.
  { path: 'projects/webapp/package.json', content: '{ "name": "webapp", "version": "1.0.0" }' },
  ...FIXTURES.filter((f) => ENGINEERING_DOCS.has(f.name)).map((f) => ({
    path: `projects/webapp/docs/${f.name}`,
    content: f.content.trim(),
  })),
  ...FIXTURES.filter((f) => !/\.(md|txt)$/.test(f.name)).map((f) => ({
    path: `projects/webapp/src/${f.name}`,
    content: f.content.trim(),
  })),
  // Traps: secrets and caches the indexer must never read.
  { path: 'Home/config/prod.env', content: 'DATABASE_URL=postgres://admin:hunter2@db.internal/prod\nSTRIPE_SECRET=sk_live_testbedonly' },
  { path: 'Home/config/credentials.json', content: '{ "client_secret": "testbed-not-a-real-secret" }' },
  {
    path: 'Home/keys/server.pem',
    content: '-----BEGIN PRIVATE KEY-----\nTESTBEDONLYTESTBEDONLYTESTBEDONLY\n-----END PRIVATE KEY-----',
  },
  { path: 'Home/build-cache/CACHEDIR.TAG', content: 'Signature: 8a477f597d28d172789f06886806bc55\n' },
  { path: 'Home/build-cache/cached-notes.txt', content: 'Intermediate build output that should never be indexed.' },
];

export const PDF_FILES: PdfFile[] = [
  { path: 'Home/Documents/lease-harbour-lane.pdf', pages: lease },
  { path: 'Home/Books/field-guide-birds.pdf', pages: fieldGuide },
];

export const DOCX_FILES: DocxFile[] = [
  {
    path: 'Home/Finance/Budget 2026.docx',
    paragraphs: [
      'Household budget for 2026.',
      'Rent 1,450 per month, groceries 420, utilities 180, transport 95, savings 600.',
      'Annual goals: build a three-month emergency fund and pay off the car loan by October.',
    ],
  },
];

export const MEDIA_FILES: MediaFile[] = [
  { path: 'Home/Pictures/corgi.jpg', source: 'corgi.jpg', sha256: '385413e29523ac6b777f8f23bcf72696119f9bfa364792036fc008700a1f6811' },
  { path: 'Home/Pictures/cats.jpg', source: 'cats.jpg', sha256: '5dddd2c5e0788ffbb37d8b8d9a30b41b83dfbc1cf486c0b214d5b3af09b283c3' },
  { path: 'Home/Pictures/tiger.jpg', source: 'tiger.jpg', sha256: '2ae007fbc16880208ba5fb699e52806cb0eadf41b12fc115cfd92b995b275fd8' },
  { path: 'Home/Pictures/butterfly.jpg', source: 'butterfly.jpg', sha256: 'cd7245ebb9409e65d97fafb88406c4663b6dec8b890a68b9129ae21f4759e46d' },
  { path: 'Home/Pictures/IMG_2041.jpg', source: 'savanna.jpg', sha256: 'c85aa8c28c7786b0c04cb919547925a6f294ce2cb9a3ca4e6fe0624e7bc2595f' },
  { path: 'Home/Travel/photos/beach.png', source: 'beach.png', sha256: '79c89a322cbf8ba4e17d1671f9c0122ece4198c9cdecdb14570d843126d67dfc' },
  { path: 'Home/Travel/photos/lake.png', source: 'moraine-lake.png', sha256: 'e386f18130bde8b4f21eee87dbf0ab7c1c31eace2f408da46d579eb5f0ad01b1' },
  { path: 'Home/Travel/photos/new-york.jpg', source: 'new-york.jpg', sha256: '8eec301d6c61741bd4041965788f2f9efda12722f3672d1605d4c01055405c8a' },
  { path: 'Home/Travel/photos/airport.jpg', source: 'airport.jpg', sha256: '04185cf407aef0af947d008fcc1ef18c023e510a85cdc4e762cbe57647cd57a8' },
  { path: 'Home/Recipes/bread.png', source: 'bread_small.png', sha256: '3a55bd3a9fea97fbe511a4b6f9c3c964f40fe67331cf1567d23ade2f6fb4fe63' },
  { path: 'Home/Finance/receipt.png', source: 'receipt.png', sha256: '331dcb9a02ab6607331393f3c786d7972cbf3994cac1f05fb2fc741aeaeb6849' },
  {
    path: 'Home/Desktop/Screenshot 2026-10-01 at 14.22.10.png',
    source: 'invoice-with-table.png',
    sha256: '85078a5caf263b044af160810247dfb898964c7f02b0c75fe77021116502c961',
  },
  { path: 'Home/Music/speech-kennedy.wav', source: 'jfk.wav', sha256: 'aa81c2552465568567e670f3823117e633900d16bd6202346a72f3c8464c74c8' },
  { path: 'Home/Music/dog-recording.wav', source: 'dog_barking.wav', sha256: 'ae44f1ad295b427f53d119df3216d86fbfbaad3a9a781edd675ce419cdc34665' },
  { path: 'Home/Music/piano.wav', source: 'piano.wav', sha256: 'cdea09221a97a31ab6e6d0fdd620cd539243a740e57512938f0fd6a8c3544954' },
  { path: 'Home/Movies/clip-0412.mp4', source: 'sea-turtle.mp4', sha256: '7ff15892d7fe47454892f96af058909a8fd44dad98e89ad8c0a6993b3fde86fd' },
  { path: 'Home/Movies/courtroom.mp4', source: 'courtroom.mp4', sha256: 'efeb2169ce28149dcf00b1a6ff3db26e2f1de018be077d650e895724d9b2ebdc' },
];

/** A dataset-like folder: hundreds of machine-named frames, not the user's own pictures. */
export const DATASET = { dir: 'Home/datasets/run-07/frames', count: 220, name: (i: number) => `frame_${String(i).padStart(5, '0')}.png` };

/** An exact copy, under another name, to check duplicate handling. */
export const DUPLICATES: { from: string; to: string }[] = [
  { from: 'Home/Pictures/corgi.jpg', to: 'Home/Pictures/corgi copy.jpg' },
];

// ---------------------------------------------------------------------------
// Expectations
// ---------------------------------------------------------------------------

export interface IndexExpectations {
  /** Paths (or folder prefixes ending in '/') that must never be indexed, with why. */
  skip: { path: string; reason: string }[];
  /** Paths that must be indexed (searchable). */
  index: string[];
  /** PDFs whose page structure must survive extraction. */
  pages: { path: string; count: number }[];
  /** Mostly-numeric text: keyword-searchable, but no vector. */
  keywordOnly: string[];
}

export const EXPECT: IndexExpectations = {
  skip: [
    { path: 'Home/config/prod.env', reason: 'secret' },
    { path: 'Home/config/credentials.json', reason: 'secret' },
    { path: 'Home/keys/server.pem', reason: 'secret' },
    { path: 'Home/build-cache/', reason: 'CACHEDIR.TAG' },
    { path: 'Home/datasets/', reason: 'dataset' },
    { path: 'projects/webapp/src/', reason: 'codebase source' },
    { path: 'projects/webapp/package.json', reason: 'codebase source' },
  ],
  index: [
    ...TEXT_FILES.map((f) => f.path).filter(
      (p) =>
        !p.startsWith('Home/config/') &&
        !p.startsWith('Home/keys/') &&
        !p.startsWith('Home/build-cache/') &&
        !p.startsWith('projects/webapp/src/') &&
        p !== 'projects/webapp/package.json',
    ),
    ...PDF_FILES.map((f) => f.path),
    ...DOCX_FILES.map((f) => f.path),
    ...MEDIA_FILES.map((f) => f.path),
  ],
  pages: PDF_FILES.map((f) => ({ path: f.path, count: f.pages.length })),
  keywordOnly: ['Home/Finance/measurements.txt'],
};

/** Labelled topical groups for the graph suite: files in a group should link and cluster together. */
export const GROUPS: Record<string, string[]> = {
  cooking: [
    'Home/Recipes/sourdough.md',
    'Home/Recipes/weeknight-pasta.md',
    'Home/Recipes/ডাল.txt',
    'Home/Recipes/gazpacho-receta.txt',
    'Home/Recipes/bread.png',
  ],
  finance: [
    'Home/Finance/invoice-march.txt',
    'Home/Finance/tax-notes.md',
    'Home/Finance/Budget 2026.docx',
    'Home/Finance/receipt.png',
    'Home/Desktop/Screenshot 2026-10-01 at 14.22.10.png',
  ],
  travel: [
    'Home/Travel/lisbon-itinerary.md',
    'Home/Travel/packing-list.md',
    'Home/Travel/photos/beach.png',
    'Home/Travel/photos/airport.jpg',
  ],
  animals: [
    'Home/Pets/corgi-care.md',
    'Home/Pets/ملاحظات-القطط.txt',
    'Home/Pictures/corgi.jpg',
    'Home/Pictures/cats.jpg',
    'Home/Pictures/tiger.jpg',
  ],
  engineering: [
    'projects/webapp/docs/deployment.md',
    'projects/webapp/docs/architecture.md',
    'projects/webapp/docs/observability.md',
    'Work/bug-report-ERR.txt',
    'Work/notes/performance-analysis.txt',
  ],
};
