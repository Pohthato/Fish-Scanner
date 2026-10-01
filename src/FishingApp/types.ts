export type LegalStatus =
  | 'KEEPABLE'
  | 'UNDERSIZED'
  | 'OVERSIZED_SLOT'
  | 'PROTECTED_STRICTLY_PROHIBITED'
  | 'CLOSED_SEASON'
  | 'UNREGULATED_NO_LIMIT';

export type DangerLevel = 'SAFE' | 'CAUTION' | 'DANGEROUS' | 'CRITICAL_HAZARD';

export interface LookAlike {
  similarSpecies: string;
  howToDistinguish: string;
  californiaRisk?: string;
}

export interface CaliforniaRegulations {
  legalStatus: LegalStatus;
  minimumSizeInches: number;
  maximumSizeInches: number;
  sizeRuleSummary: string;
  bagLimit: string;
  possessionLimit?: string;
  cdfwCodeSection: string;
  openSeasonSummary?: string;
  descendingDeviceAdvised?: boolean;
  specialReportCardOrPermit?: string;
  penaltiesWarning?: string;
  conservationClassification?: string;
}

export interface Verdict {
  canKeep: boolean;
  headline: string;
  detailedReason: string;
  requiredAction: string;
}

export interface CulinaryProfile {
  isEdible: boolean;
  tasteAndTextureRating: string;
  californiaHealthAdvisory?: string;
}

export interface FishAnalysisResult {
  fishIdentified: boolean;
  commonName: string;
  scientificName: string;
  family: string;
  confidenceScore?: number;
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  waterHabitat: string;
  identificationFeatures: string[];
  lookAlikesComparison?: LookAlike[];
  estimatedLengthInches: number;
  estimatedLengthCm?: number;
  measurementType: 'Total Length (TL)' | 'Fork Length (FL)' | string;
  lengthEstimationRationale: string;
  isDangerousOrVenomous: boolean;
  dangerLevel: DangerLevel;
  dangerDetails?: string;
  safeHandlingProtocol?: string;
  californiaRegulations: CaliforniaRegulations;
  verdict: Verdict;
  culinaryProfile: CulinaryProfile;
}

export interface CatchLogEntry {
  id: string;
  timestamp: string;
  imagePreview: string;
  commonName: string;
  scientificName: string;
  estimatedLengthInches: number;
  verdict: Verdict;
  legalStatus: LegalStatus;
  isDangerous: boolean;
  locationNotes?: string;
  waterType?: string;
  notes?: string;
}

export interface ReferencePreset {
  id: string;
  label: string;
  lengthInches: number;
  description: string;
  iconName?: string;
}

export interface SampleCatch {
  id: string;
  title: string;
  subtitle: string;
  speciesName: string;
  scenario: string;
  legalStatus: LegalStatus;
  imageUrl: string;
  waterType: string;
  estimatedLength: number;
  referenceObject: string;
  expectedResult: FishAnalysisResult;
}
