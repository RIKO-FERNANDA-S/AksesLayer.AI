// src/lib/triage-engine.ts

export type VulnerableCategory = 
  | "FULL_WHEELCHAIR_OR_BLIND" 
  | "ELDERLY_CANE_OR_DEAF" 
  | "MODERATE_VULNERABLE";

export interface DetectedHazard {
  object_or_area: string;
  risk_level: "HIGH" | "MEDIUM" | "LOW";
  reason: string;
  quick_fix_action: string;
  is_resolved?: boolean; // State untuk fitur Before-After Verification
}

export interface MitigationPlanOutput {
  detected_hazards: DetectedHazard[];
  family_action_plan: {
    estimated_evacuation_minutes: number;
    role_assignments: {
      member_role: string;
      specific_task: string;
    }[];
    emergency_bag_essentials: string[];
  };
  community_triage_metadata: {
    public_dispatch_note: string;
  };
}

// Fungsi Deterministik untuk menghitung Skor Prioritas (S_priority) sesuai Bab 3 Proposal
export function calculateDeterministicTriage(
  category: VulnerableCategory,
  hazards: DetectedHazard[],
  healthyHelpersCount: number
) {
  // 1. Skor Kerentanan Individu (V_profile - Bobot 45%)
  const vProfileMap: Record<VulnerableCategory, number> = {
    FULL_WHEELCHAIR_OR_BLIND: 100,
    ELDERLY_CANE_OR_DEAF: 70,
    MODERATE_VULNERABLE: 40,
  };
  const vProfile = vProfileMap[category] ?? 70;

  // 2. Skor Bahaya Ruangan (H_room - Bobot 35%)
  // Hanya menghitung bahaya yang BELUM diperbaiki (!is_resolved)
  const activeHazards = hazards.filter((h) => !h.is_resolved);
  const rawRoomScore = activeHazards.reduce((sum, item) => {
    if (item.risk_level === "HIGH") return sum + 30;
    if (item.risk_level === "MEDIUM") return sum + 15;
    return sum + 5;
  }, 0);
  const hRoom = Math.min(100, rawRoomScore);

  // 3. Defisit Pendamping (C_deficit - Bobot 20%)
  let cDeficit = 30;
  if (healthyHelpersCount <= 0) cDeficit = 100;
  else if (healthyHelpersCount === 1) cDeficit = 70;

  // Rumus Akhir: S_priority = (0.45 * V_profile) + (0.35 * H_room) + (0.20 * C_deficit)
  const finalScore = Number(
    (0.45 * vProfile + 0.35 * hRoom + 0.2 * cDeficit).toFixed(1)
  );

  let priorityCategory: "CRITICAL_PRIORITY" | "HIGH_PRIORITY" | "MODERATE" = "MODERATE";
  if (finalScore >= 75) priorityCategory = "CRITICAL_PRIORITY";
  else if (finalScore >= 50) priorityCategory = "HIGH_PRIORITY";

  return { vProfile, hRoom, cDeficit, finalScore, priorityCategory };
}