// Social Media Post Helper — content library.
//
// Starter templates, hashtag packs, image specs, and brand voice notes
// for Advocate of SHALOM. Everything here is a first pass — refine as
// Elyse's team uses it and finds what actually reads well. Edit this
// file to add / remove / reword; changes appear immediately after a
// git commit + deploy.
//
// Convention: use [BRACKETS] in template bodies to mark fill-in slots.
// That way the writer can quickly scan for what needs to be replaced
// before posting.

export interface PostTemplate {
  id: string;
  name: string;
  purpose: string;
  body: string;
  suggestedHashtagPack?: string;
  suggestedImageSpec?: string;
}

export interface HashtagPack {
  id: string;
  name: string;
  description: string;
  tags: string[];
}

export interface ImageSpec {
  id: string;
  platform: string;
  useCase: string;
  dimensions: string;
  aspectRatio: string;
  notes?: string;
}

export interface BrandVoice {
  toneWords: string[];
  dos: string[];
  donts: string[];
}

export const brandVoice: BrandVoice = {
  toneWords: ['warm', 'grounded', 'direct', 'honest', 'restorative', 'hopeful'],
  dos: [
    'Lead with people, not statistics.',
    'Name the outcome — release, employment, reunification, expungement.',
    'Speak to the reader as a neighbor, not an audience.',
    'Be specific: places, dates, actions taken.',
    'Point to something they can do — a link, an RSVP, a share.',
  ],
  donts: [
    "Don't use victim language ('ex-con,' 'felon,' 'inmate') — people are more than a record.",
    "Don't dump statistics without a story to anchor them.",
    "Don't lean on fear or shock — this work is about second chances, not moral panic.",
    "Don't over-promise outcomes we can't guarantee.",
    "Don't use jargon ('CJI reform,' 'reentry pipeline') without translating it.",
  ],
};

export const templates: PostTemplate[] = [
  {
    id: 'client-win',
    name: 'Client Win Spotlight',
    purpose: 'Celebrate a specific outcome. Use with permission.',
    body: `Big news for one of our neighbors 🎉

[Name or "One of our clients"] just [outcome — e.g., "had their record expunged," "started their new job at [Company]," "was reunified with their family"].

None of this happens by accident. It takes months of paperwork, tough conversations, and someone in your corner who won't give up.

That's the work. That's SHALOM.

[Optional: link to donate / volunteer / learn more]`,
    suggestedHashtagPack: 'core-advocacy',
    suggestedImageSpec: 'ig-feed-square',
  },
  {
    id: 'resource-share',
    name: 'Resource Share',
    purpose: 'Point people to a specific tool, service, or program.',
    body: `Sharing this in case someone in your circle needs it 👇

[Resource name] — [one-sentence what it is].

Who it's for: [audience — e.g., "anyone with a record trying to secure housing in Mesa County"].
How to access: [link, phone number, or where to walk in].

Save this post. Send it to someone who could use it.`,
    suggestedHashtagPack: 'community',
    suggestedImageSpec: 'ig-feed-portrait',
  },
  {
    id: 'stat-with-story',
    name: 'Statistic + Story',
    purpose: 'Frame a data point with a person, not a headline.',
    body: `[Statistic — e.g., "Nearly 2 out of 3 people released from prison in Colorado are rearrested within 3 years."]

That number isn't a life sentence. It's a support gap.

Housing. Work. Someone who picks up the phone at 9pm when a landlord backs out.

[Optional: "That's what we do — one neighbor at a time." or a specific example.]

[Link to more info or ways to help]`,
    suggestedHashtagPack: 'awareness',
    suggestedImageSpec: 'ig-feed-square',
  },
  {
    id: 'event-promo',
    name: 'Event Promo',
    purpose: 'Invite people to something specific with a clear ask.',
    body: `Come join us 📅

[Event name] — [one-line what it is].

🗓 [Day, date, time]
📍 [Location or "Online — link below"]
👥 [Who it's for — e.g., "Families, advocates, and anyone curious about our work"]

[One sentence on why they should come.]

RSVP or details: [link]`,
    suggestedHashtagPack: 'local',
    suggestedImageSpec: 'ig-story',
  },
  {
    id: 'mission-moment',
    name: 'Mission Moment',
    purpose: 'A short reminder of why this work exists. Use sparingly.',
    body: `Everyone deserves a real second chance.

Not just a legal one — a practical one. With housing. With work. With people who show up.

That's Advocate of SHALOM. That's the whole point.

[Optional: "Learn more at advocateofshalom.com" or a specific call to action.]`,
    suggestedHashtagPack: 'core-advocacy',
    suggestedImageSpec: 'ig-feed-square',
  },
];

export const hashtagPacks: HashtagPack[] = [
  {
    id: 'core-advocacy',
    name: 'Core Advocacy',
    description: 'Broad justice + second-chance themes.',
    tags: [
      '#SecondChances',
      '#RestorativeJustice',
      '#CriminalJusticeReform',
      '#Reentry',
      '#JusticeMatters',
    ],
  },
  {
    id: 'local',
    name: 'Local (Grand Junction / Colorado)',
    description: 'Geographic reach in Mesa County and the Western Slope.',
    tags: [
      '#GrandJunction',
      '#MesaCounty',
      '#WesternSlope',
      '#ColoradoNonprofit',
      '#GJCommunity',
    ],
  },
  {
    id: 'community',
    name: 'Community + Faith',
    description: 'Neighbor-to-neighbor and faith-in-action framing.',
    tags: [
      '#StrongerTogether',
      '#Neighbors',
      '#FaithInAction',
      '#CommunityCare',
      '#ShalomInAction',
    ],
  },
  {
    id: 'awareness',
    name: 'Awareness + Reform',
    description: 'Higher-lift topics for policy or systemic posts.',
    tags: [
      '#EndMassIncarceration',
      '#ProbationReform',
      '#ExpungementMatters',
      '#SupportNotStigma',
      '#PeopleNotPrisoners',
    ],
  },
];

export const imageSpecs: ImageSpec[] = [
  {
    id: 'ig-feed-square',
    platform: 'Instagram',
    useCase: 'Feed post (square)',
    dimensions: '1080 × 1080 px',
    aspectRatio: '1:1',
    notes: 'Safe default. Great for quotes and single-photo posts.',
  },
  {
    id: 'ig-feed-portrait',
    platform: 'Instagram',
    useCase: 'Feed post (portrait — takes more real estate)',
    dimensions: '1080 × 1350 px',
    aspectRatio: '4:5',
    notes: 'Best engagement in the feed. Use for statement posts.',
  },
  {
    id: 'ig-story',
    platform: 'Instagram',
    useCase: 'Story / Reel cover',
    dimensions: '1080 × 1920 px',
    aspectRatio: '9:16',
    notes: 'Keep text inside the middle ~1200px vertical safe zone — IG UI overlaps top and bottom ~250px each.',
  },
  {
    id: 'fb-feed',
    platform: 'Facebook',
    useCase: 'Feed post',
    dimensions: '1200 × 630 px',
    aspectRatio: '1.91:1',
    notes: 'Same aspect as LinkedIn — one asset works for both.',
  },
  {
    id: 'fb-cover',
    platform: 'Facebook',
    useCase: 'Page cover photo',
    dimensions: '851 × 315 px',
    aspectRatio: '2.7:1',
    notes: 'Keep key visuals centered — edges get cropped on mobile.',
  },
  {
    id: 'li-feed',
    platform: 'LinkedIn',
    useCase: 'Feed post',
    dimensions: '1200 × 627 px',
    aspectRatio: '1.91:1',
  },
];
