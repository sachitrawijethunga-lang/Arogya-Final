import type {
  RelationshipKey,
  MaritalKey,
  OccupationKey,
  EducationKey,
} from "../types";

export const RELATIONSHIP_KEYS: RelationshipKey[] = [
  "spouse", "child", "parent", "head", "brother", "sister",
  "grandparent", "grandchild", "daughterInLaw", "sonInLaw",
];

export const MARITAL_KEYS: MaritalKey[] = [
  "single", "married", "divorced", "separated", "widowed", "notStated",
];

export const OCCUPATION_KEYS: OccupationKey[] = [
  "unemployed", "selfEmployment", "privateSector", "foreignLabour",
  "government", "semiGovernment", "contractBasis", "farmer",
  "factoryWorker", "labour", "pension", "other",
];

export const EDUCATION_KEYS: EducationKey[] = [
  "none", "primary", "secondary", "advanced", "diploma",
  "bachelor", "postgraduate",
];

// Placeholder GN divisions for the Kirinda Udapalatha area.
// TO BE REPLACED by a backend-driven, per-clinic option set.
export const GN_DIVISION_PLACEHOLDERS: string[] = [
  "Kirinda", "Udapalatha", "Galpoththawala", "Deltota", "Pussellawa",
  "Gampola", "Hindagala", "Doluwa", "Nawalapitiya", "Ulapane",
];
