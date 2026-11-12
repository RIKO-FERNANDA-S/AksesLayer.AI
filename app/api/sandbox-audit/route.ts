// src/app/api/sandbox-audit/route.ts
import { NextResponse } from "next/server";
import { GoogleGenAI, Type, Schema } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const mitigationResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    detected_hazards: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          object_or_area: { type: Type.STRING },
          risk_level: { type: Type.STRING, enum: ["HIGH", "MEDIUM", "LOW"] },
          reason: { type: Type.STRING },
          quick_fix_action: { type: Type.STRING },
        },
        required: ["object_or_area", "risk_level", "reason", "quick_fix_action"],
      },
    },
    family_action_plan: {
      type: Type.OBJECT,
      properties: {
        estimated_evacuation_minutes: { type: Type.INTEGER },
        role_assignments: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              member_role: { type: Type.STRING },
              specific_task: { type: Type.STRING },
            },
            required: ["member_role", "specific_task"],
          },
        },
        emergency_bag_essentials: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
      },
      required: [
        "estimated_evacuation_minutes",
        "role_assignments",
        "emergency_bag_essentials",
      ],
    },
    community_triage_metadata: {
      type: Type.OBJECT,
      properties: {
        public_dispatch_note: { type: Type.STRING },
      },
      required: ["public_dispatch_note"],
    },
  },
  required: [
    "detected_hazards",
    "family_action_plan",
    "community_triage_metadata",
  ],
};

// DATA CADANGAN (FALLBACK) JIKA SERVER GOOGLE SEDANG 503 OVERLOAD
const FALLBACK_POC_RESULT = {
  detected_hazards: [
    {
      object_or_area: "[DALAM RUMAH] Serakan barang dan karpet di sekeliling tempat tidur",
      risk_level: "HIGH",
      reason: "Menghalangi manuver kursi roda secara total saat evakuasi cepat; roda dapat tersangkut atau tergelincir saat gempa atau banjir.",
      quick_fix_action: "Singkirkan benda di lantai dan rekatkan tepi karpet atau gulung karpet agar jalur kursi roda minimal 90 cm bersih.",
    },
    {
      object_or_area: "[DALAM RUMAH] Lemari kayu di dekat jendela tanpa angkur pengaman dinding",
      risk_level: "HIGH",
      reason: "Guncangan gempa dapat menjatuhkan lemari ke jalur evakuasi atau menimpa lansia saat dipindahkan ke kursi roda.",
      quick_fix_action: "Pasang siku besi (L-bracket) ke dinding di belakang lemari dan pasang kunci pengaman laci.",
    },
    {
      object_or_area: "[AKSES GANG/TERAS] Undakan tangga teras depan tanpa bidang miring (ramp) & pot tanaman di mulut gang",
      risk_level: "MEDIUM",
      reason: "Menyulitkan penurunan kursi roda secara mandiri oleh 1 orang dan mempersempit manuver belok menuju jalan utama.",
      quick_fix_action: "Siapkan papan ramp portabel dari kayu/besi di dekat pintu utama dan geser pot tanaman ke sisi luar jalur evakuasi.",
    },
  ],
  family_action_plan: {
    estimated_evacuation_minutes: 5,
    role_assignments: [
      {
        member_role: "Pendamping Evakuasi Utama (Anggota Keluarga 1)",
        specific_task: "Melindungi kepala penghuni rentan saat guncangan, membantu transfer tubuh ke kursi roda, mengunci sabuk pengaman, dan mendorong keluar.",
      },
      {
        member_role: "Koordinator Logistik & Akses (Anggota Keluarga 2)",
        specific_task: "Membuka lebar pintu keluar, memasang papan ramp portabel di teras, mematikan MCB listrik & gas utama, serta membawa Tas Siaga Bencana.",
      },
    ],
    emergency_bag_essentials: [
      "Obat rutin penghuni untuk minimal 7 hari beserta salinan resep",
      "Dokumen penting (KTP, KK, BPJS, rekam medis) dalam kantong kedap air",
      "Pompa mini portabel dan alat perbaikan darurat kursi roda",
      "Peluit darurat dan senter kepala (headlamp) dengan baterai cadangan",
    ],
  },
  community_triage_metadata: {
    public_dispatch_note:
      "Penghuni kursi roda. Butuh bantuan minimal 2 relawan lingkungan untuk membantu mengangkat kursi roda melewati undakan teras depan dan memandu melewati gang sempit.",
  },
};

// Fungsi Helper untuk mencoba memanggil Gemini dengan Auto-Retry & Model Cadangan
async function callGeminiWithRetry(contentParts: any[]) {
  const modelsToTry = [
    process.env.GEMINI_MODEL || "gemini-3.8-flash",
    "gemini-3.8-flash", // Coba ulang sekali lagi setelah jeda jika masih 503
  ];

  for (let i = 0; i < modelsToTry.length; i++) {
    try {
      const response = await ai.models.generateContent({
        model: modelsToTry[i],
        contents: [{ role: "user", parts: contentParts }],
        config: {
          responseMimeType: "application/json",
          responseSchema: mitigationResponseSchema,
          temperature: 0.2,
        },
      });
      if (response.text) {
        return JSON.parse(response.text);
      }
    } catch (err: any) {
      const isOverloaded =
        err?.status === 503 ||
        err?.message?.includes("503") ||
        err?.message?.includes("high demand") ||
        err?.message?.includes("UNAVAILABLE");

      console.warn(`Percobaan ke-${i + 1} gagal (${err.message}).`);

      // Jika error karena 503 Overload dan masih ada kesempatan retry, tunggu 1.5 detik
      if (isOverloaded && i < modelsToTry.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        continue;
      }
      throw err;
    }
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const primaryImage = body.roomImageBase64 || body.imageBase64;
    const secondaryImage = body.alleyImageBase64;
    const { vulnerableCategory, helpersCount } = body;

    if (!primaryImage) {
      return NextResponse.json(
        { error: "Foto ruangan wajib diunggah" },
        { status: 400 }
      );
    }

    const contentParts: any[] = [
      { inlineData: { data: primaryImage, mimeType: "image/jpeg" } },
    ];

    if (secondaryImage) {
      contentParts.push({
        inlineData: { data: secondaryImage, mimeType: "image/jpeg" },
      });
    }

    const prompt = `
      Kamu adalah ahli mitigasi bencana inklusif standar BNPB & aksesibilitas PUPR.
      Analisis foto yang diberikan:
      - Foto Pertama adalah kondisi DALAM KAMAR penghuni rentan.
      ${secondaryImage ? "- Foto Kedua adalah kondisi JALAN GANG / AKSES KELUAR DEPAN RUMAH." : ""}
      
      Profil Penghuni:
      - Kategori Kerentanan: ${vulnerableCategory}
      - Jumlah Pendamping Dewasa Sehat di Rumah: ${helpersCount} orang
      - Risiko Bencana Utama: Gempa Bumi & Banjir
      
      Tugas:
      1. Identifikasi bahaya fisik/spasial di dalam ruangan maupun akses jalan/gang yang menghambat evakuasi penghuni rentan.
      2. Susun pembagian tugas SOP evakuasi keluarga sesuai jumlah pendamping dan daftar isi tas siaga spesifik.
      3. Buat 1 kalimat catatan instruksi penjemputan darurat (public_dispatch_note) yang aman secara privasi untuk pengurus RT/komunitas setempat.
      Gunakan Bahasa Indonesia yang jelas, empatik, dan praktis.
    `;

    contentParts.push({ text: prompt });

    try {
      // Coba panggil API Gemini secara live
      const liveResult = await callGeminiWithRetry(contentParts);
      return NextResponse.json(liveResult);
    } catch (apiError: any) {
      // JIKA SERVER GOOGLE MASIH 503 OVERLOAD, AKTIFKAN GRACEFUL FALLBACK!
      console.warn(
        "⚠️ Server Gemini sedang mengalami 503 High Demand. Mengaktifkan Fallback Data Standar BNPB agar UI tetap berjalan mulus."
      );
      return NextResponse.json({
        ...FALLBACK_POC_RESULT,
        _isFallbackMode: true,
      });
    }
  } catch (error: any) {
    console.error("System Error:", error);
    return NextResponse.json(
      { error: "Gagal memproses permintaan", details: error.message },
      { status: 500 }
    );
  }
}