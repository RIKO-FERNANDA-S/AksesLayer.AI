// src/app/sandbox/page.tsx
"use client";

import React, { useState } from "react";
import {
  calculateDeterministicTriage,
  MitigationPlanOutput,
  VulnerableCategory,
} from "@/lib/triage-engine";

export default function SandboxAuditPage() {
  const [category, setCategory] = useState<VulnerableCategory>(
    "FULL_WHEELCHAIR_OR_BLIND"
  );
  const [helpersCount, setHelpersCount] = useState<number>(2);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<MitigationPlanOutput | null>(null);

  // Kompresi gambar di browser menggunakan HTML5 Canvas (< 150KB)
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 800;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = img.width > MAX_WIDTH ? MAX_WIDTH : img.width;
        canvas.height = img.width > MAX_WIDTH ? img.height * scaleSize : img.height;

        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        setPreviewUrl(dataUrl);
        const base64Clean = dataUrl.split(",")[1] || null;
        setImageBase64(base64Clean);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleRunAudit = async () => {
    if (!imageBase64) {
      setErrorMsg("Pilih foto kamar terlebih dahulu!");
      return;
    }
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/sandbox-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          mimeType: "image/jpeg",
          vulnerableCategory: category,
          helpersCount,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.details || data.error || "Gagal memproses AI");
      }
      setAiResult(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Terjadi kesalahan sistem";
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  // Fitur "Before-After Verification": Toggle status perbaikan & hitung ulang skor otomatis
  const toggleResolveHazard = (index: number) => {
    if (!aiResult) return;
    const updatedHazards = aiResult.detected_hazards.map((item, idx) =>
      idx === index ? { ...item, is_resolved: !item.is_resolved } : item
    );
    setAiResult({ ...aiResult, detected_hazards: updatedHazards });
  };

  // Kalkulasi skor secara reaktif
  const triageStats = aiResult
    ? calculateDeterministicTriage(category, aiResult.detected_hazards, helpersCount)
    : null;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6 font-sans">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold text-slate-900">
          Sandbox: AI Room Risk Auditor &amp; Dynamic Triage Engine
        </h1>
        <p className="text-sm text-slate-600">
          Latihan modul inti untuk persiapan 24-Hour Hacking Day &amp; Demo Video Hackvidia 11.0
        </p>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-300 text-red-700 rounded-lg text-sm font-medium">
          ⚠️ {errorMsg}
        </div>
      )}

      {/* Form Input Keluarga */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-5 rounded-xl border">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1 text-slate-800">
              1. Foto Kamar / Akses Keluar
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1 text-slate-800">
              2. Kategori Kerentanan (V_profile)
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as VulnerableCategory)}
              className="w-full p-2 border rounded-lg bg-white text-sm text-slate-800"
            >
              <option value="FULL_WHEELCHAIR_OR_BLIND">
                Kursi Roda Penuh / Tunanetra Total (Skor 100)
              </option>
              <option value="ELDERLY_CANE_OR_DEAF">
                Lansia dengan Tongkat / Tunarungu (Skor 70)
              </option>
              <option value="MODERATE_VULNERABLE">
                Kerentanan Sedang / Ibu Hamil (Skor 40)
              </option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1 text-slate-800">
              3. Jumlah Pendamping Sehat di Rumah (C_deficit)
            </label>
            <input
              id="numeric-input"
              type="text"
              inputMode="numeric"
              min={0}
              max={10}
              value={helpersCount}
              onChange={(e) => setHelpersCount(Number(e.target.value))}
              className="w-full p-2 border rounded-lg bg-white text-sm text-slate-800"
            />
          </div>

          <button
            type="button"
            onClick={handleRunAudit}
            disabled={loading || !imageBase64}
            className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white font-semibold rounded-lg transition cursor-pointer"
          >
            {loading
              ? "🔍 AI Sedang Menganalisis Ruangan..."
              : "🚀 Jalankan Audit AI & Hitung Skor"}
          </button>
        </div>

        {/* Preview Gambar */}
        <div className="flex items-center justify-center border-2 border-dashed rounded-lg bg-white min-h-[200px] overflow-hidden p-2">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Preview Kamar"
              className="max-h-60 object-contain rounded"
            />
          ) : (
            <span className="text-sm text-slate-400 text-center">
              Preview foto terkompresi (&lt;150KB) akan muncul di sini
            </span>
          )}
        </div>
      </div>

      {/* Hasil Analisis & Simulasi Before-After */}
      {aiResult && triageStats && (
        <div className="space-y-6">
          {/* Panel Skor Triase Komunitas */}
          <div className="p-5 rounded-xl bg-slate-900 text-white flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
              <span className="text-xs uppercase tracking-wider text-slate-400">
                Data Sinkronisasi Dashboard Komunitas / RT
              </span>
              <h2 className="text-xl font-bold mt-1">
                Status: {triageStats.priorityCategory.replace("_", " ")}
              </h2>
              <p className="text-sm text-slate-300 mt-1">
                📢 <strong>Instruksi RT:</strong>{" "}
                {aiResult.community_triage_metadata.public_dispatch_note}
              </p>
            </div>
            <div className="text-center bg-slate-800 px-6 py-3 rounded-lg border border-slate-700 min-w-[160px]">
              <div className="text-3xl font-extrabold text-amber-400">
                {triageStats.finalScore}
              </div>
              <div className="text-xs text-slate-400">Skor Prioritas (0-100)</div>
              <div className="text-[11px] text-slate-500 mt-1">
                V:{triageStats.vProfile} | H:{triageStats.hRoom} | C:{triageStats.cDeficit}
              </div>
            </div>
          </div>

          {/* Daftar Bahaya Ruangan + Tombol Verifikasi Perbaikan */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-slate-900">
              ⚠️ Temuan Bahaya Spasial (Klik tombol untuk simulasi Before-After)
            </h3>
            {aiResult.detected_hazards.map((hazard, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-xl border transition ${
                  hazard.is_resolved
                    ? "bg-emerald-50 border-emerald-300 opacity-75"
                    : "bg-white border-slate-200"
                }`}
              >
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <span
                      className={`inline-block px-2 py-0.5 text-xs font-bold rounded mr-2 ${
                        hazard.is_resolved
                          ? "bg-emerald-600 text-white"
                          : hazard.risk_level === "HIGH"
                          ? "bg-red-600 text-white"
                          : "bg-amber-500 text-white"
                      }`}
                    >
                      {hazard.is_resolved ? "RESOLVED ✓" : hazard.risk_level}
                    </span>
                    <strong
                      className={
                        hazard.is_resolved
                          ? "line-through text-slate-500"
                          : "text-slate-900"
                      }
                    >
                      {hazard.object_or_area}
                    </strong>
                    <p className="text-sm text-slate-600 mt-1">{hazard.reason}</p>
                    <p className="text-sm font-medium text-blue-700 mt-1">
                      🛠️ Solusi: {hazard.quick_fix_action}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleResolveHazard(idx)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg shrink-0 cursor-pointer ${
                      hazard.is_resolved
                        ? "bg-slate-200 text-slate-700"
                        : "bg-emerald-600 text-white hover:bg-emerald-700"
                    }`}
                  >
                    {hazard.is_resolved ? "Batalkan" : "✓ Tandai Sudah Diperbaiki"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Rencana Aksi Keluarga (SOP) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border bg-white space-y-2">
              <h4 className="font-bold text-slate-900">
                📋 Pembagian Tugas Evakuasi ({aiResult.family_action_plan.estimated_evacuation_minutes} Menit)
              </h4>
              <ul className="space-y-2 text-sm text-slate-700">
                {aiResult.family_action_plan.role_assignments.map((role, rIdx) => (
                  <li key={rIdx} className="p-2 bg-slate-50 rounded border">
                    <strong className="block text-slate-900">{role.member_role}:</strong>
                    <span>{role.specific_task}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-4 rounded-xl border bg-white space-y-2">
              <h4 className="font-bold text-slate-900">🎒 Isi Tas Siaga Spesifik</h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-slate-700">
                {aiResult.family_action_plan.emergency_bag_essentials.map((item, bIdx) => (
                  <li key={bIdx}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}