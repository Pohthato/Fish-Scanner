import { SampleCatch } from '../types';

// Helper to create an SVG data URL with fish silhouette and measurement backdrop
function createSampleFishSvg(
  species: string,
  accentColor: string,
  patternColor: string,
  bodyType: 'flat' | 'torpedo' | 'bass' | 'ray' | 'sculpin',
  referenceLabel: string
): string {
  let bodyPath = '';
  let finsPath = '';

  if (bodyType === 'flat') {
    // Halibut
    bodyPath = 'M 40 100 C 60 40, 160 30, 220 70 C 260 90, 270 100, 300 100 L 330 80 L 325 100 L 330 120 L 300 100 C 270 100, 260 110, 220 130 C 160 170, 60 160, 40 100 Z';
    finsPath = 'M 100 45 Q 160 35 220 55 M 100 155 Q 160 165 220 145 M 55 92 A 4 4 0 1 1 55 93 M 65 88 A 4 4 0 1 1 65 89';
  } else if (bodyType === 'sculpin') {
    // Scorpionfish / Sculpin with venomous dorsal spines
    bodyPath = 'M 40 110 C 60 70, 110 65, 170 85 C 220 100, 260 115, 290 115 L 320 95 L 315 115 L 320 135 L 290 115 C 250 120, 200 145, 150 145 C 90 145, 55 135, 40 110 Z';
    finsPath = 'M 85 70 L 95 40 L 105 68 L 115 38 L 125 68 L 135 38 L 145 70 L 160 45 L 175 75 M 48 98 A 5 5 0 1 1 48 99';
  } else if (bodyType === 'ray') {
    // Electric / Stingray
    bodyPath = 'M 70 100 C 70 45, 180 40, 190 100 C 180 160, 70 155, 70 100 Z M 190 100 L 310 100 L 325 90 L 325 110 Z';
    finsPath = 'M 95 85 A 3 3 0 1 1 95 86 M 95 115 A 3 3 0 1 1 95 116';
  } else if (bodyType === 'torpedo') {
    // White Seabass / Salmon / Barracuda
    bodyPath = 'M 35 100 C 65 65, 155 60, 230 80 C 265 90, 280 100, 305 100 L 340 75 L 330 100 L 340 125 L 305 100 C 280 100, 265 110, 230 120 C 155 140, 65 135, 35 100 Z';
    finsPath = 'M 130 68 Q 165 48 200 70 M 130 132 Q 165 145 190 130 M 48 94 A 4 4 0 1 1 48 95';
  } else {
    // Bass (Calico, Giant Sea Bass, Largemouth)
    bodyPath = 'M 40 105 C 70 55, 140 50, 210 75 C 255 90, 275 102, 300 105 L 335 85 L 325 105 L 335 125 L 300 105 C 275 108, 250 145, 190 145 C 130 145, 65 135, 40 105 Z';
    finsPath = 'M 110 60 L 120 42 L 130 60 L 142 42 L 155 62 Q 190 55 220 78 M 52 95 A 4 4 0 1 1 52 96';
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 200" width="100%" height="100%">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0f172a"/>
        <stop offset="100%" stop-color="#1e293b"/>
      </linearGradient>
      <linearGradient id="fishGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${accentColor}"/>
        <stop offset="100%" stop-color="${patternColor}"/>
      </linearGradient>
    </defs>
    <rect width="380" height="200" fill="url(#bg)"/>
    <!-- Measuring Ruler Grid / Deck lines -->
    <line x1="20" y1="180" x2="360" y2="180" stroke="#475569" stroke-width="2"/>
    ${Array.from({ length: 18 })
      .map((_, i) => `<line x1="${20 + i * 20}" y1="175" x2="${20 + i * 20}" y2="180" stroke="#64748b" stroke-width="${i % 5 === 0 ? '2' : '1'}"/>`)
      .join('')}
    <!-- Reference tag -->
    <rect x="20" y="15" width="160" height="22" rx="4" fill="#334155" opacity="0.9"/>
    <text x="28" y="30" font-family="system-ui, sans-serif" font-size="11" fill="#94a3b8" font-weight="600">REF: ${referenceLabel}</text>
    <!-- Fish Silhouette -->
    <path d="${bodyPath}" fill="url(#fishGrad)" stroke="#38bdf8" stroke-width="1.5"/>
    <path d="${finsPath}" fill="none" stroke="#e2e8f0" stroke-width="2"/>
    <!-- Measurement caliper guides -->
    <line x1="35" y1="35" x2="35" y2="175" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="3,3"/>
    <line x1="335" y1="35" x2="335" y2="175" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="3,3"/>
    <text x="35" y="195" font-family="system-ui" font-size="10" fill="#f59e0b">◄ Snout (0")</text>
    <text x="305" y="195" font-family="system-ui" font-size="10" fill="#f59e0b">Tail Tip ►</text>
    <!-- Species badge -->
    <text x="360" y="30" text-anchor="end" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#f8fafc">${species}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const SAMPLE_CATCHES: SampleCatch[] = [
  {
    id: 'sample-halibut-undersized',
    title: 'California Halibut (17.5 in)',
    subtitle: 'UNDERSIZED — Must Release (Min 22")',
    speciesName: 'California Halibut',
    scenario: 'Caught from kayak near Long Beach harbor with 12" pliers for scale. Measured 17.5" total length.',
    legalStatus: 'UNDERSIZED',
    waterType: 'California Coastal / Ocean',
    estimatedLength: 17.5,
    referenceObject: 'Fishing pliers (~7.5 inches) alongside fish',
    imageUrl: createSampleFishSvg('California Halibut', '#78716c', '#44403c', 'flat', 'Pliers 7.5" alongside'),
    expectedResult: {
      fishIdentified: true,
      commonName: 'California Halibut',
      scientificName: 'Paralichthys californicus',
      family: 'Paralichthyidae',
      confidenceLevel: 'HIGH',
      confidenceScore: 0.98,
      waterHabitat: 'California Ocean / Coastal',
      identificationFeatures: [
        'Prominent high arch in the lateral line directly above pectoral fin',
        'Large mouth armed with sharp, sharp predatory canine teeth',
        'Both eyes situated on the dark patterned surface with mottled sandy camouflage',
      ],
      lookAlikesComparison: [
        {
          similarSpecies: 'Pacific Halibut (Hippoglossus stenolepis)',
          howToDistinguish: 'Pacific Halibut has a much smaller mouth without prominent canines, diamond-shaped tail, and arched lateral line is flatter.',
          californiaRisk: 'Pacific Halibut has seasonal quotas and strict open dates under Federal IPHC rules.',
        },
      ],
      estimatedLengthInches: 17.5,
      estimatedLengthCm: 44.5,
      measurementType: 'Total Length (TL)',
      lengthEstimationRationale: 'Visual calibration against standard 7.5-inch fishing pliers placed parallel to body. Total length snout to pinched tail tip is approximately 17.5 inches.',
      isDangerousOrVenomous: false,
      dangerLevel: 'CAUTION',
      dangerDetails: 'Sharp canine teeth and strong head-thrashing; handle with lip grip or wet cloth away from mouth.',
      safeHandlingProtocol: 'Use wet hands to avoid removing protective slime coat. Unhook quickly at water level or on wet deck board. Release tail-first into current.',
      californiaRegulations: {
        legalStatus: 'UNDERSIZED',
        minimumSizeInches: 22,
        maximumSizeInches: 0,
        sizeRuleSummary: 'Minimum 22 inches total length (CCR Title 14 § 28.06). Measured from tip of snout with mouth closed to longest tail lobe.',
        bagLimit: '5 fish/day south of Pt Sur; 3 fish/day north of Pt Sur',
        cdfwCodeSection: 'CCR Title 14 § 28.06',
        openSeasonSummary: 'Open year-round in California ocean waters.',
        penaltiesWarning: 'Retaining undersized California Halibut carries fines starting at $500+, court penalty assessments, and potential license suspension.',
        conservationClassification: 'Managed California Gamefish',
      },
      verdict: {
        canKeep: false,
        headline: 'ILLEGAL TO KEEP — UNDERSIZED BY 4.5 INCHES',
        detailedReason: 'This California Halibut measures approximately 17.5 inches total length, falling 4.5 inches below the California legal minimum size limit of 22 inches (CCR Title 14 § 28.06).',
        requiredAction: 'RELEASE IMMEDIATELY UNHARMED. Keep fish in water while unhooking or return to sea with minimal air exposure.',
      },
      culinaryProfile: {
        isEdible: true,
        tasteAndTextureRating: 'Prized table fish when legal (sweet, delicate white flakes). Must not be retained.',
        californiaHealthAdvisory: 'OEHHA advises moderate consumption for adult legal halibut due to coastal mercury concentrations.',
      },
    },
  },
  {
    id: 'sample-sculpin-venomous',
    title: 'California Scorpionfish / Sculpin (11.2 in)',
    subtitle: 'KEEPABLE SIZE BUT VENOMOUS DANGER!',
    speciesName: 'California Scorpionfish (Sculpin)',
    scenario: 'Hooked off rocky reef near Point Loma, San Diego. Estimated 11.2 inches. Highly venomous dorsal spines.',
    legalStatus: 'KEEPABLE',
    waterType: 'California Ocean / Saltwater',
    estimatedLength: 11.2,
    referenceObject: 'Standard 4.8" aluminum soda can on deck',
    imageUrl: createSampleFishSvg('California Scorpionfish', '#dc2626', '#991b1b', 'sculpin', 'Soda Can 4.8" on deck'),
    expectedResult: {
      fishIdentified: true,
      commonName: 'California Scorpionfish (Sculpin)',
      scientificName: 'Scorpaena guttata',
      family: 'Scorpaenidae',
      confidenceLevel: 'HIGH',
      confidenceScore: 0.99,
      waterHabitat: 'California Ocean / Coastal Reefs',
      identificationFeatures: [
        'Mottled reddish-brown body with dark crimson spots and spiny armored head',
        'Long venomous dorsal spines along the entire back ridge and anal fin',
        'Broad fan-like pectoral fins with fleshy lobes',
      ],
      lookAlikesComparison: [
        {
          similarSpecies: 'Cabezon & Rockfish (Sebastes spp.)',
          howToDistinguish: 'California Scorpionfish has a much wider armored head with prominent venomous spines and characteristic red mottling.',
          californiaRisk: 'Failure to recognize this fish results in accidental stings leading to severe incapacitating venom poisoning.',
        },
      ],
      estimatedLengthInches: 11.2,
      estimatedLengthCm: 28.4,
      measurementType: 'Total Length (TL)',
      lengthEstimationRationale: 'Visual comparison against 4.8-inch soda can placed on deck. Total length is approximately 11.2 inches, exceeding the 10-inch California minimum.',
      isDangerousOrVenomous: true,
      dangerLevel: 'CRITICAL_HAZARD',
      dangerDetails: 'POTENT NEUROTOXIN IN SPINES: Dorsal and anal spines inject venom causing excruciating, agonizing, throbbing pain, numbness, swelling, vomiting, and cardiovascular distress.',
      safeHandlingProtocol: 'EXTREME CAUTION: Never grasp barehanded! Secure fish with a sturdy metal lip gripper or long pliers by the lower lip. If retaining, immediately snip off dorsal and anal spines with heavy wire shears before putting in cooler. FIRST AID FOR STING: Soak affected limb in hot water (110°-113°F) for 30-90 minutes to neutralize heat-labile venom proteins.',
      californiaRegulations: {
        legalStatus: 'KEEPABLE',
        minimumSizeInches: 10,
        maximumSizeInches: 0,
        sizeRuleSummary: 'Minimum 10 inches total length (CCR Title 14 § 28.50).',
        bagLimit: '5 fish/day within the 10-fish total rockfish/scorpionfish aggregate',
        cdfwCodeSection: 'CCR Title 14 § 28.50',
        openSeasonSummary: 'Open year-round for boat and shore anglers in Southern California waters.',
        penaltiesWarning: 'Taking undersized sculpin (<10") violates CCR Title 14 § 28.50.',
        conservationClassification: 'Managed California Groundfish',
      },
      verdict: {
        canKeep: true,
        headline: 'LEGAL SIZE (11.2") — CRITICAL VENOM WARNING!',
        detailedReason: 'Meets the 10-inch California minimum size limit and is legal to keep. However, it possesses dangerous venomous spines requiring expert handling.',
        requiredAction: 'Handle with lip gripper or pliers only. Clip spines before placing on ice to protect everyone handling the cooler.',
      },
      culinaryProfile: {
        isEdible: true,
        tasteAndTextureRating: 'Extremely prized in Southern California. Legendary as the best fish taco meat: remarkably sweet, firm, white, lobster-like texture.',
      },
    },
  },
  {
    id: 'sample-giant-sea-bass-protected',
    title: 'Giant Sea Bass (48 in)',
    subtitle: 'CRITICALLY PROTECTED — 100% Prohibited',
    speciesName: 'Giant Sea Bass (Black Sea Bass)',
    scenario: 'Incidental catch near Catalina Island kelp forest. Estimated 48 inches / 80 lbs. Fully protected by California law.',
    legalStatus: 'PROTECTED_STRICTLY_PROHIBITED',
    waterType: 'California Ocean / Kelp Beds',
    estimatedLength: 48,
    referenceObject: 'Boat gunwale and fighting belt (~32 inches)',
    imageUrl: createSampleFishSvg('Giant Sea Bass', '#334155', '#0f172a', 'bass', 'Gunwale & Belt 32"'),
    expectedResult: {
      fishIdentified: true,
      commonName: 'Giant Sea Bass (Black Sea Bass)',
      scientificName: 'Stereolepis gigas',
      family: 'Polyprionidae',
      confidenceLevel: 'HIGH',
      confidenceScore: 0.99,
      waterHabitat: 'California Kelp Forests & Deep Reefs',
      identificationFeatures: [
        'Massive, deep-bodied wreckfish silhouette with broad flat head and huge rounded caudal fin',
        'Dark brownish-black back with faint large dark spots scattered across flanks',
        'Large mouth with thick lips and tiny bristling teeth',
      ],
      lookAlikesComparison: [
        {
          similarSpecies: 'Kelp Bass (Calico Bass) & White Seabass',
          howToDistinguish: 'Giant Sea Bass is extraordinarily bulky with huge dorsal spines, rounded tail (not forked or squared), and grows up to 500+ lbs.',
          californiaRisk: 'Mistaking a young Giant Sea Bass for a keeper Calico Bass leads to felony poaching citations.',
        },
      ],
      estimatedLengthInches: 48,
      estimatedLengthCm: 122,
      measurementType: 'Total Length (TL)',
      lengthEstimationRationale: 'Large body spans across fighting belt and gunwale sections, indicating a sub-adult Giant Sea Bass of approximately 48 inches (~80 lbs).',
      isDangerousOrVenomous: false,
      dangerLevel: 'CRITICAL_HAZARD',
      dangerDetails: 'EXTREME LEGAL & CONSERVATION HAZARD: Critically Endangered species protected under CCR Title 14 § 28.10. Taking or possessing is a misdemeanor/felony with fines exceeding $10,000, boat impoundment, and jail time.',
      safeHandlingProtocol: 'DO NOT BOAT OR GAFF! Keep fish submerged in the water alongside the boat. Cut line as close to the hook as safely possible without dragging fish over gunwale. If barotrauma bloated, use a heavy descending device or seaqualizer to return fish to depth immediately.',
      californiaRegulations: {
        legalStatus: 'PROTECTED_STRICTLY_PROHIBITED',
        minimumSizeInches: 0,
        maximumSizeInches: 0,
        sizeRuleSummary: 'STRICTLY PROHIBITED TO TAKE OR POSSESS IN CALIFORNIA (CCR Title 14 § 28.10).',
        bagLimit: '0 fish — Immediate release mandatory',
        cdfwCodeSection: 'CCR Title 14 § 28.10',
        openSeasonSummary: 'Closed year-round statewide indefinitely.',
        penaltiesWarning: 'CDFW enforcement treats retention as severe poaching: fines up to $10,000+, loss of California fishing privileges, and criminal misdemeanor record.',
        conservationClassification: 'Critically Endangered / California Protected Marine Species',
      },
      verdict: {
        canKeep: false,
        headline: 'STRICTLY PROHIBITED SPECIES — DO NOT RETAIN!',
        detailedReason: 'Giant Sea Bass (Stereolepis gigas) is a fully protected endangered species in California waters under CCR Title 14 § 28.10. Possession is strictly illegal regardless of size.',
        requiredAction: 'RELEASE IMMEDIATELY. Leave in water alongside vessel, unhook or cut leader, and descend if showing barotrauma.',
      },
      culinaryProfile: {
        isEdible: false,
        tasteAndTextureRating: 'ILLEGAL TO POSSESS OR CONSUME.',
      },
    },
  },
  {
    id: 'sample-white-seabass-legal',
    title: 'White Seabass (31.5 in)',
    subtitle: 'LEGAL KEEPER — Exceeds 28" Minimum',
    speciesName: 'White Seabass',
    scenario: 'Taken on live squid near Santa Cruz Island. Measured 31.5 inches total length. Legal keeper!',
    legalStatus: 'KEEPABLE',
    waterType: 'California Ocean / Channel Islands',
    estimatedLength: 31.5,
    referenceObject: 'CDFW calibrated fish measuring deck sticker (36 inches)',
    imageUrl: createSampleFishSvg('White Seabass', '#0284c7', '#0369a1', 'torpedo', 'Deck Sticker 36"'),
    expectedResult: {
      fishIdentified: true,
      commonName: 'White Seabass',
      scientificName: 'Atractoscion nobilis',
      family: 'Sciaenidae',
      confidenceLevel: 'HIGH',
      confidenceScore: 0.97,
      waterHabitat: 'California Ocean / Island Kelp Beds',
      identificationFeatures: [
        'Distinct raised ridge (keel) along midline of the belly',
        'Metallic bluish-gray back shading to bright silver sides with faint iridescent bronze cast',
        'Large mouth with distinct yellow interior and no chin barbel',
      ],
      lookAlikesComparison: [
        {
          similarSpecies: 'Corvina & Yellowtail',
          howToDistinguish: 'White Seabass is distinguished by the centerline keel on the belly and absence of yellow stripe or yellow tail fin.',
        },
      ],
      estimatedLengthInches: 31.5,
      estimatedLengthCm: 80,
      measurementType: 'Total Length (TL)',
      lengthEstimationRationale: 'Aligned against 36-inch California boat deck measuring decal. Tip of closed snout at 0", pinched caudal fin reaches 31.5 inches.',
      isDangerousOrVenomous: false,
      dangerLevel: 'SAFE',
      safeHandlingProtocol: 'Support horizontally under chest and tail. Bleed immediately from gill arch and pack with ice for highest table quality.',
      californiaRegulations: {
        legalStatus: 'KEEPABLE',
        minimumSizeInches: 28,
        maximumSizeInches: 0,
        sizeRuleSummary: 'Minimum 28 inches total length (CCR Title 14 § 28.35).',
        bagLimit: '3 fish/day (1 fish/day between March 15 and June 15 south of Pt Conception)',
        cdfwCodeSection: 'CCR Title 14 § 28.35',
        openSeasonSummary: 'Open year-round with seasonal spring bag restriction.',
        penaltiesWarning: 'Taking undersized White Seabass (<28") carries fines and confiscation.',
        conservationClassification: 'Managed California Sport Trophy Gamefish',
      },
      verdict: {
        canKeep: true,
        headline: 'LEGAL TO KEEP — EXCEEDS 28-INCH MINIMUM BY 3.5"',
        detailedReason: 'At 31.5 inches total length, this White Seabass legally exceeds the California minimum requirement of 28 inches under CCR Title 14 § 28.35.',
        requiredAction: 'Legal to harvest. Ensure you have a valid California Sport Fishing License and Ocean Enhancement Stamp.',
      },
      culinaryProfile: {
        isEdible: true,
        tasteAndTextureRating: 'Premier world-class table fish. Exceptionally moist, mild, thick white flakes with high omega-3 richness.',
      },
    },
  },
  {
    id: 'sample-coho-salmon-endangered',
    title: 'Coho Salmon (24 in)',
    subtitle: 'ENDANGERED — Prohibited Look-Alike',
    speciesName: 'Coho Salmon (Silver Salmon)',
    scenario: 'Ocean troll off Monterey Bay. White gums visible in mouth. Protected species; cannot be kept.',
    legalStatus: 'PROTECTED_STRICTLY_PROHIBITED',
    waterType: 'California Ocean / Anadromous',
    estimatedLength: 24,
    referenceObject: 'Fishing rod cork handle (~14 inches)',
    imageUrl: createSampleFishSvg('Coho Salmon', '#475569', '#334155', 'torpedo', 'Rod Cork Handle 14"'),
    expectedResult: {
      fishIdentified: true,
      commonName: 'Coho Salmon (Silver Salmon)',
      scientificName: 'Oncorhynchus kisutch',
      family: 'Salmonidae',
      confidenceLevel: 'HIGH',
      confidenceScore: 0.96,
      waterHabitat: 'California Ocean / Coastal Rivers',
      identificationFeatures: [
        'WHITE LOWER GUMS with dark jaw base (absolute key discriminator against Chinook Salmon)',
        'Small dark spots on the UPPER lobe of the tail fin only (none on lower lobe)',
        'Bright silver flank and metallic greenish-blue back',
      ],
      lookAlikesComparison: [
        {
          similarSpecies: 'Chinook Salmon (King Salmon, Oncorhynchus tshawytscha)',
          howToDistinguish: 'Chinook Salmon has solid ALL-BLACK gums at base of teeth and spots across BOTH lobes of the caudal fin. Coho has distinct WHITE gums.',
          californiaRisk: 'Coho Salmon is an Endangered Species Act (ESA) protected species. Anglers mistaking Coho for Chinook face severe federal and state ESA poaching fines.',
        },
      ],
      estimatedLengthInches: 24,
      estimatedLengthCm: 61,
      measurementType: 'Total Length (TL)',
      lengthEstimationRationale: 'Visual comparison against 14-inch rod handle yields approximately 24 inches total length.',
      isDangerousOrVenomous: false,
      dangerLevel: 'CAUTION',
      dangerDetails: 'FEDERAL & STATE ESA PROTECTED: Zero retention permitted anywhere in California.',
      safeHandlingProtocol: 'Keep in water! Use single barbless hook rules. Gently unhook with pliers without removing fish from ocean surface.',
      californiaRegulations: {
        legalStatus: 'PROTECTED_STRICTLY_PROHIBITED',
        minimumSizeInches: 0,
        maximumSizeInches: 0,
        sizeRuleSummary: 'STRICTLY 0 TAKE — Coho Salmon is 100% prohibited in all California ocean and inland waters.',
        bagLimit: '0 fish — Mandatory immediate release',
        cdfwCodeSection: 'CCR Title 14 § 27.80 & Federal Endangered Species Act',
        openSeasonSummary: 'Closed year-round statewide.',
        penaltiesWarning: 'Federal ESA violations carry penalties up to $25,000+ per violation and possible criminal prosecution.',
        conservationClassification: 'Federally Endangered (ESA) & California State Endangered',
      },
      verdict: {
        canKeep: false,
        headline: 'PROHIBITED SPECIES — COHO SALMON (WHITE GUMS)',
        detailedReason: 'White gums confirm this is a Coho Salmon. In California, all wild and hatchery Coho salmon are strictly protected and illegal to retain under CCR Title 14 § 27.80.',
        requiredAction: 'RELEASE IMMEDIATELY WITHOUT REMOVING FROM WATER. Do not lift into boat.',
      },
      culinaryProfile: {
        isEdible: false,
        tasteAndTextureRating: 'ILLEGAL TO POSSESS OR CONSUME.',
      },
    },
  },
  {
    id: 'sample-calico-bass-legal',
    title: 'Kelp Bass / Calico Bass (15.5 in)',
    subtitle: 'LEGAL KEEPER — Exceeds 14" Minimum',
    speciesName: 'Kelp Bass (Calico Bass)',
    scenario: 'Landed in kelp bed off Palos Verdes. Measured 15.5 inches. Legal keeper (>14").',
    legalStatus: 'KEEPABLE',
    waterType: 'California Ocean / Kelp Beds',
    estimatedLength: 15.5,
    referenceObject: '12-inch measuring board on skiff',
    imageUrl: createSampleFishSvg('Kelp Bass', '#15803d', '#166534', 'bass', 'Measuring Board 12"'),
    expectedResult: {
      fishIdentified: true,
      commonName: 'Kelp Bass (Calico Bass)',
      scientificName: 'Paralabrax clathratus',
      family: 'Serranidae',
      confidenceLevel: 'HIGH',
      confidenceScore: 0.98,
      waterHabitat: 'California Ocean / Kelp Canopy',
      identificationFeatures: [
        'Checkerboard pale square blotches on dark olive-brown back',
        'Third and fourth dorsal spines approximately equal in length',
        'Yellowish-orange fins and golden-brown eye rim',
      ],
      lookAlikesComparison: [
        {
          similarSpecies: 'Barred Sand Bass (Paralabrax nebulifer)',
          howToDistinguish: 'Barred Sand Bass has vertical dark bars and a distinctly elongated third dorsal spine. Kelp Bass has checkerboard square patterns.',
        },
      ],
      estimatedLengthInches: 15.5,
      estimatedLengthCm: 39.4,
      measurementType: 'Total Length (TL)',
      lengthEstimationRationale: 'Visual measurement against calibrated 12-inch measuring board indicates 15.5 inches total length.',
      isDangerousOrVenomous: false,
      dangerLevel: 'CAUTION',
      dangerDetails: 'Stiff dorsal spines and sharp gill rakers; use thumb bass-grip or lip tool.',
      safeHandlingProtocol: 'Thumb inside lower jaw, four fingers supporting under jaw. Beware of dorsal spines when thrashing.',
      californiaRegulations: {
        legalStatus: 'KEEPABLE',
        minimumSizeInches: 14,
        maximumSizeInches: 0,
        sizeRuleSummary: 'Minimum 14 inches total length (CCR Title 14 § 28.30).',
        bagLimit: '5 fish/day in aggregate with Sand Bass and Spotted Sand Bass',
        cdfwCodeSection: 'CCR Title 14 § 28.30',
        openSeasonSummary: 'Open year-round in California ocean waters.',
        penaltiesWarning: 'Possessing calico bass under 14 inches results in CDFW citations and fines.',
        conservationClassification: 'Managed California Coastal Gamefish',
      },
      verdict: {
        canKeep: true,
        headline: 'LEGAL TO KEEP — EXCEEDS 14-INCH MINIMUM (15.5")',
        detailedReason: 'At 15.5 inches total length, this Kelp Bass meets and exceeds the California Department of Fish and Wildlife 14-inch legal size requirement under CCR Title 14 § 28.30.',
        requiredAction: 'Legal to keep. Note: Kelp bass take 5+ years to reach legal size, so many sport fishermen choose to release breeding females.',
      },
      culinaryProfile: {
        isEdible: true,
        tasteAndTextureRating: 'Excellent white, firm, sweet meat. Delicious pan-fried or broiled with lemon herb butter.',
      },
    },
  },
];
